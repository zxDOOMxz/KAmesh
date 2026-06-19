// ============================================================
// Mash — StorageService: персистентное хранение через MMKV
// ============================================================
// Отвечает за хранение очереди сообщений, ключей шифрования,
// маршрутной таблицы и настроек устройства.
// ============================================================

import { MMKV } from 'react-native-mmkv';
import { ChatMessage, KeySession, MeshPacket, RouteEntry } from '../types';
import { CACHE_CLEANUP_INTERVAL_MS, PENDING_MESSAGE_TTL_MS, ROUTE_TABLE_MAX_SIZE } from '../constants';

/** Единственный экземпляр MMKV (быстрее, чем AsyncStorage) */
const storage = new MMKV({
  id: 'kamesh-storage',
  encryptionKey: 'kamesh-offline-mesh-v1', // шифрование диска
});

// ============================================================
// Ключи для разных типов данных
// ============================================================
const KEYS = {
  NODE_ID: 'node_id',
  KEY_BUNDLE: 'key_bundle',
  ROUTE_TABLE: 'route_table',
  PENDING_MESSAGES: 'pending_messages',
  DTN_BUNDLES: 'dtn_bundles',
  CHAT_MESSAGES_PREFIX: 'chat_msgs_',
  KEY_SESSIONS: 'key_sessions',
  LAST_CLEANUP: 'last_cleanup',
} as const;

// ============================================================
// Node ID (уникальный идентификатор устройства)
// ============================================================

export function getNodeId(): string | null {
  try {
    return storage.getString(KEYS.NODE_ID) ?? null;
  } catch (err) {
    console.warn('[StorageService] Ошибка чтения nodeId:', err);
    return null;
  }
}

export function setNodeId(id: string): void {
  try {
    storage.set(KEYS.NODE_ID, id);
  } catch (err) {
    console.warn('[StorageService] Ошибка записи nodeId:', err);
  }
}

// ============================================================
// Маршрутная таблица
// ============================================================

export function getRouteTable(): RouteEntry[] {
  try {
    const raw = storage.getString(KEYS.ROUTE_TABLE);
    if (!raw) return [];
    const entries: RouteEntry[] = JSON.parse(raw);
    return entries.filter(e => Date.now() - e.lastSeen < PENDING_MESSAGE_TTL_MS);
  } catch (err) {
    console.warn('[StorageService] Ошибка чтения маршрутной таблицы:', err);
    return [];
  }
}

export function saveRouteTable(entries: RouteEntry[]): void {
  try {
    // Ограничиваем размер таблицы
    const sorted = entries
      .sort((a, b) => b.rssi - a.rssi)
      .slice(0, ROUTE_TABLE_MAX_SIZE);
    storage.set(KEYS.ROUTE_TABLE, JSON.stringify(sorted));
  } catch (err) {
    console.warn('[StorageService] Ошибка записи маршрутной таблицы:', err);
  }
}

// ============================================================
// Pending-сообщения (store-and-forward очередь)
// ============================================================

export function getPendingMessages(): MeshPacket[] {
  try {
    const raw = storage.getString(KEYS.PENDING_MESSAGES);
    if (!raw) return [];
    const msgs: MeshPacket[] = JSON.parse(raw);
    // Удаляем просроченные
    const now = Date.now();
    return msgs.filter(m => now - m.timestamp < PENDING_MESSAGE_TTL_MS);
  } catch (err) {
    console.warn('[StorageService] Ошибка чтения очереди:', err);
    return [];
  }
}

export function savePendingMessages(msgs: MeshPacket[]): void {
  try {
    storage.set(KEYS.PENDING_MESSAGES, JSON.stringify(msgs));
  } catch (err) {
    console.warn('[StorageService] Ошибка записи очереди:', err);
  }
}

export function addPendingMessage(msg: MeshPacket): void {
  try {
    const pending = getPendingMessages();
    pending.push(msg);
    savePendingMessages(pending);
  } catch (err) {
    console.warn('[StorageService] Ошибка добавления pending-сообщения:', err);
  }
}

export function removePendingMessage(packetId: string): void {
  try {
    const pending = getPendingMessages();
    savePendingMessages(pending.filter(m => m.packetId !== packetId));
  } catch (err) {
    console.warn('[StorageService] Ошибка удаления pending-сообщения:', err);
  }
}

// ============================================================
// DTN-бандлы (пакеты, сохранённые на промежуточных узлах)
// ============================================================

export function getRelayPackets(): MeshPacket[] {
  try {
    const raw = storage.getString(KEYS.DTN_BUNDLES);
    if (!raw) return [];
    const pkts: MeshPacket[] = JSON.parse(raw);
    const now = Date.now();
    return pkts.filter(p => now - p.timestamp < PENDING_MESSAGE_TTL_MS);
  } catch (err) {
    console.warn('[StorageService] Ошибка чтения DTN-бандлов:', err);
    return [];
  }
}

export function saveRelayPackets(pkts: MeshPacket[]): void {
  try {
    storage.set(KEYS.DTN_BUNDLES, JSON.stringify(pkts));
  } catch (err) {
    console.warn('[StorageService] Ошибка записи DTN-бандлов:', err);
  }
}

