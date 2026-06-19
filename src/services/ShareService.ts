import { Platform, Alert, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { MeshService } from './MeshService';
import { ContactService } from './ContactService';
import { getNodeId } from './StorageService';
import {
  MeshPacket,
  MessageType,
  NodeId,
  ContactEntry,
} from '../types';
import {
  UPDATE_CHUNK_SIZE,
  APP_VERSION,
  APP_VERSION_CODE,
  UPDATE_APK_FILENAME,
  COLORS,
} from '../constants';

// ============================================================
// Типы событий ShareService
// ============================================================

export type ShareEvent =
  | { type: 'request_received'; fromPeer: NodeId; fromNickname: string }
  | { type: 'accepted'; toPeer: NodeId }
  | { type: 'rejected'; toPeer: NodeId }
  | { type: 'progress'; progress: number }
  | { type: 'complete' }
  | { type: 'error'; error: string }
  | { type: 'cancelled' }
  | { type: 'chunk_received'; progress: number }
  | { type: 'transfer_complete' }
  | { type: 'ready_for_install' };

type ShareListener = (event: ShareEvent) => void;

// ============================================================
// Состояние передачи
// ============================================================

interface TransferState {
  peerId: NodeId;
  direction: 'send' | 'receive';
  apkBase64: string;
  totalChunks: number;
  receivedChunks: Map<number, string>;
  receivedIndices: Set<number>;
  startedAt: number;
  sessionId: string;
}

// ============================================================
// ShareService — синглтон
// ============================================================

class ShareServiceClass {
  private myNodeId: NodeId = '';
  private initialized = false;
  private listeners: ShareListener[] = [];
  private activeTransfer: TransferState | null = null;
  private localApkBase64: string | null = null;
  private localApkSize: number = 0;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.myNodeId = getNodeId() || '';

    MeshService.onPacket(this.handlePacket.bind(this));

    this.initialized = true;
    console.warn('[ShareService] Инициализирован');
  }

  // ==========================================================
  // Регистрация APK для раздачи
  // ==========================================================

  async registerLocalApk(): Promise<boolean> {
    try {
      let apkPath: string | null = null;

      // Сначала пробуем APK от OTA-обновления
      const otaPath = `${FileSystem.cacheDirectory}${UPDATE_APK_FILENAME}`;
      const otaInfo = await FileSystem.getInfoAsync(otaPath);
      if (otaInfo.exists && otaInfo.size && otaInfo.size > 0) {
        apkPath = otaPath;
      }

      // На Android пробуем прочитать APK установленного приложения
      if (!apkPath && Platform.OS === 'android') {
        try {
          // Используем экспозицию через content://
          const srcPath = `${FileSystem.cacheDirectory}kamesh-source.apk`;
          const srcExists = await FileSystem.getInfoAsync(srcPath);
          if (srcExists.exists && srcExists.size && srcExists.size > 0) {
            apkPath = srcPath;
          }
        } catch { /* ignore */ }
      }

      if (!apkPath) {
        console.warn('[ShareService] APK не найден. Скачайте обновление через OTA или поместите APK в кеш.');
        return false;
      }

      this.localApkBase64 = await FileSystem.readAsStringAsync(apkPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      this.localApkSize = this.localApkBase64.length;

      console.warn(
        `[ShareService] APK зарегистрирован: ${(this.localApkSize / 1024 / 1024).toFixed(1)} MB`,
      );
      return true;
    } catch (err) {
      console.warn('[ShareService] Ошибка регистрации APK:', err);
      return false;
    }
  }

  /** Задать путь к APK вручную */
  async registerApkFromPath(apkPath: string): Promise<boolean> {
    try {
      const info = await FileSystem.getInfoAsync(apkPath);
      if (!info.exists || !info.size) return false;

      this.localApkBase64 = await FileSystem.readAsStringAsync(apkPath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      this.localApkSize = this.localApkBase64.length;
      return true;
    } catch {
      return false;
    }
  }

  hasRegisteredApk(): boolean {
    return this.localApkBase64 !== null;
  }

  // ==========================================================
  // Отправка APK пиру
  // ==========================================================

  async sendApk(peerId: NodeId): Promise<void> {
    if (!this.localApkBase64) {
      const registered = await this.registerLocalApk();
      if (!registered) {
        this.notifyListeners({ type: 'error', error: 'APK не найден. Сначала получите обновление.' });
        return;
      }
    }

    const sessionId = `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const chunkSizeB64 = Math.ceil(UPDATE_CHUNK_SIZE * 4 / 3);
    const totalChunks = Math.ceil(this.localApkSize / chunkSizeB64);

    // Отправляем запрос пиру
    const requestPayload = JSON.stringify({
      sessionId,
      totalSize: this.localApkSize,
      totalChunks,
      chunkSize: UPDATE_CHUNK_SIZE,
      senderNickname: ContactService.getMyNickname() || this.myNodeId.slice(0, 8),
    });

    await MeshService.sendMessage(
      MessageType.SHARE_APK_REQUEST,
      requestPayload,
      peerId,
    );

    this.activeTransfer = {
      peerId,
      direction: 'send',
      apkBase64: this.localApkBase64!,
      totalChunks,
      receivedChunks: new Map(),
      receivedIndices: new Set(),
      startedAt: Date.now(),
      sessionId,
    };

    console.warn(`[ShareService] Запрос на отправку APK отправлен ${peerId}`);
  }

  // ==========================================================
  // Обработка входящих пакетов
  // ==========================================================

  private async handlePacket(packet: MeshPacket): Promise<void> {
    switch (packet.type) {
      case MessageType.SHARE_APK_REQUEST:
        await this.handleRequest(packet);
        break;
      case MessageType.SHARE_APK_ACCEPT:
        await this.handleAccept(packet);
        break;
      case MessageType.SHARE_APK_REJECT:
        await this.handleReject(packet);
        break;
      case MessageType.SHARE_APK_CHUNK:
        await this.handleChunk(packet);
        break;
      case MessageType.SHARE_APK_DONE:
        await this.handleDone(packet);
        break;
    }
  }

  // ==========================================================
  // Получен запрос на передачу
  // ==========================================================

  private async handleRequest(packet: MeshPacket): Promise<void> {
    try {
      const data = JSON.parse(packet.payload);
      const senderNickname = data.senderNickname || packet.sourceId.slice(0, 8);

      console.warn(`[ShareService] Запрос APK от ${senderNickname}`);

      this.activeTransfer = {
        peerId: packet.sourceId,
        direction: 'receive',
        apkBase64: '',
        totalChunks: data.totalChunks,
        receivedChunks: new Map(),
        receivedIndices: new Set(),
        startedAt: Date.now(),
        sessionId: data.sessionId,
      };

      this.notifyListeners({
        type: 'request_received',
        fromPeer: packet.sourceId,
        fromNickname: senderNickname,
      });
    } catch (err) {
      console.warn('[ShareService] Ошибка обработки запроса:', err);
    }
  }

  async acceptIncoming(accept: boolean): Promise<void> {
    if (!this.activeTransfer || this.activeTransfer.direction !== 'receive') return;

    const peerId = this.activeTransfer.peerId;

    if (accept) {
      await MeshService.sendMessage(
        MessageType.SHARE_APK_ACCEPT,
        JSON.stringify({ accepted: true, sessionId: this.activeTransfer.sessionId }),
        peerId,
      );
    } else {
      await MeshService.sendMessage(
        MessageType.SHARE_APK_REJECT,
        JSON.stringify({ accepted: false }),
        peerId,
      );
      this.activeTransfer = null;
    }
  }

  // ==========================================================
  // Пик принял/отклонил запрос
  // ==========================================================

  private async handleAccept(packet: MeshPacket): Promise<void> {
    if (!this.activeTransfer || this.activeTransfer.direction !== 'send') return;

    console.warn(`[ShareService] Пик ${packet.sourceId} принял APK, начинаем передачу`);

    this.notifyListeners({ type: 'accepted', toPeer: packet.sourceId });

    // Начинаем отправлять чанки
    await this.sendNextChunks(0);
  }

  private async handleReject(packet: MeshPacket): Promise<void> {
    if (!this.activeTransfer || this.activeTransfer.direction !== 'send') return;

    console.warn(`[ShareService] Пик ${packet.sourceId} отклонил APK`);

    this.notifyListeners({ type: 'rejected', toPeer: packet.sourceId });
    this.activeTransfer = null;
  }

  // ==========================================================
  // Отправка чанков
  // ==========================================================

  private async sendNextChunks(fromIndex: number): Promise<void> {
    if (!this.activeTransfer || this.activeTransfer.direction !== 'send') return;

    const { apkBase64, totalChunks, peerId, sessionId } = this.activeTransfer;
    const chunkSizeB64 = Math.ceil(UPDATE_CHUNK_SIZE * 4 / 3);
    const batchSize = 5;
    const endIndex = Math.min(fromIndex + batchSize, totalChunks);

    for (let i = fromIndex; i < endIndex; i++) {
      const b64Start = i * chunkSizeB64;
      const b64End = Math.min(b64Start + chunkSizeB64, apkBase64.length);
      const chunkData = apkBase64.slice(b64Start, b64End);

      const chunkPayload = JSON.stringify({
        sessionId,
        chunkIndex: i,
        data: chunkData,
        totalChunks,
        totalSize: apkBase64.length,
      });

      await MeshService.sendMessage(
        MessageType.SHARE_APK_CHUNK,
        chunkPayload,
        peerId,
      );
    }

    const progress = Math.round((endIndex / totalChunks) * 100);
    this.notifyListeners({ type: 'progress', progress });

    if (endIndex >= totalChunks) {
      // Все чанки отправлены
      await MeshService.sendMessage(
        MessageType.SHARE_APK_DONE,
        JSON.stringify({ sessionId, totalChunks }),
        peerId,
      );
      this.notifyListeners({ type: 'complete' });
      this.activeTransfer = null;
    } else {
      // Отправляем следующую пачку через небольшую задержку
      setTimeout(() => this.sendNextChunks(endIndex), 100);
    }
  }

  // ==========================================================
  // Получение чанка
  // ==========================================================

  private async handleChunk(packet: MeshPacket): Promise<void> {
    if (!this.activeTransfer || this.activeTransfer.direction !== 'receive') return;

    try {
      const chunk = JSON.parse(packet.payload);
      if (chunk.sessionId !== this.activeTransfer.sessionId) return;
      if (this.activeTransfer.receivedIndices.has(chunk.chunkIndex)) return;

      this.activeTransfer.receivedChunks.set(chunk.chunkIndex, chunk.data);
      this.activeTransfer.receivedIndices.add(chunk.chunkIndex);

      const progress = Math.round(
        (this.activeTransfer.receivedIndices.size / this.activeTransfer.totalChunks) * 100,
      );
      this.notifyListeners({ type: 'chunk_received', progress });
    } catch (err) {
      console.warn('[ShareService] Ошибка получения чанка:', err);
    }
  }

  // ==========================================================
  // Передача завершена — сборка APK
  // ==========================================================

  private async handleDone(packet: MeshPacket): Promise<void> {
    if (!this.activeTransfer || this.activeTransfer.direction !== 'receive') return;

    try {
      console.warn('[ShareService] Все чанки получены, собираем APK...');

      // Собираем все чанки
      let fullBase64 = '';
      for (let i = 0; i < this.activeTransfer.totalChunks; i++) {
        const chunk = this.activeTransfer.receivedChunks.get(i);
        if (!chunk) {
          throw new Error(`Отсутствует чанк ${i}`);
        }
        fullBase64 += chunk;
      }

      // Сохраняем APK
      const apkPath = `${FileSystem.cacheDirectory}${UPDATE_APK_FILENAME}`;
      await FileSystem.writeAsStringAsync(apkPath, fullBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.warn('[ShareService] APK сохранён');

      this.notifyListeners({ type: 'transfer_complete' });
      this.notifyListeners({ type: 'ready_for_install' });

      this.activeTransfer = null;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка сборки APK';
      console.warn('[ShareService] Ошибка:', errorMsg);
      this.notifyListeners({ type: 'error', error: errorMsg });
      this.activeTransfer = null;
    }
  }

  // ==========================================================
  // Установка полученного APK
  // ==========================================================

  async installReceivedApk(): Promise<void> {
    if (Platform.OS !== 'android') {
      console.warn('[ShareService] Установка только для Android');
      return;
    }

    try {
      const apkPath = `${FileSystem.cacheDirectory}${UPDATE_APK_FILENAME}`;
      const contentUri = await FileSystem.getContentUriAsync(apkPath);
      await Linking.openURL(contentUri);
      console.warn('[ShareService] Запущен установщик');
    } catch (err) {
      console.warn('[ShareService] Ошибка установки:', err);
      Alert.alert('Ошибка', 'Не удалось запустить установку. Попробуйте найти APK вручную.');
    }
  }

  /** Проверить, установлен ли KAmesh на устройстве получателя */
  async checkAppInstalled(): Promise<boolean> {
    try {
      // Простейшая проверка: пытаемся открыть deep link приложения
      const canOpen = await Linking.canOpenURL('kamesh://');
      return canOpen;
    } catch {
      return false;
    }
  }

  // ==========================================================
  // Получение активной передачи
  // ==========================================================

  getActiveTransfer(): TransferState | null {
    return this.activeTransfer;
  }

  isSending(): boolean {
    return this.activeTransfer !== null && this.activeTransfer.direction === 'send';
  }

  isReceiving(): boolean {
    return this.activeTransfer !== null && this.activeTransfer.direction === 'receive';
  }

  // ==========================================================
  // Управление слушателями
  // ==========================================================

  onEvent(handler: ShareListener): () => void {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter(h => h !== handler);
    };
  }

  private notifyListeners(event: ShareEvent): void {
    for (const handler of this.listeners) {
      try { handler(event); } catch { /* ignore */ }
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const ShareService = new ShareServiceClass();
