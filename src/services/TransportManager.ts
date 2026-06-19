// ============================================================
// Mash — TransportManager: оркестратор GSM → WiFi → BLE
// ============================================================
// Выбирает оптимальный транспорт для доставки сообщения:
//   1. GSM — если есть интернет (WebSocket relay)
//   2. WiFi — если в одной локальной сети (TCP+UDP)
//   3. BLE — если устройства рядом (Bluetooth Low Energy)
//
// Для входящих сообщений — агрегирует все три транспорта
// и отдаёт единый поток данных наверх (в MeshService).
// ============================================================

import type {
  ITransport,
  TransportDataHandler,
  TransportConnectionHandler,
} from './transports/ITransport';
import { BleTransport } from './transports/BleTransport';
import { WifiTransport } from './transports/WifiTransport';
import { GsmTransport } from './transports/GsmTransport';
import type { NodeId } from '../types';

type DataHandler = (data: string, peerId: NodeId) => void;
type ConnectionHandler = (peerId: NodeId, connected: boolean) => void;

// ============================================================
// TransportManager — синглтон
// ============================================================

class TransportManagerClass {
  private initialized = false;

  /** Все транспорты, отсортированные по приоритету */
  private transports: ITransport[] = [];

  /** Cleanup-функции от подписок */
  private dataCleanups: (() => void)[] = [];
  private connectionCleanups: (() => void)[] = [];

  private dataHandlers: DataHandler[] = [];
  private connectionHandlers: ConnectionHandler[] = [];

  // ==========================================================
  // Инициализация
  // ==========================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Порядок: от наивысшего приоритета к низшему
    this.transports = [
      GsmTransport,  // priority 0
      WifiTransport, // priority 1
      BleTransport,  // priority 2
    ];

    // Инициализируем все транспорты
    for (const t of this.transports) {
      try {
        await t.init();
      } catch (err) {
        console.warn(`[TransportManager] Ошибка инициализации ${t.name}:`, err);
      }
    }

    // Подписываемся на входящие данные от всех транспортов
    for (const t of this.transports) {
      const cleanup = t.onData((data, peerId) => {
        for (const handler of this.dataHandlers) {
          try { handler(data, peerId); } catch { /* ignore */ }
        }
      });
      this.dataCleanups.push(cleanup);
    }

    // Подписываемся на изменения статуса пиров
    for (const t of this.transports) {
      const cleanup = t.onConnection((peerId, connected) => {
        for (const handler of this.connectionHandlers) {
          try { handler(peerId, connected); } catch { /* ignore */ }
        }
      });
      this.connectionCleanups.push(cleanup);
    }

    this.initialized = true;
    console.warn('[TransportManager] Инициализирован (GSM → WiFi → BLE)');
  }

  /** Освобождение ресурсов */
  destroy(): void {
    for (const cleanup of this.dataCleanups) cleanup();
    for (const cleanup of this.connectionCleanups) cleanup();
    for (const t of this.transports) t.destroy();
    this.dataCleanups = [];
    this.connectionCleanups = [];
    this.dataHandlers = [];
    this.connectionHandlers = [];
    this.initialized = false;
  }

  // ==========================================================
  // Отправка
  // ==========================================================

  /**
   * Отправить сообщение конкретному пиру.
   * Пробует транспорты от наивысшего приоритета к низшему.
   */
  async send(peerId: NodeId, data: string): Promise<void> {
    // Сортируем по приоритету (0 = лучший)
    const sorted = [...this.transports].sort((a, b) => a.priority - b.priority);

    for (const t of sorted) {
      try {
        const available = await t.isAvailable();
        if (!available) continue;

        await t.send(peerId, data);
        return; // Успешно отправлено
      } catch (err) {
        console.warn(`[TransportManager] ${t.name} не смог доставить ${peerId}:`, err);
      }
    }

    // Если ни один транспорт не сработал — пробуем broadcast как fallback
    console.warn(`[TransportManager] Все транспорты не смогли доставить ${peerId}, пробую broadcast`);
    await this.broadcast(data);
  }

  /**
   * Разослать всем пирам через все доступные транспорты.
   */
  async broadcast(data: string): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const t of this.transports) {
      try {
        const available = await t.isAvailable();
        if (available) {
          promises.push(t.broadcast(data).catch(err => {
            console.warn(`[TransportManager] ${t.name} broadcast error:`, err);
          }));
        }
      } catch { /* ignore */ }
    }

    await Promise.all(promises);
  }

  /** Отправить через конкретный транспорт (для принудительного выбора) */
  async sendVia(transportName: string, peerId: NodeId, data: string): Promise<void> {
    const transport = this.transports.find(t => t.name === transportName);
    if (!transport) throw new Error(`[TransportManager] Транспорт ${transportName} не найден`);
    await transport.send(peerId, data);
  }

  // ==========================================================
  // Статус
  // ==========================================================

  /** Получить список всех пиров со всех транспортов */
  getConnectedPeers(): NodeId[] {
    const peers = new Set<NodeId>();
    for (const t of this.transports) {
      for (const p of t.getConnectedPeers()) {
        peers.add(p);
      }
    }
    return Array.from(peers);
  }

  /** Проверить, доступен ли пир через любой транспорт */
  isConnected(peerId: NodeId): boolean {
    return this.transports.some(t => t.isConnected(peerId));
  }

  /** Получить лучший уровень сигнала к пиру */
  getSignalStrength(peerId: NodeId): number {
    let best = -1;
    for (const t of this.transports) {
      const sig = t.getSignalStrength(peerId);
      if (sig > best) best = sig;
    }
    return best;
  }

  /** Получить список транспортов, через которые доступен пир */
  getTransportsForPeer(peerId: NodeId): string[] {
    return this.transports
      .filter(t => t.isConnected(peerId))
      .map(t => t.name);
  }

  // ==========================================================
  // Подписка на события
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

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const TransportManager = new TransportManagerClass();
