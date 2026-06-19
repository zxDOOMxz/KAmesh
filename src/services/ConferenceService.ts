// ============================================================
// Mash — ConferenceService: голосовые конференции
// ============================================================
// Позволяет создать конференцию (открытую / с паролем).
// Открытые конференции видны всем в радиусе — уведомление
// приходит автоматически. Участники видят никнеймы,
// говорящий подсвечивается.
// ============================================================

import uuidv4 from 'react-native-uuid';
import { MeshService } from './MeshService';
import { getNodeId } from './StorageService';
import { ContactService } from './ContactService';
import {
  MessageType,
  NodeId,
  MeshPacket,
  ConferenceInfo,
  ConferenceParticipant,
  ConferenceJoinRequest,
  ConferenceJoinResponse,
  ConferenceAudio,
} from '../types';

type ConferenceHandler = (event: ConferenceEvent) => void;

interface ConferenceEvent {
  type: 'created' | 'joined' | 'left' | 'participant_joined' | 'participant_left' | 'speaker_changed' | 'audio' | 'discovered' | 'error';
  conference?: ConferenceInfo;
  participant?: ConferenceParticipant;
  audio?: ConferenceAudio;
  error?: string;
}

class ConferenceServiceClass {
  private initialized = false;
  private myNodeId: NodeId = '';

  /** Конференции, созданные или найденные рядом */
  private knownConferences = new Map<string, ConferenceInfo>();

  /** Конференция, в которой мы сейчас участвуем */
  private activeConferenceId: string | null = null;

  /** Участники активной конференции */
  private participants = new Map<NodeId, ConferenceParticipant>();

  /** Handler для уведомлений UI */
  private handlers: ConferenceHandler[] = [];

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.myNodeId = getNodeId() || '';

    MeshService.onPacket(this.handlePacket.bind(this));

