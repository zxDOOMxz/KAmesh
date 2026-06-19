// ============================================================
// Mash — типы для офлайн-меш-коммуникации
// ============================================================

/** Уникальный идентификатор узла в mesh-сети */
export type NodeId = string;

/** Тип полезной нагрузки сообщения */
export enum MessageType {
  TEXT = 'text',
  VOICE_MAIL = 'voice_mail',
  VOICE_MAIL_CHUNK = 'voice_mail_chunk',
  SDP_OFFER = 'sdp_offer',
  SDP_ANSWER = 'sdp_answer',
  ICE_CANDIDATE = 'ice_candidate',
  KEY_EXCHANGE = 'key_exchange',
  PING = 'ping',
  PONG = 'pong',
  DELIVERY_ACK = 'delivery_ack',
  INTERCOM_AUDIO = 'intercom_audio',
  UPDATE_MANIFEST = 'update_manifest',
  UPDATE_CHUNK = 'update_chunk',
  UPDATE_CHUNK_REQUEST = 'update_chunk_request',
  NICKNAME_REGISTER = 'nickname_register',
  NICKNAME_ACCEPT = 'nickname_accept',
  NICKNAME_REJECT = 'nickname_reject',
  NICKNAME_ANNOUNCE = 'nickname_announce',
  NICKNAME_QUERY = 'nickname_query',
  NICKNAME_LIST = 'nickname_list',
  CONFERENCE_CREATE = 'conference_create',
  CONFERENCE_JOIN = 'conference_join',
  CONFERENCE_LEAVE = 'conference_leave',
  CONFERENCE_PARTICIPANTS = 'conference_participants',
  CONFERENCE_AUDIO = 'conference_audio',
  SHARE_APK_REQUEST = 'share_apk_request',
  SHARE_APK_ACCEPT = 'share_apk_accept',
  SHARE_APK_REJECT = 'share_apk_reject',
  SHARE_APK_CHUNK = 'share_apk_chunk',
  SHARE_APK_DONE = 'share_apk_done',
}

/** Статус доставки сообщения */
export enum DeliveryStatus {
  PENDING = 'pending',
  SENDING = 'sending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

/** Mesh-пакет, передаваемый между узлами */
export interface MeshPacket {
  /** UUID пакета (для дедупликации) */
  packetId: string;
  /** Тип сообщения */
  type: MessageType;
  /** ID отправителя (оригинального автора) */
  sourceId: NodeId;
  /** ID конечного получателя (может быть broadcast) */
  targetId: NodeId;
  /** ID предыдущего ретранслятора */
  relayId: NodeId;
  /** Time-To-Live: уменьшается на каждом шаге */
  ttl: number;
  /** Полезная нагрузка (base64-encoded) */
  payload: string;
  /** Время создания (ms unix) */
  timestamp: number;
  /** Флаг широковещательной рассылки */
  isBroadcast: boolean;
  /** Номер фрагмента (для голосовых сообщений) */
  fragmentIndex?: number;
  /** Общее количество фрагментов */
  fragmentTotal?: number;
  /** ID сессии фрагментированного сообщения */
  fragmentSessionId?: string;
}

/** Запись в маршрутной таблице */
export interface RouteEntry {
  nodeId: NodeId;
  /** ID узла, через который достижим nodeId */
  nextHop: NodeId;
  /** Качество связи (0–255) */
  rssi: number;
  /** Время последнего контакта */
  lastSeen: number;
  /** Количество прыжков */
  hops: number;
  /** Метка времени создания записи */
  createdAt: number;
}

/** Сообщение чата (отображаемое) */
export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: NodeId;
  text?: string;
  voiceMailUri?: string;
  voiceMailDuration?: number;
  type: MessageType;
  status: DeliveryStatus;
  timestamp: number;
  isIncoming: boolean;
  /** Прогресс загрузки голосового сообщения (0–100) */
  downloadProgress?: number;
}

/** Контакт / Собеседник */
export interface Peer {
  nodeId: NodeId;
  displayName: string;
  lastSeen: number;
  isOnline: boolean;
  rssi: number;
}

/** Состояние WebRTC-звонка */
export enum CallState {
  IDLE = 'idle',
  CALLING = 'calling',
  RINGING = 'ringing',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ENDED = 'ended',
}

