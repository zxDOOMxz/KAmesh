// ============================================================
// Mash — UpdateService: OTA-обновления через BLE mesh + интернет
// ============================================================
// Распространяет APK через BLE mesh-сеть: телефон с новой
// версией рассылает манифест, другие телефоны скачивают чанки
// по BLE напрямую или через интернет (если есть).
//
// После установки — при следующем запуске показываем changelog.
// ============================================================

import { Platform, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { MeshService } from './MeshService';
import { getNodeId, getJson, setJson, deleteKey, containsKey } from './StorageService';
import {
  MeshPacket,
  MessageType,
  NodeId,
  UpdateManifest,
  UpdateChunk,
  UpdateChunkRequest,
  ChangelogEntry,
} from '../types';
import {
  UPDATE_CHUNK_SIZE,
  UPDATE_CHANGELOG_KEY,
  UPDATE_FLAG_KEY,
  APP_VERSION,
  APP_VERSION_CODE,
  UPDATE_APK_FILENAME,
  MESH_TTL_MAX,
} from '../constants';

// ============================================================
// Состояние загрузки обновления
// ============================================================

interface DownloadState {
  manifest: UpdateManifest;
  chunks: Map<number, string>;
  receivedIndices: Set<number>;
  seeders: Set<NodeId>;
  startedAt: number;
}

type UpdateListener = (event: UpdateEvent) => void;

interface UpdateEvent {
  type: 'progress' | 'complete' | 'error' | 'manifest_received';
  progress?: number;
  version?: string;
  changelog?: string[];
  error?: string;
}

// ============================================================
// UpdateService — синглтон
// ============================================================

class UpdateServiceClass {
  private initialized = false;
  private currentVersion = APP_VERSION;
  private currentVersionCode = APP_VERSION_CODE;
  private pendingChangelog: ChangelogEntry | null = null;
  private activeDownload: DownloadState | null = null;
  private myNodeId: NodeId = '';
  private listeners: UpdateListener[] = [];

  // Манифест и APK, которые этот узел может раздавать
  private localManifest: UpdateManifest | null = null;
  private localApkBase64: string | null = null;
  private localApkPath: string | null = null;

  // ==========================================================
  // Инициализация
  // ==========================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.myNodeId = getNodeId() || '';

      // Загружаем changelog, оставшийся после обновления
      this.pendingChangelog = getJson<ChangelogEntry>(UPDATE_CHANGELOG_KEY);
      if (this.pendingChangelog) {
        deleteKey(UPDATE_CHANGELOG_KEY);
      }

      // Если приложение было только что установлено — очищаем флаг
      if (containsKey(UPDATE_FLAG_KEY)) {
        deleteKey(UPDATE_FLAG_KEY);
      }

      // Подписываемся на mesh-пакеты обновлений
      const unsubscribe = MeshService.onPacket(this.handleMeshPacket.bind(this));

      this.initialized = true;
      console.warn('[UpdateService] Инициализирован');
    } catch (err) {
      console.warn('[UpdateService] Ошибка инициализации:', err);
      throw err;
    }
  }

  // ==========================================================
  // Публичные методы
  // ==========================================================

  /** Получить changelog, если приложение было обновлено */
  getPendingChangelog(): ChangelogEntry | null {
    return this.pendingChangelog;
  }

  /** Скрыть changelog (пользователь нажал "Закрыть") */
  dismissChangelog(): void {
    this.pendingChangelog = null;
  }

  /**
   * Зарегистрировать локальный APK для раздачи через mesh.
   * Вызывается, когда устройство скачало новую версию (из интернета или вручную).
   */
  async registerUpdate(
    apkPath: string,
    version: string,
    versionCode: number,
    changelog: string[],
    downloadUrl?: string,
  ): Promise<void> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(apkPath);
      if (!fileInfo.exists || !fileInfo.size) {
        throw new Error('APK не найден');
      }

      this.localApkPath = apkPath;

      // Читаем весь APK в base64 для последующей раздачи по чанкам
      this.localApkBase64 = await FileSystem.readAsStringAsync(apkPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const totalChunks = Math.ceil(fileInfo.size / UPDATE_CHUNK_SIZE);

      // Вычисляем SHA-256 хеш файла
      const fileHash = this.computeHashBase64(this.localApkBase64);

      this.localManifest = {
        version,
        versionCode,
        totalSize: fileInfo.size,
        chunkSize: UPDATE_CHUNK_SIZE,
        totalChunks,
        fileHash,
        changelog,
        timestamp: Date.now(),
        senderId: this.myNodeId,
        packageName: 'com.mash.offline',
        downloadUrl,
      };

      console.warn(
        `[UpdateService] APK зарегистрирован: ${version} (${versionCode}), ` +
        `${totalChunks} чанков, ${(fileInfo.size / 1024 / 1024).toFixed(1)} MB`,
      );
    } catch (err) {
      console.warn('[UpdateService] Ошибка регистрации обновления:', err);
      throw err;
    }
  }

  /** Начать широковещательную рассылку манифеста через mesh */
  async broadcastManifest(): Promise<void> {
    if (!this.localManifest) {
      throw new Error('Сначала вызови registerUpdate()');
    }

    const payload = JSON.stringify(this.localManifest);
    await MeshService.sendMessage(
      MessageType.UPDATE_MANIFEST,
      payload,
      'broadcast',
    );

    console.warn('[UpdateService] Манифест разослан в mesh');
  }

  /** Подписаться на события обновления */
  onEvent(handler: UpdateListener): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter(h => h !== handler);
    };
  }

  /** Получить прогресс текущей загрузки (0–100) */
  getDownloadProgress(): number | null {
    if (!this.activeDownload) return null;
    const { receivedIndices, manifest } = this.activeDownload;
    return Math.round((receivedIndices.size / manifest.totalChunks) * 100);
  }

  /** Проверить, идёт ли загрузка */
  isDownloading(): boolean {
    return this.activeDownload !== null;
  }

  /** Текущая версия приложения */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  getCurrentVersionCode(): number {
    return this.currentVersionCode;
  }

  // ==========================================================
  // Обработка mesh-пакетов
  // ==========================================================

  private async handleMeshPacket(packet: MeshPacket, relayId: NodeId): Promise<void> {
    switch (packet.type) {
      case MessageType.UPDATE_MANIFEST:
        await this.handleManifestReceived(packet);
        break;

      case MessageType.UPDATE_CHUNK_REQUEST:
        await this.handleChunkRequest(packet, relayId);
        break;

      case MessageType.UPDATE_CHUNK:
        await this.handleChunkReceived(packet);
        break;
    }
  }

  // ==========================================================
  // Получение манифеста — начало загрузки
  // ==========================================================

  private async handleManifestReceived(packet: MeshPacket): Promise<void> {
    try {
      const manifest: UpdateManifest = JSON.parse(packet.payload);

      if (manifest.packageName !== 'com.mash.offline') return;
      if (manifest.versionCode <= this.currentVersionCode) return;
      if (this.activeDownload?.manifest.versionCode === manifest.versionCode) return;

      console.warn(
        `[UpdateService] Получен манифест v${manifest.version} ` +
        `(${(manifest.totalSize / 1024 / 1024).toFixed(1)} MB, ` +
        `${manifest.totalChunks} чанков) от ${manifest.senderId}`,
      );

      // Сообщаем UI
      this.notifyListeners({
        type: 'manifest_received',
        version: manifest.version,
        changelog: manifest.changelog,
      });

      // Начинаем загрузку
      this.activeDownload = {
        manifest,
        chunks: new Map(),
        receivedIndices: new Set(),
        seeders: new Set([manifest.senderId]),
        startedAt: Date.now(),
      };

      // Пробуем скачать через интернет (если есть URL и сеть)
      if (manifest.downloadUrl) {
        const success = await this.downloadFromInternet(manifest);
        if (success) return;
      }

      // Скачиваем через BLE от пиров
      await this.requestNextChunks();
    } catch (err) {
      console.warn('[UpdateService] Ошибка обработки манифеста:', err);
    }
  }

  // ==========================================================
  // Загрузка через интернет
  // ==========================================================

  private async downloadFromInternet(manifest: UpdateManifest): Promise<boolean> {
    if (!manifest.downloadUrl) return false;

    try {
      console.warn('[UpdateService] Скачивание через интернет...');

      const dest = `${FileSystem.cacheDirectory}${UPDATE_APK_FILENAME}`;
      const result = await FileSystem.downloadAsync(manifest.downloadUrl, dest);

      if (!result.uri) {
        throw new Error('Download failed');
      }

      // Проверяем хеш
      const downloadedBase64 = await FileSystem.readAsStringAsync(result.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const hash = this.computeHashBase64(downloadedBase64);
      if (hash !== manifest.fileHash) {
        throw new Error('Хеш не совпадает');
      }

      console.warn('[UpdateService] Скачивание через интернет завершено');
      await this.installUpdate(result.uri, manifest);
      return true;
    } catch (err) {
      console.warn('[UpdateService] Ошибка интернет-загрузки:', err);
      return false;
    }
  }

  // ==========================================================
  // Загрузка чанков через BLE
  // ==========================================================

  /** Запрашивает следующие недостающие чанки у пиров */
  private async requestNextChunks(): Promise<void> {
    if (!this.activeDownload) return;

    const { manifest, receivedIndices, seeders } = this.activeDownload;

    // Находим недостающие чанки
    const missing: number[] = [];
    for (let i = 0; i < manifest.totalChunks; i++) {
      if (!receivedIndices.has(i)) {
        missing.push(i);
      }
    }

    if (missing.length === 0) {
      await this.finalizeDownload();
      return;
    }

    // Запрашиваем по 5 чанков за раз у каждого seedera
    const batchSize = 5;
    for (const seederId of seeders) {
      if (missing.length === 0) break;

      const fromIdx = missing[0];
      const toIdx = Math.min(fromIdx + batchSize - 1, manifest.totalChunks - 1);

      const request: UpdateChunkRequest = {
        manifestVersionCode: manifest.versionCode,
        fromIndex: fromIdx,
        toIndex: toIdx,
        requesterId: this.myNodeId,
      };

      await MeshService.sendMessage(
        MessageType.UPDATE_CHUNK_REQUEST,
        JSON.stringify(request),
        seederId,
      );

      // Убираем запрошенные из missing (чтобы не запрашивать повторно)
      for (let i = fromIdx; i <= toIdx; i++) {
        const idx = missing.indexOf(i);
        if (idx !== -1) missing.splice(idx, 1);
      }
    }

    // Обновляем прогресс
    this.notifyListeners({ type: 'progress', progress: this.getDownloadProgress() ?? 0 });

    // Если не запросили ничего (все seeders не в сети), ждём следующего цикла
    if (missing.length > 0) {
      console.warn('[UpdateService] Нет доступных пиров с обновлением, ждём...');
    }
  }

  // ==========================================================
  // Обработка запроса чанков (мы — seeder)
  // ==========================================================

  private async handleChunkRequest(packet: MeshPacket, relayId: NodeId): Promise<void> {
    try {
      if (!this.localManifest || !this.localApkBase64) return;

      const request: UpdateChunkRequest = JSON.parse(packet.payload);
      if (request.manifestVersionCode !== this.localManifest.versionCode) return;

      const totalChunks = this.localManifest.totalChunks;

      for (let i = request.fromIndex; i <= request.toIndex && i < totalChunks; i++) {
        const startOffset = i * UPDATE_CHUNK_SIZE;
        const base64Len = this.localApkBase64.length;
        // В base64 каждый байт кодируется как ~1.33 символа
        // chunkSize байт = chunkSize * 4/3 символов base64
        const chunkBase64Len = Math.ceil(UPDATE_CHUNK_SIZE * 4 / 3);
        const chunkEnd = Math.min(startOffset + chunkBase64Len, base64Len);
        const chunkData = this.localApkBase64.slice(startOffset, chunkEnd);

        const updateChunk: UpdateChunk = {
          manifestVersionCode: request.manifestVersionCode,
          chunkIndex: i,
          data: chunkData,
          totalChunks,
          senderId: this.myNodeId,
        };

        await MeshService.sendMessage(
          MessageType.UPDATE_CHUNK,
          JSON.stringify(updateChunk),
          request.requesterId,
        );
      }
    } catch (err) {
      console.warn('[UpdateService] Ошибка отправки чанка:', err);
    }
  }

  // ==========================================================
  // Получение чанка (мы — загрузчик)
  // ==========================================================

  private async handleChunkReceived(packet: MeshPacket): Promise<void> {
    try {
      if (!this.activeDownload) return;

      const chunk: UpdateChunk = JSON.parse(packet.payload);
      if (chunk.manifestVersionCode !== this.activeDownload.manifest.versionCode) return;

      // Дедупликация
      if (this.activeDownload.receivedIndices.has(chunk.chunkIndex)) return;

      this.activeDownload.chunks.set(chunk.chunkIndex, chunk.data);
      this.activeDownload.receivedIndices.add(chunk.chunkIndex);
      this.activeDownload.seeders.add(chunk.senderId);

      // Отправляем прогресс
      const progress = this.getDownloadProgress() ?? 0;
      this.notifyListeners({ type: 'progress', progress });

      // Проверяем, все ли чанки получены
      if (this.activeDownload.receivedIndices.size >= chunk.totalChunks) {
        await this.finalizeDownload();
      } else {
        // Запрашиваем следующие чанки
        await this.requestNextChunks();
      }
    } catch (err) {
      console.warn('[UpdateService] Ошибка получения чанка:', err);
    }
  }

  // ==========================================================
  // Финализация: сборка, проверка, установка
  // ==========================================================

  private async finalizeDownload(): Promise<void> {
    if (!this.activeDownload) return;

    const { manifest, chunks } = this.activeDownload;
    console.warn('[UpdateService] Все чанки получены, сборка APK...');

    try {
      // Собираем все чанки в один base64
      let fullBase64 = '';
      for (let i = 0; i < manifest.totalChunks; i++) {
        const chunk = chunks.get(i);
        if (!chunk) {
          throw new Error(`Отсутствует чанк ${i}, запрашиваю заново`);
        }
        fullBase64 += chunk;
      }

      // Проверяем хеш
      const hash = this.computeHashBase64(fullBase64);
      if (hash !== manifest.fileHash) {
        throw new Error(`Хеш не совпадает: ${hash} !== ${manifest.fileHash}`);
      }

      // Сохраняем APK
      const apkPath = `${FileSystem.cacheDirectory}${UPDATE_APK_FILENAME}`;
      await FileSystem.writeAsStringAsync(apkPath, fullBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.warn('[UpdateService] APK сохранён, хеш совпадает. Установка...');

      // Сохраняем changelog для показа при следующем запуске
      const entry: ChangelogEntry = {
        version: manifest.version,
        versionCode: manifest.versionCode,
        changelog: manifest.changelog,
        installedAt: Date.now(),
      };
      setJson(UPDATE_CHANGELOG_KEY, entry);

      // Устанавливаем
      await this.installUpdate(apkPath, manifest);

      this.notifyListeners({
        type: 'complete',
        version: manifest.version,
        changelog: manifest.changelog,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Неизвестная ошибка';
      console.warn('[UpdateService] Ошибка финализации:', errorMsg);
      this.notifyListeners({ type: 'error', error: errorMsg });

      // Сбрасываем, чтобы можно было начать заново
      this.activeDownload = null;
    }
  }

  // ==========================================================
  // Установка APK
  // ==========================================================

  private async installUpdate(apkPath: string, manifest: UpdateManifest): Promise<void> {
    if (Platform.OS !== 'android') {
      console.warn('[UpdateService] Автообновление только для Android');
      return;
    }

    try {
      // Получаем content:// URI через expo-file-system
      const contentUri = await FileSystem.getContentUriAsync(apkPath);

      // Открываем системный установщик
      await Linking.openURL(contentUri);

      console.warn(`[UpdateService] Запущен установщик для v${manifest.version}`);

      // После установки приложение перезапустится
      // При следующем запуске pendingChangelog покажет changelog
      this.activeDownload = null;
    } catch (err) {
      console.warn('[UpdateService] Ошибка установки:', err);
      throw err;
    }
  }

  // ==========================================================
  // Хеширование
  // ==========================================================

  private computeHashBase64(base64Data: string): string {
    try {
      // Декодируем base64 в байты
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const hashBytes = sha256(bytes);
      return bytesToHex(hashBytes);
    } catch (err) {
      console.warn('[UpdateService] Ошибка вычисления хеша:', err);
      return 'hash_error';
    }
  }

  private notifyListeners(event: UpdateEvent): void {
    for (const handler of this.listeners) {
      try { handler(event); } catch { /* ignore */ }
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

/** Единственный экземпляр UpdateService */
export const UpdateService = new UpdateServiceClass();
