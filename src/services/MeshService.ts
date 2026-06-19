// ============================================================
// Mash — MeshService: маршрутизация в BLE mesh-сети с DTN
// ============================================================
// Отвечает за ретрансляцию сообщений через промежуточные узлы,
// дедупликацию пакетов, поддержание маршрутной таблицы и
// store-and-forward очередь для офлайн-режима.
//
// TTL = 7 прыжков, широковещательная рассылка, анти-петля.
// DTN (Delay-Tolerant Networking): каждый промежуточный узел
// сохраняет пакет локально и ретранслирует его при новой встрече.
// ============================================================

import uuidv4 from 'react-native-uuid';
import {
  MeshPacket,
  MessageType,
  NodeId,
  RouteEntry,
} from '../types';
import {
  MESH_TTL_MAX,
  ROUTE_TABLE_MAX_SIZE,
  PING_INTERVAL_MS,
  DTN_CHECK_INTERVAL_MS,
} from '../constants';
import { TransportManager } from './TransportManager';
import {
  addPendingMessage,
  addRelayPacket,
  getNodeId,
  getPendingMessages,
  getRelayPackets,
  getRouteTable,
  removePendingMessage,
  removeRelayPacket,
  saveRelayPackets,
  saveRouteTable,
} from './StorageService';
import { encryptPacket, decryptPacket } from './CryptoService';

// ============================================================
// Типы для внутреннего использования
// ============================================================

/** Обработчик входящего mesh-пакета */
type PacketHandler = (packet: MeshPacket, relayId: NodeId) => void;

/** Множество ID уже обработанных пакетов (анти-петля) */
const processedPackets = new Set<string>();

/** Типы пакетов, которые подлежат DTN-хранению */
function isDtnEligible(type: MessageType): boolean {
  return (
    type === MessageType.TEXT ||
    type === MessageType.VOICE_MAIL ||
    type === MessageType.VOICE_MAIL_CHUNK ||
    type === MessageType.UPDATE_MANIFEST
  );
}

/** Типы пакетов, НЕ подлежащих ретрансляции (только прямая доставка) */
function isDirectOnly(type: MessageType): boolean {
  return (
    type === MessageType.UPDATE_CHUNK_REQUEST ||
    type === MessageType.UPDATE_CHUNK
  );
}

/** Типы пакетов, не подлежащих шифрованию */
function isControlPacket(type: MessageType): boolean {
  return (
    type === MessageType.PING ||
    type === MessageType.PONG ||
    type === MessageType.DELIVERY_ACK ||
    type === MessageType.UPDATE_MANIFEST ||
    type === MessageType.UPDATE_CHUNK_REQUEST ||
    type === MessageType.UPDATE_CHUNK ||
    type === MessageType.NICKNAME_REGISTER ||
    type === MessageType.NICKNAME_ACCEPT ||
    type === MessageType.NICKNAME_REJECT ||
    type === MessageType.NICKNAME_ANNOUNCE ||
    type === MessageType.NICKNAME_QUERY ||
    type === MessageType.NICKNAME_LIST ||
    type === MessageType.CONFERENCE_CREATE ||
    type === MessageType.CONFERENCE_JOIN ||
    type === MessageType.CONFERENCE_LEAVE ||
    type === MessageType.CONFERENCE_PARTICIPANTS ||
    type === MessageType.CONFERENCE_AUDIO
  );
}

// ============================================================
// MeshService — синглтон
// ============================================================

