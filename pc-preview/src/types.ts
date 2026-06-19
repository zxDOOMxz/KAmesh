export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  voiceMailUri?: string;
  voiceMailDuration?: number;
  type: 'text' | 'voice' | 'system';
  status: 'sending' | 'sent' | 'delivered' | 'failed';
  timestamp: number;
  isIncoming: boolean;
}

export interface Contact {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'connecting';
  rssi: number;
  lastSeen: number;
  unread: number;
}

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

export const COLORS = {
  background: '#0D1117',
  surface: '#161B22',
  surfaceVariant: '#21262D',
  primary: '#58A6FF',
  primaryDim: '#1F6FEB',
  error: '#F85149',
  success: '#3FB950',
  warning: '#D29922',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  textTertiary: '#484F58',
  border: '#30363D',
  bubbleSelf: '#1F6FEB',
  bubbleOther: '#21262D',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const MOCK_CONTACTS: Contact[] = [
  { id: 'peer-alice', name: 'Алиса', status: 'online', rssi: -65, lastSeen: Date.now() - 60000, unread: 2 },
  { id: 'peer-bob', name: 'Боб', status: 'offline', rssi: -90, lastSeen: Date.now() - 7200000, unread: 0 },
  { id: 'peer-charlie', name: 'Чарли', status: 'online', rssi: -72, lastSeen: Date.now() - 300000, unread: 5 },
  { id: 'peer-diana', name: 'Диана', status: 'connecting', rssi: -80, lastSeen: Date.now() - 1800000, unread: 1 },
];

export const MOCK_MESSAGES: Record<string, ChatMessage[]> = {
  'peer-alice': [
    { id: 'm1', chatId: 'peer-alice', senderId: 'peer-alice', text: 'Привет! Есть связь?', type: 'text', status: 'delivered', timestamp: Date.now() - 3600000, isIncoming: true },
    { id: 'm2', chatId: 'peer-alice', senderId: 'me', text: 'Да, ловлю тебя на -65 dBm', type: 'text', status: 'delivered', timestamp: Date.now() - 3500000, isIncoming: false },
    { id: 'm3', chatId: 'peer-alice', senderId: 'peer-alice', text: 'Отлично! Я в парке, у тебя как?', type: 'text', status: 'delivered', timestamp: Date.now() - 3400000, isIncoming: true },
    { id: 'm4', chatId: 'peer-alice', senderId: 'me', text: 'Сижу дома, через 2 ретрансляции до тебя', type: 'text', status: 'delivered', timestamp: Date.now() - 3300000, isIncoming: false },
    { id: 'm5', chatId: 'peer-alice', senderId: 'peer-alice', text: 'Круто! Давай созвонимся?', type: 'text', status: 'delivered', timestamp: Date.now() - 300000, isIncoming: true },
    { id: 'm6', chatId: 'peer-alice', senderId: 'me', voiceMailUri: '#', voiceMailDuration: 12, type: 'voice', status: 'delivered', timestamp: Date.now() - 120000, isIncoming: false },
    { id: 'm7', chatId: 'peer-alice', senderId: 'peer-alice', text: 'Голосовое получил, качество норм!', type: 'text', status: 'delivered', timestamp: Date.now() - 60000, isIncoming: true },
  ],
  'peer-charlie': [
    { id: 'c1', chatId: 'peer-charlie', senderId: 'peer-charlie', text: 'Есть сеть?', type: 'text', status: 'delivered', timestamp: Date.now() - 86400000, isIncoming: true },
    { id: 'c2', chatId: 'peer-charlie', senderId: 'me', text: 'Да, через Боба', type: 'text', status: 'delivered', timestamp: Date.now() - 86000000, isIncoming: false },
  ],
};
