import { MessageType, MeshPacket } from '../types';
import { getNodeId } from './StorageService';
import { MeshService } from './MeshService';

export interface ChannelInfo {
  id: string;
  name: string;
  hostId: string;
  memberCount: number;
  lastSeen: number;
}

type ChannelHandler = (channels: ChannelInfo[]) => void;

class ChannelServiceClass {
  private currentChannel: string = '';
  private channelHandlers: ChannelHandler[] = [];
  private knownChannels: ChannelInfo[] = [];
  private unsubscribeMesh: (() => void) | null = null;

  initialize(): void {
    if (this.unsubscribeMesh) return;
    this.unsubscribeMesh = MeshService.onPacket((packet) => {
      this.handleChannelPacket(packet);
    });
  }

  createAndJoin(name: string): void {
    this.leaveCurrent();
    this.currentChannel = name;
    this.advertiseChannel(name);
    this.notifyHandlers();
  }

  join(channelId: string): void {
    this.leaveCurrent();
    const ch = this.knownChannels.find(c => c.id === channelId);
    if (ch) {
      this.currentChannel = ch.name;
      this.broadcastJoin(ch.name);
    }
    this.notifyHandlers();
  }

  leaveCurrent(): void {
    if (this.currentChannel) {
      this.broadcastLeave(this.currentChannel);
    }
    this.currentChannel = '';
    this.notifyHandlers();
  }

  getCurrentChannel(): string {
    return this.currentChannel;
  }

  getKnownChannels(): ChannelInfo[] {
    return [...this.knownChannels];
  }

  onChange(handler: ChannelHandler): () => void {
    this.channelHandlers.push(handler);
    return () => {
      this.channelHandlers = this.channelHandlers.filter(h => h !== handler);
    };
  }

  handleChannelPacket(packet: MeshPacket): void {
    try {
      if (packet.type !== MessageType.TEXT) return;
      const data = JSON.parse(packet.payload);
      if (data.channel && data.action) {
        this.processChannelDiscovery(data, packet.sourceId);
      }
    } catch (err) {
      console.warn('[ChannelService] handleDiscoveryPacket error:', err);
    }
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

  private sendChannelAction(action: string, channelName: string): void {
    const payload = JSON.stringify({
      channel: channelName,
      action,
      hostId: getNodeId(),
    });
    MeshService.sendMessage(MessageType.TEXT, payload, 'broadcast').catch(() => {});
  }

  private broadcastJoin(channelName: string): void {
    this.sendChannelAction('join', channelName);
  }

  private broadcastLeave(channelName: string): void {
    this.sendChannelAction('leave', channelName);
  }

  private advertiseChannel(channelName: string): void {
    this.sendChannelAction('advertise', channelName);
  }

  private notifyHandlers(): void {
    const channels = this.getKnownChannels();
    for (const handler of this.channelHandlers) {
        try { handler(channels); } catch { /* ignore handler error */ }
    }
  }

  destroy(): void {
    if (this.unsubscribeMesh) {
      this.unsubscribeMesh();
      this.unsubscribeMesh = null;
    }
    this.knownChannels = [];
    this.currentChannel = '';
  }
}

export const ChannelService = new ChannelServiceClass();
