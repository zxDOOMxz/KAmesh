// ============================================================
// Mash — GsmTransport: транспорт через интернет (GSM/WiFi с
// доступом в интернет). Использует WebSocket relay-сервер
// для доставки сообщений между устройствами.
//
// ВНИМАНИЕ: требует развёрнутый relay-сервер (см. RELAY.md)
// ============================================================

import NetInfo from '@react-native-community/netinfo';
import type { ITransport, TransportDataHandler, TransportConnectionHandler } from './ITransport';
import type { NodeId } from '../../types';

// ============================================================
// Константы (плейсхолдеры — заменить при деплое релея)
// ============================================================

const RELAY_URL = 'wss://mesh.kamesh.app/ws';
const RELAY_RECONNECT_MS = 10_000;
const PING_INTERVAL_MS = 30_000;

// ============================================================
// GsmTransport
// ============================================================

class GsmTransportImpl implements ITransport {
  readonly name = 'gsm';
  readonly priority = 0; // Самый высокий приоритет

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private myPeerId: NodeId = '';
  private connected = false;
  private intentionalClose = false;

  private dataHandlers: TransportDataHandler[] = [];
  private connectionHandlers: TransportConnectionHandler[] = [];

  /** Список пиров, известных релею */
  private onlinePeers: NodeId[] = [];

  async init(): Promise<void> {
    this.myPeerId = this.getMyPeerId();
    await this.connectToRelay();
    console.warn('[GsmTransport] Инициализирован');
  }

  destroy(): void {
    this.intentionalClose = true;
    this.disconnectFromRelay();
    if (this.reconnectTimer) { clearInterval(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.dataHandlers = [];
    this.connectionHandlers = [];
    console.warn('[GsmTransport] Остановлен');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return !!(state.isConnected && state.isInternetReachable !== false);
    } catch {
      return false;
    }
  }

  async send(peerId: NodeId, data: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('[GsmTransport] WebSocket не подключён');
    }

    const message = JSON.stringify({
      type: 'relay_send',
      targetPeerId: peerId,
      payload: data,
      senderId: this.myPeerId,
      timestamp: Date.now(),
    });

    this.ws.send(message);
  }

  async broadcast(data: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message = JSON.stringify({
      type: 'relay_broadcast',
      payload: data,
      senderId: this.myPeerId,
      timestamp: Date.now(),
    });

    this.ws.send(message);
  }

  getConnectedPeers(): NodeId[] {
    // Возвращаем пиров, известных релею (кроме себя)
    return this.onlinePeers.filter(p => p !== this.myPeerId);
  }

  isConnected(peerId: NodeId): boolean {
    return this.connected && this.onlinePeers.includes(peerId);
  }

  getSignalStrength(peerId: NodeId): number {
    // GSM: не можем измерить. Возвращаем 80 (условно хороший сигнал)
    return this.isConnected(peerId) ? 80 : -1;
  }

  onData(handler: TransportDataHandler): () => void {
    this.dataHandlers.push(handler);
    return () => {
      this.dataHandlers = this.dataHandlers.filter(h => h !== handler);
    };
  }

  onConnection(handler: TransportConnectionHandler): () => void {
    this.connectionHandlers.push(handler);
    return () => {
      this.connectionHandlers = this.connectionHandlers.filter(h => h !== handler);
    };
  }

  // ==========================================================
  // WebSocket-соединение с релеем
  // ==========================================================

  private async connectToRelay(): Promise<void> {
    try {
      const available = await this.isAvailable();
      if (!available) {
        console.warn('[GsmTransport] Нет интернета, релей недоступен');
        return;
      }

      this.intentionalClose = false;
      this.ws = new WebSocket(RELAY_URL);

      this.ws.onopen = () => {
        console.warn('[GsmTransport] WebSocket подключён к релею');

        // Регистрируемся на релее
        this.ws?.send(JSON.stringify({
          type: 'relay_register',
          peerId: this.myPeerId,
        }));

        this.connected = true;
        this.startPingLoop();
        this.notifyConnection(this.myPeerId, true);

        // Останавливаем таймер переподключения при успехе
        if (this.reconnectTimer) {
          clearInterval(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event: WebSocketMessageEvent) => {
        this.handleRelayMessage(event.data);
      };

      this.ws.onerror = (err: Event) => {
        console.warn('[GsmTransport] WebSocket ошибка:', err);
      };

      this.ws.onclose = () => {
        console.warn('[GsmTransport] WebSocket отключён');
        this.connected = false;
        this.stopPingLoop();
        this.notifyConnection(this.myPeerId, false);

        if (!this.intentionalClose) {
          this.startReconnectLoop();
        }
      };
    } catch (err) {
      console.warn('[GsmTransport] Ошибка подключения к релею:', err);
    }
  }

  private disconnectFromRelay(): void {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this.connected = false;
  }

  private startReconnectLoop(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setInterval(async () => {
      if (this.connected || this.intentionalClose) return;
      await this.connectToRelay();
    }, RELAY_RECONNECT_MS);
  }

  // ==========================================================
  // Обработка сообщений от релея
  // ==========================================================

  private handleRelayMessage(rawData: string): void {
    try {
      const msg = JSON.parse(rawData);

      switch (msg.type) {
        case 'relay_message':
          // Входящее сообщение от другого пира
          for (const handler of this.dataHandlers) {
            try { handler(msg.payload, msg.senderId); } catch { /* ignore */ }
          }
          break;

        case 'relay_peer_list':
          // Обновление списка онлайн-пиров
          this.onlinePeers = msg.peers || [];
          break;

        case 'relay_peer_online':
          if (!this.onlinePeers.includes(msg.peerId)) {
            this.onlinePeers.push(msg.peerId);
            this.notifyConnection(msg.peerId, true);
          }
          break;

        case 'relay_peer_offline':
          this.onlinePeers = this.onlinePeers.filter(p => p !== msg.peerId);
          this.notifyConnection(msg.peerId, false);
          break;

        case 'relay_error':
          console.warn('[GsmTransport] Ошибка релея:', msg.message);
          break;
      }
    } catch (err) {
      console.warn('[GsmTransport] Ошибка обработки сообщения релея:', err);
    }
  }

  // ==========================================================
  // Ping
  // ==========================================================

  private startPingLoop(): void {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'relay_ping' }));
      }
    }, PING_INTERVAL_MS);
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // ==========================================================
  // Вспомогательное
  // ==========================================================

  private notifyConnection(peerId: NodeId, connected: boolean): void {
    for (const handler of this.connectionHandlers) {
      try { handler(peerId, connected); } catch { /* ignore */ }
    }
  }

  private getMyPeerId(): NodeId {
    try {
      const { getNodeId } = require('../StorageService');
      return getNodeId() || 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

export const GsmTransport = new GsmTransportImpl();