/** Уведомление о звонке */
export interface CallNotification {
  callerId: NodeId;
  callType: 'audio';
  sdp: string;
  timestamp: number;
}

/** Сессия ключей (X3DH) */
export interface KeySession {
  peerId: NodeId;
  /** 32-байтовый цепочный ключ (root key) */
  rootKey: string;
  /** 32-байтовый ключ отправки */
  sendKey: string;
  /** 32-байтовый ключ получения */
  recvKey: string;
  /** Счётчик отправленных сообщений */
  sendCounter: number;
  /** Счётчик полученных сообщений */
  recvCounter: number;
  /** Время создания сессии */
  createdAt: number;
}

/** Ключевая пара для X3DH */
export interface KeyBundle {
  /** Identity Key (IK) — долговременный ключ */
  identityKey: string;
  /** Signed Pre-Key (SPK) */
  signedPreKey: string;
  /** Подпись SPK ключом IK */
  signature: string;
  /** One-Time Pre-Keys (OPK) — пул одноразовых ключей */
  oneTimePreKeys: string[];
}

// ============================================================
// Типы для OTA-обновлений через BLE mesh
// ============================================================

/** Манифест обновления — рассылается через mesh */
export interface UpdateManifest {
  version: string;
  versionCode: number;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  fileHash: string;
  changelog: string[];
  timestamp: number;
  senderId: NodeId;
  packageName: string;
  downloadUrl?: string;
}

/** Чанк (фрагмент) APK-файла */
export interface UpdateChunk {
  manifestVersionCode: number;
  chunkIndex: number;
  data: string; // base64
  totalChunks: number;
  senderId: NodeId;
}

/** Запрос чанков от пира */
export interface UpdateChunkRequest {
  manifestVersionCode: number;
  fromIndex: number;
  toIndex: number;
  requesterId: NodeId;
}

/** Запись changelog для показа после установки */
export interface ChangelogEntry {
  version: string;
  versionCode: number;
  changelog: string[];
  installedAt: number;
}

// ============================================================
// Типы для системы никнеймов
// ============================================================

/** Регистрация никнейма в mesh-сети */
export interface NicknameRegistration {
  nickname: string;
  nodeId: NodeId;
  timestamp: number;
  password?: string;
}

/** Ответ на регистрацию: принят или отклонён */
export interface NicknameResponse {
  nickname: string;
  nodeId: NodeId;
  accepted: boolean;
  reason?: string;
  timestamp: number;
}

/** Запись в локальном каталоге контактов */
export interface ContactEntry {
  nickname: string;
  nodeId: NodeId;
  lastSeen: number;
  isOnline: boolean;
}

/** Запрос списка никнеймов */
export interface NicknameQuery {
  requesterId: NodeId;
  timestamp: number;
}

/** Список известных никнеймов (ответ на запрос) */
export interface NicknameList {
  entries: { nickname: string; nodeId: NodeId; isOnline: boolean }[];
  responderId: NodeId;
  timestamp: number;
}

// ============================================================
// Типы для конференций
// ============================================================

/** Создание / реклама конференции */
export interface ConferenceInfo {
  conferenceId: string;
  name: string;
  creatorId: NodeId;
  hasPassword: boolean;
  participantCount: number;
  participants?: ConferenceParticipant[];
  createdAt: number;
}

/** Участник конференции */
export interface ConferenceParticipant {
  nickname: string;
  nodeId: NodeId;
  isSpeaking: boolean;
  joinedAt: number;
}

/** Запрос на присоединение к конференции */
export interface ConferenceJoinRequest {
  conferenceId: string;
  requesterId: NodeId;
  requesterNickname: string;
  password?: string;
}

/** Подтверждение / отклонение запроса */
export interface ConferenceJoinResponse {
  conferenceId: string;
  accepted: boolean;
  reason?: string;
  participants: ConferenceParticipant[];
}

/** Пакет аудио в конференции (голос говорящего) */
export interface ConferenceAudio {
  conferenceId: string;
  speakerId: NodeId;
  speakerNickname: string;
  audioData: string; // base64 Opus
  sequence: number;
}

/** BLE характеристика для передачи данных */
export const BLE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const BLE_TX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
export const BLE_RX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
