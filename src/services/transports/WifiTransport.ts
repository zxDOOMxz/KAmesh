// ============================================================
// Mash — WifiTransport: TCP/UDP транспорт по локальной WiFi
// ============================================================
// UDP broadcast — для обнаружения пиров в локальной сети
// TCP — для надёжной передачи данных между пирами
//
// Каждый пир:
//   1. Слушает TCP-порт 4404
//   2. Шлёт UDP-broadcast на порт 4405 каждые 10 сек
//   3. При получении UDP-broadcast — подключается по TCP
//   4. При получении TCP-подключения — читает данные
// ============================================================

import TcpSocket from 'react-native-tcp-socket';
import UdpSockets from 'react-native-udp';
import type { ITransport, TransportDataHandler, TransportConnectionHandler } from './ITransport';
import type { NodeId } from '../../types';
import { WIFI_TCP_CONNECT_TIMEOUT_MS } from '../../constants';

// ============================================================
// Константы
// ============================================================

const TCP_PORT = 4404;
const UDP_PORT = 4405;
const UDP_BROADCAST_ADDR = '255.255.255.255';
const DISCOVERY_INTERVAL_MS = 10_000;
const RECONNECT_INTERVAL_MS = 30_000;

/** Формат UDP-discovery пакета */
interface DiscoveryPacket {
  type: 'kamesh_wifi_discovery';
  peerId: NodeId;
  tcpPort: number;
  timestamp: number;
}

// ============================================================
// WifiTransport
// ============================================================

class WifiTransportImpl implements ITransport {
  readonly name = 'wifi';
  readonly priority = 1; // Средний приоритет (второй после GSM)

  private server: TcpSocket.Server | null = null;
  private udpSocket: any = null;
  private clients = new Map<NodeId, any>();
  private pendingConnections = new Set<string>();
  private myPeerId: NodeId = '';
  private discoveryTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;

  /** Буферы приёма для каждого сокета (binpack: length-prefix framing) */
  private recvBuffers = new Map<any, Buffer>();

  private dataHandlers: TransportDataHandler[] = [];
  private connectionHandlers: TransportConnectionHandler[] = [];

  private knownPeers = new Map<NodeId, { host: string; port: number; lastSeen: number }>();

  async init(): Promise<void> {
    this.myPeerId = this.getMyPeerId();
    this.startTcpServer();
    this.startUdpDiscovery();
    this.startBroadcastLoop();
    this.startReconnectLoop();
    console.warn('[WifiTransport] Инициализирован');
  }

  destroy(): void {
    if (this.discoveryTimer) { clearInterval(this.discoveryTimer); this.discoveryTimer = null; }
    if (this.reconnectTimer) { clearInterval(this.reconnectTimer); this.reconnectTimer = null; }
    this.stopUdpSocket();
    this.stopTcpServer();
    this.closeAllClients();
    this.dataHandlers = [];
    this.connectionHandlers = [];
    this.knownPeers.clear();
    console.warn('[WifiTransport] Остановлен');
  }

  async isAvailable(): Promise<boolean> {
    return this.server !== null;
  }

  async send(peerId: NodeId, data: string): Promise<void> {
    try {
      const client = this.clients.get(peerId);
      if (!client) {
        throw new Error(`[WifiTransport] Нет TCP-соединения с ${peerId}`);
      }
      await this.writeToSocket(client, data);
    } catch (err) {
      console.warn(`[WifiTransport] Ошибка отправки peerId=${peerId}:`, err);
      throw err;
    }
  }