    this.initialized = true;
    console.warn('[ConferenceService] Инициализирован');
  }

  destroy(): void {
    if (this.activeConferenceId) {
      this.leave(this.activeConferenceId);
    }
    this.knownConferences.clear();
    this.participants.clear();
    this.handlers = [];
  }

  // ==========================================================
  // Создание / присоединение / выход
  // ==========================================================

  /** Создать конференцию */
  async create(name: string, password?: string): Promise<ConferenceInfo> {
    if (this.activeConferenceId) {
      throw new Error('Вы уже в конференции. Покиньте её перед созданием новой.');
    }

    const conferenceId = uuidv4.v4();
    const myNickname = ContactService.getMyNickname() || 'unknown';

    const conference: ConferenceInfo = {
      conferenceId,
      name,
      creatorId: this.myNodeId,
      hasPassword: !!password,
      participantCount: 1,
      participants: [{
        nickname: myNickname,
        nodeId: this.myNodeId,
        isSpeaking: false,
        joinedAt: Date.now(),
      }],
      createdAt: Date.now(),
    };

    // Сохраняем локально
    this.knownConferences.set(conferenceId, conference);
    this.activeConferenceId = conferenceId;
    this.participants.set(this.myNodeId, conference.participants![0]);

    // Рекламируем в mesh
    await MeshService.sendMessage(
      MessageType.CONFERENCE_CREATE,
      JSON.stringify({ ...conference, password }), // пароль только для проверки, не храним
      'broadcast',
    );

    this.notify({ type: 'created', conference });
    console.warn(`[ConferenceService] Конференция "${name}" создана (ID: ${conferenceId})`);
    return conference;
  }

  /** Присоединиться к конференции */
  async join(conferenceId: string, password?: string): Promise<boolean> {
    const conference = this.knownConferences.get(conferenceId);
    if (!conference) {
      this.notify({ type: 'error', error: 'Конференция не найдена' });
      return false;
    }

    if (conference.hasPassword && !password) {
      this.notify({ type: 'error', error: 'Требуется пароль' });
      return false;
    }

    const myNickname = ContactService.getMyNickname() || 'unknown';

    const request: ConferenceJoinRequest = {
      conferenceId,
      requesterId: this.myNodeId,
      requesterNickname: myNickname,
      password,
    };

    // Отправляем запрос создателю (или broadcast)
    await MeshService.sendMessage(
      MessageType.CONFERENCE_JOIN,
      JSON.stringify(request),
      conference.creatorId,
    );

    // Оптимистично добавляем себя
    this.activeConferenceId = conferenceId;

    const me: ConferenceParticipant = {
      nickname: myNickname,
      nodeId: this.myNodeId,
      isSpeaking: false,
      joinedAt: Date.now(),
    };
    this.participants.set(this.myNodeId, me);

    this.notify({ type: 'joined', conference });
    console.warn(`[ConferenceService] Присоединился к "${conference.name}"`);
    return true;
  }

  /** Покинуть конференцию */
  async leave(conferenceId: string): Promise<void> {
    if (this.activeConferenceId !== conferenceId) return;

    await MeshService.sendMessage(
      MessageType.CONFERENCE_LEAVE,
      JSON.stringify({
        conferenceId,
        leaverId: this.myNodeId,
        leaverNickname: ContactService.getMyNickname() || 'unknown',
      }),
      'broadcast',
    );

    this.activeConferenceId = null;
    this.participants.clear();

    this.notify({ type: 'left' });
    console.warn(`[ConferenceService] Покинул конференцию`);
  }

  // ==========================================================
  // Голосовая активность
  // ==========================================================

  /** Отправить аудио-пакет в конференцию (вызывается из IntercomService) */
  async sendAudio(audioData: string, sequence: number): Promise<void> {
    if (!this.activeConferenceId) return;

    const packet: ConferenceAudio = {
      conferenceId: this.activeConferenceId,
      speakerId: this.myNodeId,
      speakerNickname: ContactService.getMyNickname() || 'unknown',
      audioData,
      sequence,
    };

    await MeshService.sendMessage(
      MessageType.CONFERENCE_AUDIO,
      JSON.stringify(packet),
      'broadcast',
    );
  }

  /** Пометить, что я сейчас говорю */
  async setSpeaking(speaking: boolean): Promise<void> {
    if (!this.activeConferenceId) return;

    const me = this.participants.get(this.myNodeId);
    if (me) {
      me.isSpeaking = speaking;
    }
  }

  // ==========================================================
  // Доступ к данным
  // ==========================================================

  /** Найти конференции рядом (открытые) */
  getOpenConferences(): ConferenceInfo[] {
    return Array.from(this.knownConferences.values())
      .filter(c => !c.hasPassword);
  }

  /** Получить все известные конференции */
  getKnownConferences(): ConferenceInfo[] {
    return Array.from(this.knownConferences.values());
  }

  /** Активная конференция */
  getActiveConferenceId(): string | null {
    return this.activeConferenceId;
  }

  /** Получить информацию об активной конференции */
  getActiveConference(): ConferenceInfo | null {
    if (!this.activeConferenceId) return null;
    return this.knownConferences.get(this.activeConferenceId) || null;
  }

  /** Участники активной конференции */
  getParticipants(): ConferenceParticipant[] {
    return Array.from(this.participants.values());
  }

  /** Подписка на события */
  onEvent(handler: ConferenceHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  // ==========================================================
  // Обработка mesh-пакетов
  // ==========================================================

  private async handlePacket(packet: MeshPacket): Promise<void> {
    switch (packet.type) {
      case MessageType.CONFERENCE_CREATE:
        await this.handleConferenceCreate(packet);
        break;
      case MessageType.CONFERENCE_JOIN:
        await this.handleJoinRequest(packet);
        break;
      case MessageType.CONFERENCE_LEAVE:
        await this.handleLeave(packet);
        break;
      case MessageType.CONFERENCE_PARTICIPANTS:
        await this.handleParticipantsUpdate(packet);
        break;
      case MessageType.CONFERENCE_AUDIO:
        await this.handleAudio(packet);
        break;
    }
  }

  /** Получена реклама новой конференции */
  private async handleConferenceCreate(packet: MeshPacket): Promise<void> {
    try {
      const conf: ConferenceInfo = JSON.parse(packet.payload);
      if (this.knownConferences.has(conf.conferenceId)) return;
      if (conf.creatorId === this.myNodeId) return;

      this.knownConferences.set(conf.conferenceId, conf);
      this.notify({ type: 'discovered', conference: conf });
      console.warn(`[ConferenceService] Найдена конференция "${conf.name}"`);
    } catch { /* ignore */ }
  }

  /** Кто-то хочет присоединиться */
  private async handleJoinRequest(packet: MeshPacket): Promise<void> {
    try {
      const request: ConferenceJoinRequest = JSON.parse(packet.payload);
      if (request.requesterId === this.myNodeId) return;
      if (this.activeConferenceId !== request.conferenceId) return;

      const conference = this.knownConferences.get(request.conferenceId);
      if (!conference) return;

      // Для открытых — сразу пускаем
      const participant: ConferenceParticipant = {
        nickname: request.requesterNickname,
        nodeId: request.requesterId,
        isSpeaking: false,
        joinedAt: Date.now(),
      };

      this.participants.set(request.requesterId, participant);
      conference.participantCount = this.participants.size;

      this.notify({ type: 'participant_joined', participant });

      // Отправляем подтверждение
      const response: ConferenceJoinResponse = {
        conferenceId: request.conferenceId,
        accepted: true,
        participants: this.getParticipants(),
      };

      await MeshService.sendMessage(
        MessageType.CONFERENCE_PARTICIPANTS,
        JSON.stringify(response),
        request.requesterId,
      );
    } catch { /* ignore */ }
  }

  /** Кто-то покинул конференцию */
  private async handleLeave(packet: MeshPacket): Promise<void> {
    try {
      const data = JSON.parse(packet.payload);
      if (data.leaverId === this.myNodeId) return;

      const participant = this.participants.get(data.leaverId);
      if (participant) {
        this.participants.delete(data.leaverId);
        this.notify({ type: 'participant_left', participant });
      }
    } catch { /* ignore */ }
  }

  /** Обновление списка участников */
  private async handleParticipantsUpdate(packet: MeshPacket): Promise<void> {
    try {
      const response: ConferenceJoinResponse = JSON.parse(packet.payload);
      if (!this.activeConferenceId) {
        // Мы успешно присоединились (ответ на наш JOIN)
        this.activeConferenceId = response.conferenceId;
      }

      for (const p of response.participants) {
        this.participants.set(p.nodeId, p);
      }

      const conf = this.knownConferences.get(response.conferenceId);
      if (conf) {
        conf.participantCount = response.participants.length;
      }

      this.notify({ type: 'participant_joined', conference: conf || undefined });
    } catch { /* ignore */ }
  }

  /** Получен аудио-пакет */
  private async handleAudio(packet: MeshPacket): Promise<void> {
    try {
      const audio: ConferenceAudio = JSON.parse(packet.payload);
      if (audio.conferenceId !== this.activeConferenceId) return;
      if (audio.speakerId === this.myNodeId) return;

      // Обновляем статус говорящего
      for (const [, p] of this.participants) {
        p.isSpeaking = p.nodeId === audio.speakerId;
      }

      this.notify({ type: 'audio', audio });
      this.notify({ type: 'speaker_changed' });
    } catch { /* ignore */ }
  }

  // ==========================================================
  // Уведомление
  // ==========================================================

  private notify(event: ConferenceEvent): void {
    for (const handler of this.handlers) {
      try { handler(event); } catch { /* ignore */ }
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export const ConferenceService = new ConferenceServiceClass();
