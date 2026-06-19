// ============================================================
// Mash — BleService: Bluetooth Low Energy связь
// ============================================================
// Отвечает за сканирование BLE-устройств, установление
// соединения, передачу данных через GATT-характеристики
// с учётом лимита MTU = 512 байт.
// ============================================================

import BleManager, {
  BleManagerDidUpdateValueForCharacteristicEvent,
  Peripheral,
  ScanOptions,
} from 'react-native-ble-manager';
import { NativeEventEmitter, NativeModules, Platform, PermissionsAndroid } from 'react-native';
import { BLE_MTU, BLE_PAYLOAD_LIMIT, BLE_SCAN_DURATION_MS, BLE_SCAN_INTERVAL_MS } from '../constants';
import { BLE_SERVICE_UUID, BLE_TX_CHAR_UUID, BLE_RX_CHAR_UUID } from '../types';

// ============================================================
// Типы
// ============================================================

/** Обработчик входящих данных */
type DataHandler = (data: string, peripheralId: string) => void;

/** Обработчик изменения статуса соединения */
type ConnectionHandler = (peripheralId: string, connected: boolean) => void;

/** Обработчик обнаружения нового устройства */
type DiscoveryHandler = (peripheral: Peripheral) => void;

// ============================================================
// BleService — синглтон
// ============================================================

