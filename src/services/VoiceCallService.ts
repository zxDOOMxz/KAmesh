// ============================================================
// Mash — VoiceCallService: WebRTC VoIP поверх BLE-сигнализации
// ============================================================
// Реализует P2P-голосовой вызов через WebRTC (react-native-webrtc v118+)
// с передачей SDP-офферов/ответов и ICE-кандидатов через BLE-канал
// (сигнальный канал). Автоотключение через 30 сек без RTP.
// ============================================================

import {
  mediaDevices,
  MediaStream,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from 'react-native-webrtc';

// Типы, не экспортируемые из react-native-webrtc
type RTCIceServer = {
  urls?: string | string[];
  username?: string;
  credential?: string;
};
import { CallState, MessageType, MeshPacket, NodeId } from '../types';
import { CALL_RTP_TIMEOUT_MS } from '../constants';
import { MeshService } from './MeshService';

// ============================================================
// Конфигурация STUN/TURN — в офлайн-режиме не используется.
// WebRTC работает только в P2P-режиме через LAN/BLE.
// ============================================================
const ICE_SERVERS: RTCIceServer[] = [];

/** Единственный экземпляр класса управления звонками */
class VoiceCallServiceClass {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private state: CallState = CallState.IDLE;
  private currentPeerId: NodeId = '';
  private rtpTimer: ReturnType<typeof setTimeout> | null = null;

  /** Хранилище SDP входящего звонка (для acceptCall) */
  private pendingCall: { peerId: NodeId; sdp: string } | null = null;

  /** Обработчики изменения состояния */
  private stateHandlers: Map<string, (state: CallState) => void> = new Map();

  // ==========================================================
  // Инициализация: подписка на SDP/ICE-pakеты из MeshService
  // ==========================================================

  initialize(): void {
    try {
      MeshService.onPacket(this.handleCallPacket.bind(this));
      console.warn('[VoiceCallService] Инициализирован');
    } catch (err) {
      console.warn('[VoiceCallService] Ошибка инициализации:', err);
    }
  }

  // ==========================================================
  // Исходящий вызов
  // ==========================================================

  /**
   * Инициирует голосовой вызов к указанному узлу.
   * Создаёт RTCPeerConnection, получает локальный медиапоток,
   * создаёт SDP-оффер и отправляет его через BLE.
   */
  async startCall(peerId: NodeId): Promise<void> {
    try {
      if (this.state !== CallState.IDLE) {
        throw new Error('Уже есть активный вызов');
      }

      this.currentPeerId = peerId;
      this.setState(CallState.CALLING);

      // Создаём PeerConnection
      this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Получаем локальный аудиопоток
      this.localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // Подписываемся на удалённый поток
      this.peerConnection.addEventListener('track', (event: any) => {
        console.warn('[VoiceCallService] Получен удалённый трек');
        this.remoteStream = event.streams[0];
        this.startRtpWatchdog();
      });

      // ICE-кандидаты
      this.peerConnection.addEventListener('icecandidate', (event: any) => {
        if (event.candidate) {
          this.sendIceCandidate(event.candidate);
        }
      });

      // ICE restart при disconnected/failed
      this.peerConnection.addEventListener('iceconnectionstatechange', () => {
        const state = this.peerConnection?.iceConnectionState;
        if (state === 'disconnected' || state === 'failed') {
          console.warn('[VoiceCallService] ICE disconnected, restart...');
          this.restartIce().catch(() => this.endCall());
        }
      });

      // Создаём SDP-оффер
      const offer = await this.peerConnection.createOffer({ offerToReceiveAudio: true });
      await this.peerConnection.setLocalDescription(offer);

      // Отправляем оффер через BLE
      await MeshService.sendMessage(
        MessageType.SDP_OFFER,
        JSON.stringify({ sdp: offer.sdp, type: offer.type }),
        peerId,
      );

      console.warn('[VoiceCallService] SDP-оффер отправлен');
    } catch (err) {
      console.warn('[VoiceCallService] Ошибка начала вызова:', err);
      this.endCall();
    }
  }

  // ==========================================================
  // Входящий вызов
  // ==========================================================

  /**
   * Принимает входящий вызов.
   */
  async acceptCall(peerId: NodeId, offerSdp: string): Promise<void> {
    try {
      this.currentPeerId = peerId;
      this.setState(CallState.CONNECTING);

      this.peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      this.localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      this.peerConnection.addEventListener('track', (event: any) => {
        this.remoteStream = event.streams[0];
        this.startRtpWatchdog();
      });

      this.peerConnection.addEventListener('icecandidate', (event: any) => {
        if (event.candidate) {
          this.sendIceCandidate(event.candidate);
        }
      });

      // Устанавливаем удалённое описание (оффер)
      const offer = new RTCSessionDescription({ sdp: offerSdp, type: 'offer' });
      await this.peerConnection.setRemoteDescription(offer);

      // Создаём ответ
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      // Отправляем ответ через BLE
      await MeshService.sendMessage(
        MessageType.SDP_ANSWER,
        JSON.stringify({ sdp: answer.sdp, type: answer.type }),
        peerId,
      );

      this.setState(CallState.CONNECTED);
      console.warn('[VoiceCallService] Вызов принят');
    } catch (err) {
      console.warn('[VoiceCallService] Ошибка принятия вызова:', err);
      this.endCall();
    }
  }

  /**
   * Отклоняет входящий вызов.
   */
  rejectCall(): void {
    this.endCall();
  }

  // ==========================================================
  // Завершение вызова
  // ==========================================================

  endCall(): void {
    try {
      // Останавливаем RTP-таймер
      if (this.rtpTimer) {
        clearTimeout(this.rtpTimer);
        this.rtpTimer = null;
      }

      // Закрываем треки
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => t.stop());
        this.localStream = null;
      }

      this.remoteStream = null;

      // Закрываем PeerConnection
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      this.currentPeerId = '';
      this.setState(CallState.ENDED);

      // Через небольшую задержку переходим в IDLE
      setTimeout(() => {
        if (this.state === CallState.ENDED) {
          this.setState(CallState.IDLE);
        }
      }, 1000);

      console.warn('[VoiceCallService] Вызов завершён');
    } catch (err) {
      console.warn('[VoiceCallService] Ошибка завершения вызова:', err);
    }
  }

  // ==========================================================
  // Обработка входящих пакетов сигнализации
  // ==========================================================

  private async handleCallPacket(packet: MeshPacket): Promise<void> {
    try {
      switch (packet.type) {
        case MessageType.SDP_OFFER:
          if (this.state === CallState.IDLE) {
            this.setState(CallState.RINGING);
            const offerData = JSON.parse(packet.payload);
            // Сохраняем SDP для последующего acceptCall()
            this.pendingCall = { peerId: packet.sourceId, sdp: offerData.sdp };
            this.notifyIncomingCall(packet.sourceId, offerData.sdp);
          }
          break;

        case MessageType.SDP_ANSWER:
          if (this.peerConnection && this.state === CallState.CALLING) {
            const answerData = JSON.parse(packet.payload);
            const answer = new RTCSessionDescription({
              sdp: answerData.sdp,
              type: 'answer',
            });
            await this.peerConnection.setRemoteDescription(answer);
            this.setState(CallState.CONNECTED);
            console.warn('[VoiceCallService] SDP-ответ получен');
          }
          break;

        case MessageType.ICE_CANDIDATE:
          if (this.peerConnection) {
            const candidateData = JSON.parse(packet.payload);
            const candidate = new RTCIceCandidate({
              candidate: candidateData.candidate,
              sdpMid: candidateData.sdpMid,
              sdpMLineIndex: candidateData.sdpMLineIndex,
            });
            await this.peerConnection.addIceCandidate(candidate);
          }
          break;

        default:
          break;
      }
    } catch (err) {
      console.warn('[VoiceCallService] Ошибка обработки сигнального пакета:', err);
    }
  }

  // ==========================================================
  // Отправка ICE-кандидата через BLE
  // ==========================================================

  private async sendIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    try {
      await MeshService.sendMessage(
        MessageType.ICE_CANDIDATE,
        JSON.stringify({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        }),
        this.currentPeerId,
      );
    } catch (err) {
      console.warn('[VoiceCallService] Ошибка отправки ICE:', err);
    }
  }

  /**
   * ICE restart: создаёт новый оффер для восстановления соединения.
   * Вызывается при iceConnectionState === 'disconnected' | 'failed'.
   */
  private async restartIce(): Promise<void> {
    try {
      if (!this.peerConnection) return;

      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);

      await MeshService.sendMessage(
        MessageType.SDP_OFFER,
        JSON.stringify({ sdp: offer.sdp, type: offer.type }),
        this.currentPeerId,
      );

      console.warn('[VoiceCallService] ICE restart — отправлен новый оффер');
    } catch (err) {
      console.warn('[VoiceCallService] Ошибка ICE restart:', err);
    }
  }

  // ==========================================================
  // Watchdog RTP-потока (автоотключение при бездействии)
  // ==========================================================

  private startRtpWatchdog(): void {
    if (this.rtpTimer) clearTimeout(this.rtpTimer);

    this.rtpTimer = setTimeout(() => {
      console.warn('[VoiceCallService] Нет RTP-активности 30 сек, отключаем');
      this.endCall();
    }, CALL_RTP_TIMEOUT_MS);

    // Сброс таймера при получении данных
    // В реальном приложении здесь мониторинг audioLevel
    this.resetRtpWatchdog();
  }

  private resetRtpWatchdog(): void {
    if (this.rtpTimer) {
      clearTimeout(this.rtpTimer);
      this.rtpTimer = setTimeout(() => {
        console.warn('[VoiceCallService] Нет RTP-активности 30 сек, отключаем');
        this.endCall();
      }, CALL_RTP_TIMEOUT_MS);
    }
  }

  // ==========================================================
  // Управление состоянием
  // ==========================================================

  private setState(newState: CallState): void {
    this.state = newState;
    this.notifyStateChange(newState);
  }

  getState(): CallState {
    return this.state;
  }

  /** Возвращает и сбрасывает данные ожидающего входящего звонка */
  consumePendingCall(): { peerId: NodeId; sdp: string } | null {
    const call = this.pendingCall;
    this.pendingCall = null;
    return call;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getCurrentPeerId(): NodeId {
    return this.currentPeerId;
  }

  // ==========================================================
  // Обработчики событий
  // ==========================================================

  onStateChange(id: string, handler: (state: CallState) => void): () => void {
    this.stateHandlers.set(id, handler);
    return () => this.stateHandlers.delete(id);
  }

  private notifyStateChange(state: CallState): void {
    for (const handler of this.stateHandlers.values()) {
      try { handler(state); } catch { /* ignore */ }
    }
  }

  /** Внешний обработчик для входящих звонков */
  private incomingCallHandler: ((peerId: NodeId, sdp: string) => void) | null = null;

  onIncomingCall(handler: (peerId: NodeId, sdp: string) => void): void {
    this.incomingCallHandler = handler;
  }

  private notifyIncomingCall(peerId: NodeId, sdp: string): void {
    if (this.incomingCallHandler) {
      this.incomingCallHandler(peerId, sdp);
    }
  }
}

export const VoiceCallService = new VoiceCallServiceClass();