class MeshServiceClass {
  private initialized = false;
  private packetHandlers: PacketHandler[] = [];
  private routeTable: RouteEntry[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private dtnTimer: ReturnType<typeof setInterval> | null = null;
  private myNodeId: NodeId = '';

  // ==========================================================
  // Инициализация
  // ==========================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const nodeId = getNodeId();
      if (!nodeId) {
        throw new Error('[MeshService] Node ID не задан. Сначала инициализируй приложение.');
      }
      this.myNodeId = nodeId;

      this.routeTable = getRouteTable();

      TransportManager.onData(this.handleIncomingPacket.bind(this));
      TransportManager.onConnection((peerId, connected) => {
        if (connected) {
          const signal = TransportManager.getSignalStrength(peerId);
          this.addOrUpdateRoute(peerId, peerId, signal, 1);
          // При новом подключении пытаемся раздать DTN-бандлы
          this.flushDtnToNeighbor(peerId);
        }
      });

      this.startPingLoop();
      this.processPendingQueue();
      this.startDtnProcessingLoop();

      this.initialized = true;
      console.warn('[MeshService] Mesh-сеть с DTN инициализирована');
    } catch (err) {
      console.warn('[MeshService] Ошибка инициализации:', err);
      throw err;
    }
  }

  // ==========================================================
  // Отправка сообщения в mesh-сеть
  // ==========================================================

  async sendMessage(
    type: MessageType,
    payload: string,
    targetId: NodeId,
    options?: {
      fragmentIndex?: number;
      fragmentTotal?: number;
      fragmentSessionId?: string;
    },
  ): Promise<MeshPacket> {
    try {
      const packet: MeshPacket = {
        packetId: uuidv4.v4(),
        type,
        sourceId: this.myNodeId,
        targetId,
        relayId: this.myNodeId,
        ttl: MESH_TTL_MAX,
        payload,
        timestamp: Date.now(),
        isBroadcast: targetId === 'broadcast',
        ...options,
      };

      // Служебные пакеты не шифруем
      const encryptedPacket = isControlPacket(type)
        ? packet
        : await encryptPacket(packet);

      // Если получатель — прямой сосед, шлём напрямую
      const route = this.routeTable.find(r => r.nodeId === targetId);
      if (route && TransportManager.isConnected(route.nextHop)) {
        await TransportManager.send(route.nextHop, JSON.stringify(encryptedPacket));
        return encryptedPacket;
      }

      // Широковещательная рассылка всем подключённым
      const connectedPeers = TransportManager.getConnectedPeers();
      const packetJson = JSON.stringify(encryptedPacket);

      for (const devId of connectedPeers) {
        if (devId === this.myNodeId) continue;
        try {
          await TransportManager.send(devId, packetJson);
        } catch { /* ignore */ }
      }

      // Если получатель не в сети — сохраняем в очередь
      const isTargetDirectlyConnected = connectedPeers.some(d => d === targetId);
      if (!isTargetDirectlyConnected && !packet.isBroadcast && isDtnEligible(type)) {
        addPendingMessage(encryptedPacket);
        console.warn(`[MeshService] Сообщение для ${targetId} в очереди pending`);
      }

      return encryptedPacket;
    } catch (err) {
      console.warn('[MeshService] Ошибка отправки сообщения:', err);
      throw err;
    }
  }

  // ==========================================================
  // Обработка входящих пакетов
  // ==========================================================

  private async handleIncomingPacket(
    data: string,
    relayId: NodeId,
  ): Promise<void> {
    try {
      let packet: MeshPacket;
      try {
        packet = JSON.parse(data);
      } catch {
        return;
      }

      if (!packet.packetId || !packet.sourceId) return;
      if (processedPackets.has(packet.packetId)) return;

      processedPackets.add(packet.packetId);
      setTimeout(() => processedPackets.delete(packet.packetId), 60_000);

      packet.ttl -= 1;
      packet.relayId = this.myNodeId;

      const signal = TransportManager.getSignalStrength(relayId);
      this.addOrUpdateRoute(packet.sourceId, relayId, signal, MESH_TTL_MAX - packet.ttl);

      // --- DELIVERY_ACK: удаляем бандл у ретрансляторов ---
      if (packet.type === MessageType.DELIVERY_ACK) {
        const ackedPacketId = packet.payload;
        removeRelayPacket(ackedPacketId);
        if (packet.ttl > 0) {
          await this.relayPacket(packet, relayId, true);
        }
        return;
      }

      const isForMe = packet.targetId === this.myNodeId || packet.isBroadcast;

      if (isForMe) {
        const decrypted = await decryptPacket(packet, this.myNodeId);
        this.notifyPacketHandlers(decrypted, relayId);

        // Отправляем подтверждение доставки обратно источнику
        if (isDtnEligible(packet.type) && packet.targetId === this.myNodeId) {
          await this.sendAck(packet.packetId, packet.sourceId);
        }
      }

      // DTN-сохранение на промежуточном узле (даже если TTL=0)
      if (
        packet.targetId !== this.myNodeId &&
        isDtnEligible(packet.type)
      ) {
        // Сохраняем копию пакета (с TTL, который был на момент получения)
        addRelayPacket({ ...packet, relayId: this.myNodeId });
      }

      // Ретрансляция: direct-only пакеты не ретранслируем (только между двумя пирами)
      if (
        packet.ttl > 0 &&
        !isDirectOnly(packet.type) &&
        (packet.isBroadcast || packet.targetId !== this.myNodeId)
      ) {
        await this.relayPacket(packet, relayId, true);
      }
    } catch (err) {
      console.warn('[MeshService] Ошибка обработки входящего пакета:', err);
    }
  }

  // ==========================================================
  // Подтверждение доставки (ACK)
  // ==========================================================

  private async sendAck(packetId: string, targetSourceId: NodeId): Promise<void> {
    try {
      const ackPacket: MeshPacket = {
        packetId: uuidv4.v4(),
        type: MessageType.DELIVERY_ACK,
        sourceId: this.myNodeId,
        targetId: targetSourceId,
        relayId: this.myNodeId,
        ttl: MESH_TTL_MAX,
        payload: packetId,
        timestamp: Date.now(),
        isBroadcast: false,
      };

      const ackJson = JSON.stringify(ackPacket);
      const connectedPeers = TransportManager.getConnectedPeers();
      for (const devId of connectedPeers) {
        if (devId === this.myNodeId) continue;
        try {
          await TransportManager.send(devId, ackJson);
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  // ==========================================================
  // Ретрансляция
  // ==========================================================

  private async relayPacket(
    packet: MeshPacket,
    excludeRelayId: NodeId,
    isLiveFlood = false,
  ): Promise<void> {
    try {
      const connectedPeers = TransportManager.getConnectedPeers();
      const packetJson = JSON.stringify(packet);

      for (const devId of connectedPeers) {
        if (
          devId === excludeRelayId ||
          devId === this.myNodeId ||
          devId === packet.sourceId
        ) {
          continue;
        }
        try {
          await TransportManager.send(devId, packetJson);
        } catch { /* ignore */ }
      }

      // При живом flooding-ретраснляции тоже сохраняем в DTN
      if (isLiveFlood && isDtnEligible(packet.type) && packet.targetId !== this.myNodeId) {
        addRelayPacket({ ...packet, relayId: this.myNodeId });
      }
    } catch { /* ignore */ }
  }

  // ==========================================================
  // DTN: раздача сохранённых пакетов при встрече
  // ==========================================================

  /** Отправляет все подходящие DTN-бандлы конкретному соседу */
  private async flushDtnToNeighbor(neighborId: NodeId): Promise<void> {
    try {
      const bundles = getRelayPackets();
      if (bundles.length === 0) return;

      const targetRoute = this.routeTable.find(r => r.nodeId === neighborId);
      const neighborKnowsTarget =
        targetRoute && targetRoute.hops < MESH_TTL_MAX;

      for (const bundle of bundles) {
        if (bundle.sourceId === neighborId) continue;

        // Отправляем соседу, если:
        // 1. Он сам — целевой получатель
        // 2. Он знает путь к получателю (hops < TTL)
        // 3. Просто на всякий случай (broadcast)
        if (
          bundle.targetId === neighborId ||
          neighborKnowsTarget
        ) {
          const freshened = { ...bundle, ttl: MESH_TTL_MAX, relayId: this.myNodeId };
          try {
            await TransportManager.send(neighborId, JSON.stringify(freshened));
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  /** Раз в DTN_CHECK_INTERVAL_MS пытаемся продвинуть бандлы */
  private startDtnProcessingLoop(): void {
    if (this.dtnTimer) return;

    this.dtnTimer = setInterval(async () => {
      try {
        const bundles = getRelayPackets();
        if (bundles.length === 0) return;

        const connectedPeers = TransportManager.getConnectedPeers();
        const now = Date.now();

        for (const bundle of bundles) {
          // Просроченные — удаляем
          if (now - bundle.timestamp > DTN_CHECK_INTERVAL_MS * 72) {
            removeRelayPacket(bundle.packetId);
            continue;
          }

          // Если появился путь к получателю — ретранслируем
          const routeToTarget = this.routeTable.find(r => r.nodeId === bundle.targetId);
          if (routeToTarget) {
            const freshened = { ...bundle, ttl: MESH_TTL_MAX, relayId: this.myNodeId };
            const pktJson = JSON.stringify(freshened);
            for (const devId of connectedPeers) {
              if (devId === this.myNodeId || devId === bundle.sourceId) continue;
              try {
                await TransportManager.send(devId, pktJson);
              } catch { /* ignore */ }
            }
          }

          // Если кто-то рядом — тоже пробрасываем
          for (const devId of connectedPeers) {
            if (
              devId === this.myNodeId ||
              devId === bundle.sourceId ||
              bundle.targetId === devId
            ) {
              continue;
            }
          }
        }
      } catch { /* ignore */ }
    }, DTN_CHECK_INTERVAL_MS);
  }

  // ==========================================================
  // Маршрутная таблица
  // ==========================================================

  private addOrUpdateRoute(
    nodeId: NodeId,
    nextHop: NodeId,
    rssi: number,
    hops: number,
  ): void {
    try {
      const existingIdx = this.routeTable.findIndex(r => r.nodeId === nodeId);
      const now = Date.now();

      if (existingIdx !== -1) {
        const existing = this.routeTable[existingIdx];
        if (hops <= existing.hops || rssi > existing.rssi) {
          this.routeTable[existingIdx] = {
            ...existing,
            nextHop,
            rssi,
            lastSeen: now,
            hops,
          };
        } else {
          this.routeTable[existingIdx].lastSeen = now;
        }
      } else {
        if (this.routeTable.length >= ROUTE_TABLE_MAX_SIZE) {
          this.routeTable.sort((a, b) => a.lastSeen - b.lastSeen);
          this.routeTable.shift();
        }
        this.routeTable.push({ nodeId, nextHop, rssi, lastSeen: now, hops, createdAt: now });
      }

      saveRouteTable(this.routeTable);
    } catch { /* ignore */ }
  }

  getRouteTable(): RouteEntry[] {
    return [...this.routeTable];
  }

  // ==========================================================
  // Ping
  // ==========================================================

  private startPingLoop(): void {
    if (this.pingTimer) return;

    this.pingTimer = setInterval(async () => {
      try {
        const ping: MeshPacket = {
          packetId: uuidv4.v4(),
          type: MessageType.PING,
          sourceId: this.myNodeId,
          targetId: 'broadcast',
          relayId: this.myNodeId,
          ttl: MESH_TTL_MAX,
          payload: '',
          timestamp: Date.now(),
          isBroadcast: true,
        };

        const pingJson = JSON.stringify(ping);
        for (const devId of TransportManager.getConnectedPeers()) {
          if (devId === this.myNodeId) continue;
          try { await TransportManager.send(devId, pingJson); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }, PING_INTERVAL_MS);
  }

  // ==========================================================
  // Store-and-Forward очередь отправителя
  // ==========================================================

  async processPendingQueue(): Promise<void> {
    try {
      const pending = getPendingMessages();
      if (pending.length === 0) return;

      const connectedPeers = TransportManager.getConnectedPeers();
      const now = Date.now();

      for (const msg of pending) {
        if (now - msg.timestamp > 72 * 60 * 60 * 1000) {
          removePendingMessage(msg.packetId);
          continue;
        }

        if (
          connectedPeers.includes(msg.targetId) ||
          this.routeTable.some(r => r.nodeId === msg.targetId)
        ) {
          try {
            await this.sendMessage(msg.type, msg.payload, msg.targetId, {
              fragmentIndex: msg.fragmentIndex,
              fragmentTotal: msg.fragmentTotal,
              fragmentSessionId: msg.fragmentSessionId,
            });
            removePendingMessage(msg.packetId);
            console.warn(`[MeshService] Pending-сообщение ${msg.packetId} доставлено`);
          } catch { /* повторная попытка позже */ }
        }
      }
    } catch { /* ignore */ }
  }

  // ==========================================================
  // Подписка
  // ==========================================================

  onPacket(handler: PacketHandler): () => void {
    this.packetHandlers.push(handler);
    return () => {
      this.packetHandlers = this.packetHandlers.filter(h => h !== handler);
    };
  }

  private notifyPacketHandlers(packet: MeshPacket, relayId: NodeId): void {
    for (const handler of this.packetHandlers) {
      try { handler(packet, relayId); } catch { /* ignore */ }
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  destroy(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.dtnTimer) { clearInterval(this.dtnTimer); this.dtnTimer = null; }
    this.initialized = false;
    this.routeTable = [];
    this.packetHandlers = [];
    processedPackets.clear();
  }
}

/** Единственный экземпляр MeshService */
export const MeshService = new MeshServiceClass();
