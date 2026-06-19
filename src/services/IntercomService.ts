// ============================================================
// KAmesh — IntercomService: рация (PTT) поверх BLE
// ============================================================
// Push-to-talk: зажимаешь кнопку — говоришь, отпускаешь —
// трансляция прекращается. Аудио фрагментируется на чанки
// по INTERCOM_AUDIO_CHUNK_SIZE байт и отправляется всем
// участникам канала в mesh-сети.
// ============================================================

import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import * as FileSystem from 'expo-file-system';
import { INTERCOM_AUDIO_CHUNK_SIZE, INTERCOM_FRAME_DURATION_MS } from '../constants';
import { BleService } from './BleService';

/** Обработчик входящего аудио */
type AudioHandler = (chunkB64: string, peerId: string) => void;

class IntercomServiceClass {
  private isTransmitting = false;
  private audioRecorder: AudioRecorderPlayer | null = null;
  private audioHandlers: AudioHandler[] = [];
  private activePeers = new Set<string>();
  private chunkTimer: ReturnType<typeof setInterval> | null = null;

  /** Начать трансляцию голоса (зажать PTT) */
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

      this.audioRecorder = new AudioRecorderPlayer();
      const path = `${FileSystem.cacheDirectory}intercom_temp.opus`;
      await this.audioRecorder.startRecorder(path, audioSet);

      // Периодически читаем и отправляем аудио-чанки
      this.chunkTimer = setInterval(async () => {
        if (!this.isTransmitting || !this.audioRecorder) return;
        try {
          const chunk = await this.readAudioChunk();
          if (chunk) {
            await this.broadcastChunk(chunk);
          }
        } catch { /* ignore */ }
      }, INTERCOM_FRAME_DURATION_MS);

      console.warn('[IntercomService] Трансляция начата');
    } catch (err) {
      this.isTransmitting = false;
      console.warn('[IntercomService] Ошибка начала трансляции:', err);
    }
  }

  /** Остановить трансляцию (отпустить PTT) */
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
    } catch { /* ignore */ }

    console.warn('[IntercomService] Трансляция остановлена');
  }

  /** Отправить аудио-чанк всем подключённым BLE-устройствам */
  private async broadcastChunk(b64chunk: string): Promise<void> {
    try {
      const devices = BleService.getConnectedDevices();
      const packet = JSON.stringify({
        type: 'intercom_audio',
        payload: b64chunk,
        seq: Date.now(),
      });

      for (const devId of devices) {
        try {
          await BleService.sendData(devId, packet);
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  /** Читает фрагмент записанного Opus-файла */
  private async readAudioChunk(): Promise<string | null> {
    try {
      if (!this.audioRecorder) return null;

      const filePath = `${FileSystem.cacheDirectory}intercom_temp.opus`;
      const stat = await FileSystem.getInfoAsync(filePath);

      if (!stat.exists) return null;
      if (!stat.size || stat.size < INTERCOM_AUDIO_CHUNK_SIZE) return null;

      const content = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
        position: 0,
        length: INTERCOM_AUDIO_CHUNK_SIZE,
      });

      // Очищаем прочитанное (упрощённо — удаляем файл, пересоздаём)
      await FileSystem.writeAsStringAsync(filePath, '', {
        encoding: FileSystem.EncodingType.Base64,
      });

      return content;
    } catch {
      return null;
    }
  }

  /** Обработать входящий пакет интеркома */
  handleIncomingAudio(data: string, peerId: string): void {
    try {
      const parsed = JSON.parse(data);
      if (parsed.type !== 'intercom_audio') return;

      this.activePeers.add(peerId);

      for (const handler of this.audioHandlers) {
        try { handler(parsed.payload, peerId); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  /** Подписаться на входящее аудио */
  onAudio(handler: AudioHandler): () => void {
    this.audioHandlers.push(handler);
    return () => {
      this.audioHandlers = this.audioHandlers.filter(h => h !== handler);
    };
  }

  /** Транслирует ли кто-то сейчас */
  isSomeoneTransmitting(): boolean {
    return this.activePeers.size > 0;
  }

  getActivePeers(): string[] {
    return Array.from(this.activePeers);
  }

  /** Сброс при отключении пиров */
  clearPeer(peerId: string): void {
    this.activePeers.delete(peerId);
  }
}

export const IntercomService = new IntercomServiceClass();