class BleServiceClass {
  private initialized = false;
  private connectedDevices = new Set<string>();
  private dataHandlers: DataHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];
  private discoveryHandlers: DiscoveryHandler[] = [];
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private isScanning = false;

  /** Карта RSSI: peripheralId -> последний известный RSSI */
  private rssiMap = new Map<string, number>();

  /** Буфер для сборки фрагментированных данных */
  private fragmentBuffer = new Map<string, { chunks: string[]; total: number; received: number }>();

  // ==========================================================
  // Инициализация BLE-стека
  // ==========================================================

  /**
   * Запускает BLE-менеджер и подписывается на события.
   * Должен быть вызван перед любыми BLE-операциями.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Запрос разрешений для Android 12+
      if (Platform.OS === 'android') {
        await this.requestAndroidPermissions();
      }

      await BleManager.start({ showAlert: false });

      const eventEmitter = new NativeEventEmitter(NativeModules.BleManager);

      // Подписка на обнаружение новых устройств
      eventEmitter.addListener(
        'BleManagerDiscoverPeripheral',
        this.handleDiscovery.bind(this),
      );

      // Подписка на подключение/отключение
      eventEmitter.addListener(
        'BleManagerConnectPeripheral',
        (event: { peripheral: string }) => {
          this.connectedDevices.add(event.peripheral);
          this.notifyConnection(event.peripheral, true);
        },
      );

      eventEmitter.addListener(
        'BleManagerDisconnectPeripheral',
        (event: { peripheral: string }) => {
          this.connectedDevices.delete(event.peripheral);
          this.notifyConnection(event.peripheral, false);
        },
      );

      // Подписка на входящие данные от характеристики
      eventEmitter.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        this.handleIncomingData.bind(this),
      );

      this.initialized = true;
      console.warn('[BleService] BLE-стек инициализирован');
    } catch (err) {
      console.warn('[BleService] Ошибка инициализации BLE:', err);
      throw err;
    }
  }

  // ==========================================================
  // Сканирование
  // ==========================================================

  /**
   * Запускает циклическое сканирование BLE-устройств.
   * Работает в фоне через setInterval.
   */
  startScanning(): void {
    if (this.scanTimer) return;

    const scan = async () => {
      try {
        if (this.isScanning) return;
        this.isScanning = true;

        await BleManager.scan({
          serviceUUIDs: [BLE_SERVICE_UUID],
          seconds: BLE_SCAN_DURATION_MS / 1000,
        });

        // Останавливаем сканирование через заданное время
        setTimeout(() => {
          this.isScanning = false;
        }, BLE_SCAN_DURATION_MS + 500);
      } catch (err) {
        this.isScanning = false;
        console.warn('[BleService] Ошибка сканирования:', err);
      }
    };

    scan();
    this.scanTimer = setInterval(scan, BLE_SCAN_INTERVAL_MS);
    console.warn('[BleService] Циклическое сканирование запущено');
  }

  /** Останавливает циклическое сканирование */
  stopScanning(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    this.isScanning = false;
    BleManager.stopScan().catch(() => {});
  }

  /** Принудительно запускает одно сканирование */
  async scanOnce(durationMs: number = BLE_SCAN_DURATION_MS): Promise<void> {
    try {
      await BleManager.scan({
        serviceUUIDs: [BLE_SERVICE_UUID],
        seconds: durationMs / 1000,
      });
    } catch (err) {
      console.warn('[BleService] Ошибка одноразового сканирования:', err);
    }
  }

  // ==========================================================
  // Подключение к устройству
  // ==========================================================

  /**
   * Подключается к BLE-устройству и подписывается на RX-характеристику.
   */
  async connectToDevice(peripheralId: string): Promise<void> {
    try {
      if (this.connectedDevices.has(peripheralId)) return;

      await BleManager.connect(peripheralId);
      await BleManager.retrieveServices(peripheralId);

      // Запрашиваем MTU (Android)
      if (Platform.OS === 'android') {
        try {
          await BleManager.requestMTU(peripheralId, BLE_MTU);
        } catch { /* не все устройства поддерживают */ }
      }

      // Подписываемся на уведомления от RX-характеристики
      await BleManager.startNotification(
        peripheralId,
        BLE_SERVICE_UUID,
        BLE_RX_CHAR_UUID,
      );

      this.connectedDevices.add(peripheralId);
      console.warn(`[BleService] Подключено к ${peripheralId}`);
    } catch (err) {
      console.warn(`[BleService] Ошибка подключения к ${peripheralId}:`, err);
      throw err;
    }
  }

  /**
   * Отключается от BLE-устройства.
   */
  async disconnectFromDevice(peripheralId: string): Promise<void> {
    try {
      await BleManager.disconnect(peripheralId, false);
      this.connectedDevices.delete(peripheralId);
      console.warn(`[BleService] Отключено от ${peripheralId}`);
    } catch (err) {
      console.warn(`[BleService] Ошибка отключения от ${peripheralId}:`, err);
    }
  }

  // ==========================================================
  // Отправка данных
  // ==========================================================

  /**
   * Отправляет данные на BLE-устройство.
   * Автоматически фрагментирует сообщение, если оно превышает BLE_PAYLOAD_LIMIT.
   *
   * @param peripheralId — ID устройства-получателя
   * @param data — строка (base64 или json) для отправки
   */
  async sendData(peripheralId: string, data: string): Promise<void> {
    try {
      if (!this.connectedDevices.has(peripheralId)) {
        throw new Error(`[BleService] Устройство ${peripheralId} не подключено`);
      }

      const encoded = await stringToBase64(data);
      const totalBytes = encoded.length;

      // Фрагментируем, если превышает MTU
      if (totalBytes <= BLE_PAYLOAD_LIMIT) {
        await this.writeCharacteristic(peripheralId, encoded);
        return;
      }

      // Фрагментированная отправка
      const sessionId = `${Date.now()}_${peripheralId}`;
      const totalFragments = Math.ceil(totalBytes / BLE_PAYLOAD_LIMIT);

      for (let i = 0; i < totalFragments; i++) {
        const start = i * BLE_PAYLOAD_LIMIT;
        const end = Math.min(start + BLE_PAYLOAD_LIMIT, totalBytes);
        const chunk = encoded.slice(start, end);

        // Заголовок фрагмента: sessionId|index|total|data
        const fragmentPacket = `${sessionId}|${i}|${totalFragments}|${chunk}`;
        await this.writeCharacteristic(peripheralId, fragmentPacket);
      }

      console.warn(
        `[BleService] Отправлено фрагментов: ${totalFragments} для ${peripheralId}`,
      );
    } catch (err) {
      console.warn(`[BleService] Ошибка отправки данных ${peripheralId}:`, err);
      throw err;
    }
  }

  /**
   * Широковещательная отправка всем подключённым устройствам.
   */
  async broadcastData(data: string): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const devId of this.connectedDevices) {
      promises.push(this.sendData(devId, data).catch(() => {}));
    }
    await Promise.all(promises);
  }

  // ==========================================================
  // Регистрация обработчиков
  // ==========================================================

  onData(handler: DataHandler): () => void {
    this.dataHandlers.push(handler);
    return () => {
      this.dataHandlers = this.dataHandlers.filter(h => h !== handler);
    };
  }

  onConnection(handler: ConnectionHandler): () => void {
    this.connectionHandlers.push(handler);
    return () => {
      this.connectionHandlers = this.connectionHandlers.filter(h => h !== handler);
    };
  }

  onDiscovery(handler: DiscoveryHandler): () => void {
    this.discoveryHandlers.push(handler);
    return () => {
      this.discoveryHandlers = this.discoveryHandlers.filter(h => h !== handler);
    };
  }

  /** Возвращает список подключённых устройств */
  getConnectedDevices(): string[] {
    return Array.from(this.connectedDevices);
  }

  /** Проверяет, инициализирован ли сервис */
  isInitialized(): boolean {
    return this.initialized;
  }

  /** Проверяет, подключено ли устройство */
  isConnected(peripheralId: string): boolean {
    return this.connectedDevices.has(peripheralId);
  }

  // ==========================================================
  // Приватные методы
  // ==========================================================

  /**
   * Записывает данные в TX-характеристику BLE-устройства.
   */
  private async writeCharacteristic(
    peripheralId: string,
    base64Data: string,
  ): Promise<void> {
    try {
      const dataBytes = await base64ToArrayBuffer(base64Data);

      await BleManager.writeWithoutResponse(
        peripheralId,
        BLE_SERVICE_UUID,
        BLE_TX_CHAR_UUID,
        Array.from(new Uint8Array(dataBytes)),
        512,
      );
    } catch (err) {
      console.warn('[BleService] Ошибка записи характеристики:', err);
      throw err;
    }
  }

  /**
   * Обрабатывает входящие данные от BLE-характеристики.
   * Собирает фрагментированные сообщения.
   */
  private handleIncomingData(
    event: BleManagerDidUpdateValueForCharacteristicEvent,
  ): void {
    try {
      const { peripheral, value } = event;
      if (!value || !Array.isArray(value)) return;

      // Преобразуем массив байт в строку base64
      const uint8 = new Uint8Array(value);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const rawData = btoa(binary);

      // Проверяем, является ли сообщение фрагментом
      // Формат: sessionId|index|total|data
      const parts = rawData.split('|');
      if (parts.length === 4 && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
        const [sessionId, indexStr, totalStr, chunkData] = parts;
        const index = parseInt(indexStr, 10);
        const total = parseInt(totalStr, 10);

        this.processFragment(sessionId, index, total, chunkData, peripheral);
      } else {
        // Цельное сообщение — уведомляем обработчики
        const decoded = atob(rawData);
        this.notifyDataHandlers(decoded, peripheral);
      }
    } catch (err) {
      console.warn('[BleService] Ошибка обработки входящих данных:', err);
    }
  }

  /**
   * Собирает фрагментированное сообщение.
   * Когда все фрагменты получены — уведомляет обработчики.
   */
  private processFragment(
    sessionId: string,
    index: number,
    total: number,
    chunkData: string,
    peripheral: string,
  ): void {
    try {
      let buffer = this.fragmentBuffer.get(sessionId);

      if (!buffer) {
        buffer = {
          chunks: new Array(total).fill(''),
          total,
          received: 0,
        };
        this.fragmentBuffer.set(sessionId, buffer);
      }

      if (!buffer.chunks[index]) {
        buffer.chunks[index] = chunkData;
        buffer.received += 1;
      }

      // Если все фрагменты получены — собираем и уведомляем
      if (buffer.received === buffer.total) {
        const assembled = buffer.chunks.join('');
        const decoded = atob(assembled);

        this.fragmentBuffer.delete(sessionId);
        this.notifyDataHandlers(decoded, peripheral);
      }
    } catch (err) {
      console.warn('[BleService] Ошибка сборки фрагментов:', err);
      this.fragmentBuffer.delete(sessionId);
    }
  }

  /**
   * Уведомляет всех подписанных обработчиков о входящих данных.
   */
  private notifyDataHandlers(data: string, peripheralId: string): void {
    for (const handler of this.dataHandlers) {
      try {
        handler(data, peripheralId);
      } catch (err) {
        console.warn('[BleService] Ошибка в обработчике данных:', err);
      }
    }
  }

  /**
   * Уведомляет о смене статуса подключения.
   */
  private notifyConnection(peripheralId: string, connected: boolean): void {
    for (const handler of this.connectionHandlers) {
      try {
        handler(peripheralId, connected);
      } catch (err) {
        console.warn('[BleService] Ошибка в обработчике соединения:', err);
      }
    }
  }

  /**
   * Обрабатывает обнаружение нового устройства.
   * Сохраняет RSSI для использования в MeshService.
   */
  private handleDiscovery(event: Peripheral): void {
    try {
      const peripheral: Peripheral = {
        id: event.id,
        name: event.name,
        rssi: event.rssi,
        advertising: event.advertising ?? {},
      };

      // Сохраняем RSSI
      this.rssiMap.set(event.id, event.rssi);

      for (const handler of this.discoveryHandlers) {
        try {
          handler(peripheral);
        } catch (err) {
          console.warn('[BleService] Ошибка в обработчике обнаружения:', err);
        }
      }
    } catch (err) {
      console.warn('[BleService] Ошибка обработки обнаружения:', err);
    }
  }

  /** Возвращает последний известный RSSI для устройства */
  getRssi(peripheralId: string): number {
    return this.rssiMap.get(peripheralId) ?? -100;
  }

  /**
   * Запрашивает разрешения Bluetooth для Android 12+.
   */
  private async requestAndroidPermissions(): Promise<void> {
    try {
      const apiLevel = Platform.Version;
      if (typeof apiLevel === 'number' && apiLevel >= 31) {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
      } else {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
      }
    } catch (err) {
      console.warn('[BleService] Ошибка запроса разрешений Android:', err);
    }
  }
}

// ============================================================
// Вспомогательные функции
// ============================================================

async function stringToBase64(str: string): Promise<string> {
  const uint8 = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

async function base64ToArrayBuffer(b64: string): Promise<ArrayBuffer> {
  const binary = atob(b64);
  const uint8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8[i] = binary.charCodeAt(i);
  }
  return uint8.buffer;
}

/** Единственный экземпляр сервиса */
export const BleService = new BleServiceClass();
