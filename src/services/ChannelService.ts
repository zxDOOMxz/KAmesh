// ============================================================
// KAmesh — ChannelService: каналы/комнаты для групповой связи
// ============================================================
// Позволяет создавать или вступать в тематические каналы
// (например, "MoscowMoto2025"). Участники канала автоматически
// получают уведомления и могут общаться через интерком.
// ============================================================

import { MessageType, MeshPacket } from '../types';
import { BleService } from './BleService';
import { getNodeId } from './StorageService';

/** Описание канала */
export interface ChannelInfo {
  id: string;
  name: string;
  hostId: string;
  memberCount: number;
  lastSeen: number;
}

/** Обработчик изменения канала */
type ChannelHandler = (channels: ChannelInfo[]) => void;

class ChannelServiceClass {
  private currentChannel: string = '';
  private channelHandlers: ChannelHandler[] = [];
  private knownChannels: ChannelInfo[] = [];
  private scanTimer: ReturnType<typeof setInterval> | null = null;

  /** Создать и войти в канал */
  createAndJoin(name: string): void {
    this.leaveCurrent();
    this.currentChannel = name;

    // Рекламируем канал через BLE-manufacturer data
    this.advertiseChannel(name);

    console.warn(`[ChannelService] Создан канал: ${name}`);
    this.notifyHandlers();
  }

  /** Присоединиться к существующему каналу */
  join(channelId: string): void {
    this.leaveCurrent();
    const ch = this.knownChannels.find(c => c.id === channelId);
    if (ch) {
      this.currentChannel = ch.name;
      // Отправляем join-пакет
      this.broadcastJoin(ch.name);
      console.warn(`[ChannelService] Присоединился к каналу: ${ch.name}`);
    }
    this.notifyHandlers();
  }

  /** Покинуть текущий канал */
  leaveCurrent(): void {
    if (this.currentChannel) {
      this.broadcastLeave(this.currentChannel);
      console.warn(`[ChannelService] Покинул канал: ${this.currentChannel}`);
    }
    this.currentChannel = '';
    this.notifyHandlers();
  }

  /** Текущий канал */
  getCurrentChannel(): string {
    return this.currentChannel;
  }

  /** Получить список известных каналов */
  getKnownChannels(): ChannelInfo[] {
    return [...this.knownChannels];
  }

  /** Подписаться на изменения */
  onChange(handler: ChannelHandler): () => void {
    this.channelHandlers.push(handler);
    return () => {
      this.channelHandlers = this.channelHandlers.filter(h => h !== handler);
    };
  }

  /** Обработать входящий канальный пакет */
  handleChannelPacket(packet: MeshPacket): void {
    try {
      if (packet.type === MessageType.TEXT) {
        const data = JSON.parse(packet.payload);
        if (data.channel && data.action) {
          this.processChannelDiscovery(data, packet.sourceId);
        }
      }
    } catch { /* ignore */ }
  }

  private processChannelDiscovery(
    data: { channel: string; action: string; hostId?: string },
    sourceId: string,
  ): void {
    if (data.action === 'join' || data.action === 'advertise') {
      const existingIdx = this.knownChannels.findIndex(
        c => c.name === data.channel,
      );
      const info: ChannelInfo = {
        id: data.channel,
        name: data.channel,
        hostId: data.hostId || sourceId,
        memberCount: 1,
        lastSeen: Date.now(),
      };

      if (existingIdx !== -1) {
        this.knownChannels[existingIdx].lastSeen = Date.now();
        this.knownChannels[existingIdx].memberCount += 1;
      } else {
        this.knownChannels.push(info);
      }
    }

    if (data.action === 'leave') {
      const idx = this.knownChannels.findIndex(c => c.name === data.channel);
      if (idx !== -1) {
        this.knownChannels[idx].memberCount = Math.max(0, this.knownChannels[idx].memberCount - 1);
        if (this.knownChannels[idx].memberCount <= 0) {
          this.knownChannels.splice(idx, 1);
        }
      }
    }

    this.notifyHandlers();
  }

  private broadcastJoin(channelName: string): void {
    const payload = JSON.stringify({ channel: channelName, action: 'join', hostId: getNodeId() });
    const devices = BleService.getConnectedDevices();
    for (const devId of devices) {
      try {
        BleService.sendData(devId, payload);
      } catch { /* ignore */ }
    }
  }

  private broadcastLeave(channelName: string): void {
    const payload = JSON.stringify({ channel: channelName, action: 'leave', hostId: getNodeId() });
    const devices = BleService.getConnectedDevices();
    for (const devId of devices) {
      try {
        BleService.sendData(devId, payload);
      } catch { /* ignore */ }
    }
  }

  private advertiseChannel(channelName: string): void {
    const payload = JSON.stringify({ channel: channelName, action: 'advertise', hostId: getNodeId() });
    const devices = BleService.getConnectedDevices();
    for (const devId of devices) {
      try {
        BleService.sendData(devId, payload);
      } catch { /* ignore */ }
    }
  }

  private notifyHandlers(): void {
    const channels = this.getKnownChannels();
    for (const handler of this.channelHandlers) {
      try { handler(channels); } catch { /* ignore */ }
    }
  }

  destroy(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    this.knownChannels = [];
    this.currentChannel = '';
  }
}

export const ChannelService = new ChannelServiceClass();