export function addRelayPacket(packet: MeshPacket): void {
  try {
    const existing = getRelayPackets();
    if (existing.some(p => p.packetId === packet.packetId)) return;
    existing.push(packet);
    saveRelayPackets(existing);
  } catch (err) {
    console.warn('[StorageService] Ошибка добавления DTN-бандла:', err);
  }
}

export function removeRelayPacket(packetId: string): void {
  try {
    const existing = getRelayPackets();
    saveRelayPackets(existing.filter(p => p.packetId !== packetId));
  } catch (err) {
    console.warn('[StorageService] Ошибка удаления DTN-бандла:', err);
  }
}

// ============================================================
// Generic JSON storage (для UpdateService и других сервисов)
// ============================================================

export function getJson<T>(key: string): T | null {
  try {
    const raw = storage.getString(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[StorageService] Ошибка чтения ${key}:`, err);
    return null;
  }
}

export function setJson(key: string, value: unknown): void {
  try {
    storage.set(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[StorageService] Ошибка записи ${key}:`, err);
  }
}

export function deleteKey(key: string): void {
  try {
    storage.delete(key);
  } catch (err) {
    console.warn(`[StorageService] Ошибка удаления ${key}:`, err);
  }
}

export function containsKey(key: string): boolean {
  try {
    return storage.contains(key);
  } catch {
    return false;
  }
}

export function cleanupExpiredRelayPackets(): void {
  try {
    const pkts = getRelayPackets();
    saveRelayPackets(pkts);
  } catch (err) {
    console.warn('[StorageService] Ошибка очистки DTN-бандлов:', err);
  }
}

// ============================================================
// Сообщения чата (история переписки)
// ============================================================

export function getChatMessages(chatId: string): ChatMessage[] {
  try {
    const raw = storage.getString(`${KEYS.CHAT_MESSAGES_PREFIX}${chatId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[StorageService] Ошибка чтения истории чата:', err);
    return [];
  }
}

export function saveChatMessages(chatId: string, msgs: ChatMessage[]): void {
  try {
    storage.set(`${KEYS.CHAT_MESSAGES_PREFIX}${chatId}`, JSON.stringify(msgs));
  } catch (err) {
    console.warn('[StorageService] Ошибка записи истории чата:', err);
  }
}

export function addChatMessage(chatId: string, msg: ChatMessage): void {
  try {
    const msgs = getChatMessages(chatId);
    msgs.push(msg);
    saveChatMessages(chatId, msgs);
  } catch (err) {
    console.warn('[StorageService] Ошибка добавления сообщения:', err);
  }
}

export function updateChatMessageStatus(
  chatId: string,
  messageId: string,
  status: ChatMessage['status'],
): void {
  try {
    const msgs = getChatMessages(chatId);
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx !== -1) {
      msgs[idx].status = status;
      saveChatMessages(chatId, msgs);
    }
  } catch (err) {
    console.warn('[StorageService] Ошибка обновления статуса:', err);
  }
}

// ============================================================
// Сессии ключей шифрования
// ============================================================

export function getKeySessions(): Record<string, KeySession> {
  try {
    const raw = storage.getString(KEYS.KEY_SESSIONS);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[StorageService] Ошибка чтения сессий ключей:', err);
    return {};
  }
}

export function saveKeySession(peerId: string, session: KeySession): void {
  try {
    const sessions = getKeySessions();
    sessions[peerId] = session;
    storage.set(KEYS.KEY_SESSIONS, JSON.stringify(sessions));
  } catch (err) {
    console.warn('[StorageService] Ошибка записи сессии ключей:', err);
  }
}

export function removeKeySession(peerId: string): void {
  try {
    const sessions = getKeySessions();
    delete sessions[peerId];
    storage.set(KEYS.KEY_SESSIONS, JSON.stringify(sessions));
  } catch (err) {
    console.warn('[StorageService] Ошибка удаления сессии ключей:', err);
  }
}

// ============================================================
// Кэш ключей (KeyBundle) — хранится локально
// ============================================================

export function getKeyBundle(): string | null {
  try {
    return storage.getString(KEYS.KEY_BUNDLE) ?? null;
  } catch (err) {
    console.warn('[StorageService] Ошибка чтения KeyBundle:', err);
    return null;
  }
}

export function setKeyBundle(bundleJson: string): void {
  try {
    storage.set(KEYS.KEY_BUNDLE, bundleJson);
  } catch (err) {
    console.warn('[StorageService] Ошибка записи KeyBundle:', err);
  }
}

// ============================================================
// Очистка кэша (по расписанию — раз в 24 часа)
// ============================================================

export function performCacheCleanupIfNeeded(): void {
  try {
    const lastCleanup = storage.getNumber(KEYS.LAST_CLEANUP) ?? 0;
    const now = Date.now();

    if (now - lastCleanup < CACHE_CLEANUP_INTERVAL_MS) return;

    // Очищаем просроченные pending-сообщения
    const pending = getPendingMessages();
    savePendingMessages(pending);

    // Очищаем просроченные маршруты
    const routes = getRouteTable();
    saveRouteTable(routes);

    // Очищаем просроченные DTN-бандлы
    cleanupExpiredRelayPackets();

    storage.set(KEYS.LAST_CLEANUP, now);
  } catch (err) {
    console.warn('[StorageService] Ошибка очистки кэша:', err);
  }
}

/** Проверка, инициализировано ли хранилище */
export function isStorageInitialized(): boolean {
  return storage.contains(KEYS.NODE_ID);
}