  async broadcast(data: string): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [peerId, client] of this.clients) {
      promises.push(this.writeToSocket(client, data).catch(() => {
        this.clients.delete(peerId);
        this.notifyConnection(peerId, false);
      }));
    }
    await Promise.all(promises);
  }

  getConnectedPeers(): NodeId[] {
    return Array.from(this.clients.keys());
  }

  isConnected(peerId: NodeId): boolean {
    return this.clients.has(peerId);
  }

  getSignalStrength(peerId: NodeId): number {
    return this.clients.has(peerId) ? 50 : -1;
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
  // TCP-сервер
  // ==========================================================

  private startTcpServer(): void {
    try {
      this.server = TcpSocket.createServer((client) => {
        const remoteAddr = `${client.remoteAddress}:${client.remotePort}`;
        console.warn(`[WifiTransport] TCP-подключение от ${remoteAddr}`);

        client.on('data', (rawData: string | Buffer) => {
          const chunk = typeof rawData === 'string' ? Buffer.from(rawData, 'utf-8') : rawData;
          this.onSocketData(client, chunk);
        });

        client.on('close', () => {
          console.warn(`[WifiTransport] TCP-отключение ${remoteAddr}`);
          this.removeClientBySocket(client);
        });

        client.on('error', (err: Error) => {
          console.warn(`[WifiTransport] TCP-ошибка ${remoteAddr}:`, err.message);
          this.removeClientBySocket(client);
        });
      });

      this.server.listen({ port: TCP_PORT, host: '0.0.0.0' });
      console.warn(`[WifiTransport] TCP-сервер на порту ${TCP_PORT}`);
    } catch (err) {
      console.warn('[WifiTransport] Ошибка запуска TCP-сервера:', err);
    }
  }

  private stopTcpServer(): void {
    try { this.server?.close(); } catch { /* ignore */ }
    this.server = null;
  }

  // ==========================================================
  // UDP-discovery
  // ==========================================================

  private startUdpDiscovery(): void {
    try {
      this.udpSocket = UdpSockets.createSocket({ type: 'udp4' });

      this.udpSocket.on('message', (rawData: Buffer, rinfo: { address: string; port: number }) => {
        try {
          const packet: DiscoveryPacket = JSON.parse(rawData.toString());
          if (packet.type !== 'kamesh_wifi_discovery') return;
          if (packet.peerId === this.myPeerId) return;

          const existing = this.knownPeers.get(packet.peerId);
          if (!existing || existing.host !== rinfo.address) {
            this.knownPeers.set(packet.peerId, {
              host: rinfo.address,
              port: packet.tcpPort,
              lastSeen: Date.now(),
            });
            this.connectToPeer(packet.peerId, rinfo.address, packet.tcpPort);
          } else {
            existing.lastSeen = Date.now();
          }
        } catch { /* ignore bad packets */ }
      });

      this.udpSocket.bind(UDP_PORT);
      console.warn(`[WifiTransport] UDP-discovery на порту ${UDP_PORT}`);
    } catch (err) {
      console.warn('[WifiTransport] Ошибка UDP-discovery:', err);
    }
  }

  private stopUdpSocket(): void {
    try { this.udpSocket?.close(); } catch { /* ignore */ }
    this.udpSocket = null;
  }

  private startBroadcastLoop(): void {
    if (this.discoveryTimer) return;
    this.discoveryTimer = setInterval(() => {
      this.broadcastDiscovery();
    }, DISCOVERY_INTERVAL_MS);
  }

  private broadcastDiscovery(): void {
    if (!this.udpSocket) return;

    const packet: DiscoveryPacket = {
      type: 'kamesh_wifi_discovery',
      peerId: this.myPeerId,
      tcpPort: TCP_PORT,
      timestamp: Date.now(),
    };

    const message = Buffer.from(JSON.stringify(packet));
    this.udpSocket.send(message, 0, message.length, UDP_PORT, UDP_BROADCAST_ADDR, (err: Error | null) => {
      if (err) {
        console.warn('[WifiTransport] Ошибка UDP-broadcast:', err.message);
      }
    });
  }

  // ==========================================================
  // TCP-подключение к пиру
  // ==========================================================

  private connectToPeer(peerId: NodeId, host: string, port: number): void {
    if (this.clients.has(peerId)) return;
    const connKey = `${peerId}@${host}:${port}`;
    if (this.pendingConnections.has(connKey)) return;

    this.pendingConnections.add(connKey);
    console.warn(`[WifiTransport] Подключаюсь к ${peerId} (${host}:${port})`);

    try {
      const client = TcpSocket.createConnection(
        { host, port },
        () => {
          this.pendingConnections.delete(connKey);
          this.clients.set(peerId, client);
          this.notifyConnection(peerId, true);
          console.warn(`[WifiTransport] Подключён к ${peerId}`);
        },
      );

      // Таймаут TCP-подключения
      const connectTimer = setTimeout(() => {
        client.destroy();
        this.pendingConnections.delete(connKey);
        console.warn(`[WifiTransport] Таймаут подключения к ${peerId} (${WIFI_TCP_CONNECT_TIMEOUT_MS}ms)`);
      }, WIFI_TCP_CONNECT_TIMEOUT_MS);

      client.on('data', (rawData: string | Buffer) => {
        const chunk = typeof rawData === 'string' ? Buffer.from(rawData, 'utf-8') : rawData;
        this.onSocketData(client, chunk);
      });

      client.on('close', () => {
        clearTimeout(connectTimer);
        this.pendingConnections.delete(connKey);
        if (this.clients.get(peerId) === client) {
          this.clients.delete(peerId);
          this.notifyConnection(peerId, false);
        }
      });

      client.on('error', (err: Error) => {
        clearTimeout(connectTimer);
        this.pendingConnections.delete(connKey);
        console.warn(`[WifiTransport] Ошибка подключения к ${peerId}:`, err.message);
        if (this.clients.get(peerId) === client) {
          this.clients.delete(peerId);
          this.notifyConnection(peerId, false);
        }
      });
    } catch (err) {
      this.pendingConnections.delete(connKey);
      console.warn(`[WifiTransport] Ошибка создания TCP-клиента для ${peerId}:`, err);
    }
  }

  private startReconnectLoop(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setInterval(() => {
      const now = Date.now();
      for (const [peerId, info] of this.knownPeers) {
        if (!this.clients.has(peerId) && (now - info.lastSeen) < 120_000) {
          this.connectToPeer(peerId, info.host, info.port);
        }
      }
    }, RECONNECT_INTERVAL_MS);
  }

  // ==========================================================
  // Обработка TCP-данных
  // ==========================================================

  private onSocketData(socket: any, chunk: Buffer): void {
    try {
      // Инициализируем буфер для сокета
      if (!this.recvBuffers.has(socket)) {
        this.recvBuffers.set(socket, Buffer.alloc(0));
      }
      this.recvBuffers.set(socket, Buffer.concat([this.recvBuffers.get(socket)!, chunk]));

      const peerId = this.findPeerIdBySocket(socket);
      if (!peerId) return;

      const buf = this.recvBuffers.get(socket)!;
      let offset = 0;

      while (offset + 4 <= buf.length) {
        const msgLen = buf.readUInt32BE(offset);
        const totalLen = 4 + msgLen;
        if (offset + totalLen > buf.length) break;

        const msgBuf = buf.subarray(offset + 4, offset + totalLen);
        const data = msgBuf.toString('utf-8');

        for (const handler of this.dataHandlers) {
          try { handler(data, peerId); } catch { /* ignore */ }
        }

        offset += totalLen;
      }

      // Сохраняем остаток
      if (offset > 0) {
        this.recvBuffers.set(socket, buf.subarray(offset));
      }
    } catch (err) {
      console.warn('[WifiTransport] Ошибка обработки TCP-данных:', err);
    }
  }

  private async writeToSocket(socket: any, data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const payload = Buffer.from(data, 'utf-8');
        const header = Buffer.alloc(4);
        header.writeUInt32BE(payload.length, 0);
        socket.write(Buffer.concat([header, payload]), (err?: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // ==========================================================
  // Управление клиентами
  // ==========================================================

  private findPeerIdBySocket(socket: any): NodeId | null {
    for (const [peerId, s] of this.clients) {
      if (s === socket) return peerId;
    }
    return null;
  }

  private removeClientBySocket(socket: any): void {
    this.recvBuffers.delete(socket);
    for (const [peerId, s] of this.clients) {
      if (s === socket) {
        this.clients.delete(peerId);
        this.notifyConnection(peerId, false);
        try { socket.destroy(); } catch { /* ignore */ }
        return;
      }
    }
  }

  private closeAllClients(): void {
    for (const [peerId, client] of this.clients) {
      try { client.destroy(); } catch { /* ignore */ }
      this.notifyConnection(peerId, false);
    }
    this.clients.clear();
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

export const WifiTransport = new WifiTransportImpl();
