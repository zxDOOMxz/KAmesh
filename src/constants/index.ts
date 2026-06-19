// ============================================================
// Mash — константы приложения
// ============================================================

/** Максимальное количество прыжков (TTL) в mesh-сети */
export const MESH_TTL_MAX = 7;

/** Максимальное количество фрагментов в голосовом сообщении */
export const VOICE_MAX_FRAGMENTS = 100;

/** MTU BLE — максимальный размер одного пакета */
export const BLE_MTU = 512;

/** Лимит полезной нагрузки в одном BLE-пакете (с учётом заголовка) */
export const BLE_PAYLOAD_LIMIT = 480;

/** Максимальный размер голосового сообщения (30 сек @ 8kbps Opus = ~30 КБ) */
export const VOICE_MAX_SIZE_BYTES = 30_000;

/** Таймаут бездействия RTP (мс) — автоотключение вызова */
export const CALL_RTP_TIMEOUT_MS = 30_000;

/** Максимальный размер маршрутной таблицы */
export const ROUTE_TABLE_MAX_SIZE = 128;

/** Время жизни записи в маршрутной таблице (мс) */
export const ROUTE_ENTRY_TTL_MS = 300_000;

/** Интервал очистки кэша (24 часа) */
export const CACHE_CLEANUP_INTERVAL_MS = 86_400_000;

/** Интервал сканирования BLE (мс) */
export const BLE_SCAN_INTERVAL_MS = 10_000;

/** Длительность сканирования BLE (мс) */
export const BLE_SCAN_DURATION_MS = 8_000;

/** Максимальное количество узлов в маршрутной таблице */
export const MAX_PEERS_IN_ROUTE_TABLE = 50;

/** Версия протокола mesh-сети */
export const MESH_PROTOCOL_VERSION = 1;

/** Интервал отправки ping (мс) */
export const PING_INTERVAL_MS = 30_000;

/** Время хранения pending-сообщений (мс) */
export const PENDING_MESSAGE_TTL_MS = 7 * 86_400_000;

/** Время жизни DTN-бандла на промежуточном узле (7 дней) */
export const DTN_BUNDLE_TTL_MS = 7 * 86_400_000;

/** Интервал проверки DTN-очереди (мс) */
export const DTN_CHECK_INTERVAL_MS = 30_000;

/** Размер фрагмента аудио для интеркома (байт) */
export const INTERCOM_AUDIO_CHUNK_SIZE = 200;

/** Длительность одного аудио-фрагмента (мс) */
export const INTERCOM_FRAME_DURATION_MS = 60;

/** Имя канала интеркома по умолчанию */
export const INTERCOM_DEFAULT_CHANNEL = 'general';

/** Максимальный размер сообщения (символов) */
export const MAX_TEXT_LENGTH = 4096;

/** Размер одного чанка обновления (байт) */
export const UPDATE_CHUNK_SIZE = 16384;

/** Максимальный размер данных в одном BLE-пакете для обновления */
export const UPDATE_BLE_WRITE_SIZE = 400;

/** Ключ MMKV для хранения changelog ожидающего показа */
export const UPDATE_CHANGELOG_KEY = 'update_pending_changelog';

/** Ключ MMKV для хранения признака установки обновления */
export const UPDATE_FLAG_KEY = 'update_was_installed';

/** Текущая версия приложения (должна совпадать с build.gradle) */
export const APP_VERSION = '0.9.0-alpha';
export const APP_VERSION_CODE = 1;

/** Имя APK-файла обновления в cache-директории */
export const UPDATE_APK_FILENAME = 'kamesh-update.apk';

/** Ключ MMKV для хранения никнейма пользователя */
export const NICKNAME_KEY = 'user_nickname';

/** Время ожидания подтверждения никнейма (мс) */
export const NICKNAME_REGISTER_TIMEOUT_MS = 8_000;

/** Интервал рассылки NICKNAME_ANNOUNCE (мс) */
export const NICKNAME_ANNOUNCE_INTERVAL_MS = 60_000;

/** Время неактивности после которого контакт считается офлайн (мс) */
export const CONTACT_OFFLINE_TIMEOUT_MS = 180_000;

/** Запрещённые никнеймы (административные) */
export const RESERVED_NICKNAMES = [
  'администратор',
  'админ',
  'admin',
  'moderator',
  'moder',
  'root',
  'system',
  'owner',
];

/** Никнейм владельца */
export const DOOM_NICKNAME = 'doom';

/** Пароль для никнейма DOOM */
export const DOOM_NICKNAME_PASSWORD = '325063Dem';

/** Таймаут BLE-подключения (мс) */
export const BLE_CONNECT_TIMEOUT_MS = 15_000;

/** URL WebSocket relay-сервера */
export const RELAY_URL = 'wss://mesh.kamesh.app/ws';

/** Таймаут WebSocket-подключения к релею (мс) */
export const RELAY_CONNECT_TIMEOUT_MS = 10_000;

/** Таймаут TCP-подключения WiFi-транспорта (мс) */
export const WIFI_TCP_CONNECT_TIMEOUT_MS = 10_000;

/** Порт TCP для WiFi-транспорта */
export const WIFI_TCP_PORT = 4404;

/** Порт UDP для WiFi-discovery */
export const WIFI_UDP_PORT = 4405;

/** Цветовая схема (Signal/Wire минимализм) */
export const COLORS = {
  background: '#0D1117',
  surface: '#161B22',
  surfaceVariant: '#21262D',
  primary: '#58A6FF',
  primaryDark: '#1F6FEB',
  onPrimary: '#FFFFFF',
  secondary: '#3FB950',
  error: '#F85149',
  warning: '#D29922',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  textTertiary: '#484F58',
  border: '#30363D',
  bubbleSent: '#1F6FEB',
  bubbleReceived: '#21262D',
  overlay: 'rgba(0,0,0,0.6)',
} as const;
