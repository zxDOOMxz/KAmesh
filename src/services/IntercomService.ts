import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import * as FileSystem from 'expo-file-system';
import { INTERCOM_AUDIO_CHUNK_SIZE, INTERCOM_FRAME_DURATION_MS } from '../constants';
import { MessageType } from '../types';
import { MeshService } from './MeshService';

type AudioHandler = (chunkB64: string, peerId: string) => void;

class IntercomServiceClass {
  private isTransmitting = false;
  private audioRecorder: AudioRecorderPlayer | null = null;
  private audioHandlers: AudioHandler[] = [];
  private activePeers = new Set<string>();
  private chunkTimer: ReturnType<typeof setInterval> | null = null;
  private lastReadPosition = 0;
  private unsubscribeMesh: (() => void) | null = null;

  initialize(): void {
    if (this.unsubscribeMesh) return;
    this.unsubscribeMesh = MeshService.onPacket((packet) => {
      this.handleIncomingAudio(packet.payload, packet.sourceId);
    });
  }

  async startTransmitting(): Promise<void> {
    if (this.isTransmitting) return;
    this.isTransmitting = true;

    try {
      const audioSet = {
        AudioEncoderAndroid: 'opus' as const,
        AudioSourceAndroid: 'mic' as const,
        AVEncoderAudioQualityKeyIOS: 'high',
        AVNumberOfChannelsKeyIOS: 1,
        AVEncoderBitRateKeyIOS: 8000,
        AVSampleRateKeyIOS: 16000,
        AVFormatIDKeyIOS: 'opus',
        OutputFormatAndroid: 'opus',
        SampleRate: 16000,
        NumberOfChannels: 1,
        BitRate: 8000,
      } as Record<string, string | number>;

      const filePath = `${FileSystem.cacheDirectory}intercom_temp.opus`;

      await FileSystem.writeAsStringAsync(filePath, '', {
        encoding: FileSystem.EncodingType.Base64,
      });
      this.lastReadPosition = 0;

      this.audioRecorder = new AudioRecorderPlayer();
      await this.audioRecorder.startRecorder(filePath, audioSet);

      this.chunkTimer = setInterval(async () => {
        if (!this.isTransmitting || !this.audioRecorder) return;
        try {
          const chunk = await this.readAudioChunk();
          if (chunk) {
            await this.broadcastChunk(chunk);
          }
        } catch (err) {
          console.warn('[IntercomService] transmit loop error:', err);
        }
      }, INTERCOM_FRAME_DURATION_MS);

      console.warn('[IntercomService] Трансляция начата');
    } catch (err) {
      this.isTransmitting = false;
      console.warn('[IntercomService] Ошибка начала трансляции:', err);
    }
  }

  async stopTransmitting(): Promise<void> {
    this.isTransmitting = false;

    if (this.chunkTimer) {
      clearInterval(this.chunkTimer);
      this.chunkTimer = null;
    }

    try {
      if (this.audioRecorder) {
        await this.audioRecorder.stopRecorder();
        this.audioRecorder = null;
      }
    } catch (err) {
      console.warn('[IntercomService] stopRecorder error:', err);
    }

    this.lastReadPosition = 0;

    try {
      await FileSystem.deleteAsync(
        `${FileSystem.cacheDirectory}intercom_temp.opus`,
        { idempotent: true },
      );
    } catch (err) {
      console.warn('[IntercomService] delete temp file error:', err);
    }

    console.warn('[IntercomService] Трансляция остановлена');
  }

  private async broadcastChunk(b64chunk: string): Promise<void> {
    try {
      const packet = JSON.stringify({
        type: 'intercom_audio',
        payload: b64chunk,
        seq: Date.now(),
      });
      await MeshService.sendMessage(MessageType.INTERCOM_AUDIO, packet, 'broadcast');
    } catch (err) {
      console.warn('[IntercomService] broadcastChunk error:', err);
    }
  }

  private async readAudioChunk(): Promise<string | null> {
    try {
      const filePath = `${FileSystem.cacheDirectory}intercom_temp.opus`;
      const stat = await FileSystem.getInfoAsync(filePath);

      if (!stat.exists || !stat.size) return null;

      const bytesAvailable = stat.size - this.lastReadPosition;
      if (bytesAvailable < INTERCOM_AUDIO_CHUNK_SIZE) return null;

      const readLength = Math.min(
        bytesAvailable,
        INTERCOM_AUDIO_CHUNK_SIZE * 4,
      );

      const content = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
        position: this.lastReadPosition,
        length: readLength,
      });

      this.lastReadPosition += readLength;
      return content;
    } catch {
      return null;
    }
  }

  handleIncomingAudio(data: string, peerId: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type !== 'intercom_audio') return;

      this.activePeers.add(peerId);

      for (const handler of this.audioHandlers) {
        try { handler(parsed.payload, peerId); } catch { /* ignore handler error */ }
      }
    } catch (err) {
      console.warn('[IntercomService] handlePacket error:', err);
    }
  }

  onAudio(handler: AudioHandler): () => void {
    this.audioHandlers.push(handler);
    return () => {
      this.audioHandlers = this.audioHandlers.filter(h => h !== handler);
    };
  }

  isSomeoneTransmitting(): boolean {
    return this.activePeers.size > 0;
  }

  getActivePeers(): string[] {
    return Array.from(this.activePeers);
  }

  clearPeer(peerId: string): void {
    this.activePeers.delete(peerId);
  }

  destroy(): void {
    if (this.unsubscribeMesh) {
      this.unsubscribeMesh();
      this.unsubscribeMesh = null;
    }
    this.activePeers.clear();
  }
}

export const IntercomService = new IntercomServiceClass();
