// ============================================================
// Mash — ChatScreen: меню, чат, PTT, конференции
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Modal,
  ActivityIndicator,
} from 'react-native';
import uuidv4 from 'react-native-uuid';
import { COLORS } from '../constants';
import { MeshService } from '../services/MeshService';
import { ContactService } from '../services/ContactService';
import { ConferenceService } from '../services/ConferenceService';
import { IntercomService } from '../services/IntercomService';
import * as VoiceMailService from '../services/VoiceMailService';
import { VoiceCallService } from '../services/VoiceCallService';
import { addChatMessage, getChatMessages } from '../services/StorageService';
import { MessageType, ChatMessage, DeliveryStatus, ContactEntry, ConferenceInfo, ConferenceParticipant } from '../types';
import { ShareService, ShareEvent } from '../services/ShareService';
import { SoundService } from '../services/SoundService';

type Screen = 'menu' | 'contacts' | 'chat' | 'voice_call' | 'conf_list' | 'conf_create' | 'conf_room' | 'new_contact' | 'share_contacts' | 'share_progress' | 'share_incoming';

export function ChatScreen() {
  const [screen, setScreen] = useState<Screen>('menu');

  // --- contact ---
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [searchNick, setSearchNick] = useState('');

  // --- chat ---
  const [chatPeerId, setChatPeerId] = useState('');
  const [chatPeerName, setChatPeerName] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');

  // --- ptt / voice call ---
  const [isPttActive, setPttActive] = useState(false);
  const [callState, setCallState] = useState('idle');

  // --- conference ---
  const [conferences, setConferences] = useState<ConferenceInfo[]>([]);
  const [confName, setConfName] = useState('');
  const [confPassword, setConfPassword] = useState('');
  const [confHasPwd, setConfHasPwd] = useState(false);
  const [confSearch, setConfSearch] = useState('');
  const [participants, setParticipants] = useState<ConferenceParticipant[]>([]);

  // --- share app ---
  const [shareProgress, setShareProgress] = useState(0);
  const [shareStatus, setShareStatus] = useState('');
  const [incomingShareFrom, setIncomingShareFrom] = useState('');
  const [incomingShareNick, setIncomingShareNick] = useState('');

  const pttRef = useRef(false);

  useEffect(() => {
    const unsubContact = ContactService.onChange(() => {
      setContacts(ContactService.getContacts());
    });
    setContacts(ContactService.getContacts());

    MeshService.onPacket((packet) => {
      if (packet.type === MessageType.TEXT && !packet.isBroadcast) {
        const msg: ChatMessage = {
          id: packet.packetId,
          chatId: packet.sourceId,
          senderId: packet.sourceId,
          text: packet.payload,
          type: MessageType.TEXT,
          status: DeliveryStatus.DELIVERED,
          timestamp: packet.timestamp,
          isIncoming: true,
        };
        const name = ContactService.getByNickname(packet.sourceId)?.nickname || packet.sourceId.slice(0, 8);
        setChatPeerName(name);
        setChatPeerId(packet.sourceId);
        setMessages(prev => [...prev, msg]);
        addChatMessage(packet.sourceId, msg);
        SoundService.playNotification();
      }
    });

    const unsubConf = ConferenceService.onEvent((event) => {
      if (event.type === 'discovered') {
        setConferences(ConferenceService.getOpenConferences());
      }
      if (event.type === 'participant_joined' || event.type === 'participant_left' || event.type === 'speaker_changed') {
        setParticipants(ConferenceService.getParticipants());
      }
    });

    const unsubShare = ShareService.onEvent((event) => {
      if (event.type === 'request_received') {
        setIncomingShareFrom(event.fromPeer);
        setIncomingShareNick(event.fromNickname);
        setScreen('share_incoming');
      } else if (event.type === 'accepted') {
        setShareStatus('Пир принял запрос. Отправка...');
      } else if (event.type === 'progress') {
        setShareProgress(event.progress);
        setShareStatus(`Отправка... ${event.progress}%`);
      } else if (event.type === 'complete') {
        setShareStatus('Готово! Приложение отправлено.');
        Alert.alert('Отправлено', 'APK успешно отправлен пиру.');
        setScreen('menu');
      } else if (event.type === 'rejected') {
        setShareStatus('Пир отклонил запрос.');
        Alert.alert('Отклонено', 'Пользователь отклонил получение приложения.');
        setScreen('menu');
      } else if (event.type === 'error') {
        setShareStatus(`Ошибка: ${event.error}`);
        Alert.alert('Ошибка', event.error);
      } else if (event.type === 'chunk_received') {
        setShareProgress(event.progress);
        setShareStatus(`Получение... ${event.progress}%`);
      } else if (event.type === 'transfer_complete') {
        setShareStatus('APK получен!');
      } else if (event.type === 'ready_for_install') {
        Alert.alert(
          'Приложение получено',
          'KAmesh получен от соседнего устройства. Установить?',
          [
            { text: 'Позже', style: 'cancel' },
            { text: 'Установить', onPress: () => ShareService.installReceivedApk() },
          ],
        );
        setScreen('menu');
      }
    });

    return () => { unsubContact(); unsubConf(); unsubShare(); };
  }, []);

  // ============================
  // Actions
  // ============================

  const openChat = (contact: ContactEntry) => {
    setChatPeerId(contact.nodeId);
    setChatPeerName(contact.nickname);
    setMessages(getChatMessages(contact.nodeId));
    setScreen('chat');
  };

  const startVoiceCall = (contact: ContactEntry) => {
    setChatPeerId(contact.nodeId);
    setChatPeerName(contact.nickname);
    setScreen('voice_call');
    VoiceCallService.startCall(contact.nodeId);
  };

  const sendText = async () => {
    if (!inputText.trim() || !chatPeerId) return;
    const msg: ChatMessage = {
      id: uuidv4.v4(),
      chatId: chatPeerId,
      senderId: 'me',
      text: inputText.trim(),
      type: MessageType.TEXT,
      status: DeliveryStatus.SENDING,
      timestamp: Date.now(),
      isIncoming: false,
    };
    setMessages(prev => [...prev, msg]);
    setInputText('');
    addChatMessage(chatPeerId, msg);
    try {
      await MeshService.sendMessage(MessageType.TEXT, msg.text!, chatPeerId);
    } catch { /* offline */ }
  };

  const pttDown = () => {
    pttRef.current = true;
    setPttActive(true);
    IntercomService.startTransmitting();
  };

  const pttUp = () => {
    pttRef.current = false;
    setPttActive(false);
    IntercomService.stopTransmitting();
  };

  const createConference = async () => {
    if (!confName.trim()) return;
    await ConferenceService.create(confName.trim(), confHasPwd ? confPassword : undefined);
    setScreen('conf_room');
    setParticipants(ConferenceService.getParticipants());
  };

  const joinConference = async (conf: ConferenceInfo) => {
    await ConferenceService.join(conf.conferenceId, conf.hasPassword ? undefined : undefined);
    setScreen('conf_room');
    setParticipants(ConferenceService.getParticipants());
  };

  const leaveConference = async () => {
    const id = ConferenceService.getActiveConferenceId();
    if (id) await ConferenceService.leave(id);
    setScreen('conf_list');
  };

  // --- share ---
  const startShare = async (contact: ContactEntry) => {
    setShareProgress(0);
    setShareStatus('Отправка запроса...');
    setScreen('share_progress');
    try {
      await ShareService.sendApk(contact.nodeId);
    } catch (err) {
      setShareStatus('Ошибка отправки запроса');
      Alert.alert('Ошибка', 'Не удалось отправить запрос пиру.');
      setScreen('menu');
    }
  };

  const acceptIncomingShare = async () => {
    setShareStatus('Принято, получение...');
    setShareProgress(0);
    setScreen('share_progress');
    await ShareService.acceptIncoming(true);
  };

  const rejectIncomingShare = async () => {
    await ShareService.acceptIncoming(false);
    setScreen('menu');
  };

  // ============================
  // Render helpers
  // ============================

  const filteredContacts = searchNick
    ? contacts.filter(c => c.nickname.toLowerCase().includes(searchNick.toLowerCase()))
    : contacts;

  const renderMenu = () => (
    <View style={s.menu}>
      <Text style={s.menuTitle}>KAmesh</Text>
      <Text style={s.menuSub}>{ContactService.getMyNickname() || '...'}</Text>
      <View style={s.menuGroup}>
        {([
          { label: 'Отправить сообщение', icon: '💬', target: 'contacts' as Screen },
          { label: 'Отправить голосовое', icon: '🎤', target: 'contacts' as Screen },
          { label: 'Голосовая связь', icon: '📞', target: 'contacts' as Screen },
          { label: 'Создать конференцию', icon: '👥', target: 'conf_create' as Screen },
          { label: 'Войти в конференцию', icon: '🚪', target: 'conf_list' as Screen },
          { label: 'Поделиться приложением', icon: '📤', target: 'share_contacts' as Screen },
        ] as const).map((item) => (
          <TouchableOpacity key={item.label} style={s.menuBtn} onPress={() => setScreen(item.target)} activeOpacity={0.7}>
            <Text style={s.menuBtnIcon}>{item.icon}</Text>
            <Text style={s.menuBtnLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderContacts = (action: 'chat' | 'voice' | 'call') => (
    <View style={s.contactsWrap}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setScreen('menu')}><Text style={s.back}>{'< Назад'}</Text></TouchableOpacity>
        <Text style={s.headerTitle}>
          {action === 'chat' ? 'Выберите получателя' : action === 'voice' ? 'Голосовое сообщение' : 'Вызов'}
        </Text>
      </View>
      <TextInput
        style={s.searchInput}
        placeholder="Введите никнейм..."
        placeholderTextColor={COLORS.textTertiary}
        value={searchNick}
        onChangeText={setSearchNick}
      />
      <FlatList
        data={filteredContacts}
        keyExtractor={c => c.nodeId}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.contactRow} onPress={() => {
            if (action === 'chat') openChat(item);
            else if (action === 'call') startVoiceCall(item);
            else openChat(item);
          }}>
            <View style={[s.contactAvatar, { backgroundColor: item.isOnline ? COLORS.primaryDark : COLORS.surfaceVariant }]}>
              <Text style={s.avatarText}>{item.nickname[0].toUpperCase()}</Text>
            </View>
            <View style={s.contactInfo}>
              <Text style={s.contactName}>{item.nickname}</Text>
              <Text style={s.contactStatus}>
                <Text style={{ color: item.isOnline ? COLORS.secondary : COLORS.textTertiary }}>●</Text>
                {' '}{item.isOnline ? 'Онлайн' : 'Офлайн'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.emptyText}>Нет контактов. Подождите, идёт поиск...</Text>}
      />
      <TouchableOpacity style={s.manualBtn} onPress={() => setScreen('new_contact')}>
        <Text style={s.manualBtnText}>Ввести никнейм вручную</Text>
      </TouchableOpacity>
    </View>
  );

  const renderNewContact = (target: 'chat' | 'voice' | 'call') => (
    <View style={s.contactsWrap}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setScreen('contacts')}><Text style={s.back}>{'< Назад'}</Text></TouchableOpacity>
        <Text style={s.headerTitle}>Введите никнейм</Text>
      </View>
      <View style={s.pad}>
        <TextInput
          style={s.searchInput}
          placeholder="Никнейм получателя"
          placeholderTextColor={COLORS.textTertiary}
          value={searchNick}
          onChangeText={setSearchNick}
          autoFocus
        />
        <TouchableOpacity style={s.goBtn} onPress={() => {
          const contact = ContactService.getByNickname(searchNick);
          if (contact) {
            if (target === 'chat') openChat(contact);
            else if (target === 'call') startVoiceCall(contact);
            else openChat(contact);
          } else {
            Alert.alert('Не найден', 'Пользователь с таким никнеймом не найден. Попробуйте ещё раз.');
          }
        }}>
          <Text style={s.goBtnText}>Найти и открыть</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderConfList = () => {
    const filtered = confSearch
      ? conferences.filter(c => c.name.toLowerCase().includes(confSearch.toLowerCase()))
      : conferences;

    return (
      <View style={s.contactsWrap}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setScreen('menu')}><Text style={s.back}>{'< Назад'}</Text></TouchableOpacity>
          <Text style={s.headerTitle}>Войти в конференцию</Text>
        </View>
        <TextInput style={s.searchInput} placeholder="Поиск конференции..." placeholderTextColor={COLORS.textTertiary}
          value={confSearch} onChangeText={setConfSearch} />
        <FlatList
          data={filtered}
          keyExtractor={c => c.conferenceId}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.confCard} onPress={() => joinConference(item)}>
              <Text style={s.confName}>{item.name}</Text>
              <View style={s.confMeta}>
                <Text style={s.confBadge}>{item.hasPassword ? '🔒' : '🔓'}</Text>
                <Text style={s.confParticipants}>{item.participantCount} уч.</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.emptyText}>
            {confSearch ? 'Ничего не найдено' : 'Нет открытых конференций рядом'}
          </Text>}
        />
      </View>
    );
  };

  const renderConfCreate = () => (
    <View style={s.contactsWrap}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setScreen('conf_list')}><Text style={s.back}>{'< Назад'}</Text></TouchableOpacity>
        <Text style={s.headerTitle}>Новая конференция</Text>
      </View>
      <View style={s.pad}>
        <TextInput style={s.searchInput} placeholder="Название (МКАД 1, Байкал...)" placeholderTextColor={COLORS.textTertiary}
          value={confName} onChangeText={setConfName} autoFocus />
        <TouchableOpacity style={s.toggleBtn} onPress={() => setConfHasPwd(!confHasPwd)}>
          <Text style={s.toggleText}>{confHasPwd ? '🔒 Закрытая (с паролем)' : '🔓 Открытая (без пароля)'}</Text>
        </TouchableOpacity>
        {confHasPwd && (
          <TextInput style={s.searchInput} placeholder="Пароль" placeholderTextColor={COLORS.textTertiary}
            value={confPassword} onChangeText={setConfPassword} secureTextEntry />
        )}
        <TouchableOpacity style={s.goBtn} onPress={createConference}>
          <Text style={s.goBtnText}>Создать</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderConfRoom = () => {
    const conf = ConferenceService.getActiveConference();
    return (
      <View style={s.confRoom}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{conf?.name || 'Конференция'}</Text>
          <TouchableOpacity onPress={leaveConference}><Text style={{ color: COLORS.error, fontSize: 14 }}>Покинуть</Text></TouchableOpacity>
        </View>
        <FlatList
          data={participants}
          keyExtractor={p => p.nodeId}
          renderItem={({ item }) => (
            <View style={[s.participantRow, item.isSpeaking && s.participantSpeaking]}>
              <View style={[s.participantDot, { backgroundColor: item.isSpeaking ? COLORS.secondary : COLORS.textTertiary }]} />
              <Text style={s.participantName}>{item.nickname}</Text>
              {item.isSpeaking && <Text style={s.speakingBadge}>Говорит</Text>}
            </View>
          )}
        />
        <TouchableOpacity
          style={[s.pttBtn, isPttActive && s.pttActive]}
          onPressIn={pttDown}
          onPressOut={pttUp}
        >
          <Text style={s.pttText}>{isPttActive ? '🔴 Говорите...' : '🎤 Нажмите для речи'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderShareContacts = () => (
    <View style={s.contactsWrap}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setScreen('menu')}><Text style={s.back}>{'< Назад'}</Text></TouchableOpacity>
        <Text style={s.headerTitle}>Кому отправить приложение?</Text>
      </View>
      <TextInput
        style={s.searchInput}
        placeholder="Введите никнейм..."
        placeholderTextColor={COLORS.textTertiary}
        value={searchNick}
        onChangeText={setSearchNick}
      />
      <FlatList
        data={filteredContacts}
        keyExtractor={c => c.nodeId}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.contactRow} onPress={() => startShare(item)}>
            <View style={[s.contactAvatar, { backgroundColor: item.isOnline ? COLORS.primaryDark : COLORS.surfaceVariant }]}>
              <Text style={s.avatarText}>{item.nickname[0].toUpperCase()}</Text>
            </View>
            <View style={s.contactInfo}>
              <Text style={s.contactName}>{item.nickname}</Text>
              <Text style={s.contactStatus}>
                <Text style={{ color: item.isOnline ? COLORS.secondary : COLORS.textTertiary }}>●</Text>
                {' '}{item.isOnline ? 'Онлайн' : 'Офлайн'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={s.emptyText}>Нет контактов. Подождите, идёт поиск...</Text>}
      />
      <TouchableOpacity style={s.manualBtn} onPress={() => setScreen('new_contact')}>
        <Text style={s.manualBtnText}>Ввести никнейм вручную</Text>
      </TouchableOpacity>
    </View>
  );

  const renderShareProgress = () => (
    <View style={[s.contactsWrap, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
      <Text style={{ color: COLORS.textPrimary, fontSize: 24, marginBottom: 16 }}>📤</Text>
      <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 24 }}>
        {shareStatus}
      </Text>
      <View style={{ width: '80%', height: 8, backgroundColor: COLORS.surfaceVariant, borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ width: `${Math.min(shareProgress, 100)}%`, height: '100%', backgroundColor: COLORS.primary, borderRadius: 4 }} />
      </View>
      <Text style={{ color: COLORS.textSecondary, fontSize: 13, marginTop: 8 }}>{shareProgress}%</Text>
    </View>
  );

  const renderShareIncoming = () => (
    <View style={[s.contactsWrap, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
      <Text style={{ color: COLORS.textPrimary, fontSize: 40, marginBottom: 16 }}>📲</Text>
      <Text style={{ color: COLORS.textPrimary, fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 }}>
        {incomingShareNick} хочет поделиться приложением
      </Text>
      <Text style={{ color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 32 }}>
        Вы получите KAmesh напрямую через mesh-сеть
      </Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <TouchableOpacity
          style={[s.goBtn, { backgroundColor: COLORS.error, flex: 1 }]}
          onPress={rejectIncomingShare}
        >
          <Text style={s.goBtnText}>Отклонить</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.goBtn, { flex: 1 }]}
          onPress={acceptIncomingShare}
        >
          <Text style={s.goBtnText}>Принять</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderChat = () => (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setScreen('menu')}><Text style={s.back}>{'< Назад'}</Text></TouchableOpacity>
        <Text style={s.headerTitle}>{chatPeerName}</Text>
      </View>
      <FlatList
        data={messages}
        keyExtractor={m => m.id}
        style={{ flex: 1 }}
        renderItem={({ item }) => (
          <View style={[s.bubble, item.isIncoming ? s.bubbleIn : s.bubbleOut]}>
            <Text style={[s.bubbleText, { color: item.isIncoming ? COLORS.textPrimary : COLORS.onPrimary }]}>
              {item.text}
            </Text>
          </View>
        )}
      />
      <View style={s.inputBar}>
        <TextInput style={s.chatInput} value={inputText} onChangeText={setInputText}
          placeholder="Сообщение..." placeholderTextColor={COLORS.textTertiary} />
        <TouchableOpacity style={s.sendBtn} onPress={sendText}>
          <Text style={s.sendBtnText}>→</Text>
        </TouchableOpacity>
      </View>
      <View style={s.pttBar}>
        <TouchableOpacity
          style={[s.pttMini, isPttActive && s.pttActive]}
          onPressIn={pttDown}
          onPressOut={pttUp}
        >
          <Text style={s.pttMiniText}>{isPttActive ? '🔴' : '🎤 PTT'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (screen === 'menu') return renderMenu();
  if (screen === 'contacts') return renderContacts('chat');
  if (screen === 'new_contact') return renderNewContact('chat');
  if (screen === 'voice_call') return <VoiceCallView />;
  if (screen === 'share_contacts') return renderShareContacts();
  if (screen === 'share_progress') return renderShareProgress();
  if (screen === 'share_incoming') return renderShareIncoming();
  if (screen === 'conf_list') return renderConfList();
  if (screen === 'conf_create') return renderConfCreate();
  if (screen === 'conf_room') return renderConfRoom();
  if (screen === 'chat') return renderChat();

  return renderMenu();
}

// ============================
// VoiceCall stub
// ============================

function VoiceCallView() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: COLORS.textPrimary, fontSize: 18 }}>📞 Звонок...</Text>
    </View>
  );
}

// ============================
// Styles
// ============================

const s = StyleSheet.create({
  // menu
  menu: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', padding: 24 },
  menuTitle: { fontSize: 28, fontWeight: '700', color: COLORS.primary, textAlign: 'center' },
  menuSub: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 32 },
  menuGroup: { gap: 12 },
  menuBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, padding: 18, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, gap: 14 },
  menuBtnIcon: { fontSize: 22 },
  menuBtnLabel: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },

  // header
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, gap: 12 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, flex: 1 },
  back: { color: COLORS.primary, fontSize: 14 },

  // contacts
  contactsWrap: { flex: 1, backgroundColor: COLORS.background },
  searchInput: { backgroundColor: COLORS.surfaceVariant, borderRadius: 10, margin: 12, padding: 12, fontSize: 15, color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border },
  contactRow: { flexDirection: 'row', alignItems: 'center', padding: 14, marginHorizontal: 12, marginVertical: 3, backgroundColor: COLORS.surface, borderRadius: 12, gap: 12 },
  contactAvatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.onPrimary },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  contactStatus: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  emptyText: { color: COLORS.textTertiary, textAlign: 'center', padding: 32, fontSize: 13 },
  manualBtn: { alignItems: 'center', padding: 16 },
  manualBtnText: { color: COLORS.primary, fontSize: 14 },
  goBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 14, alignItems: 'center', margin: 12 },
  goBtnText: { color: COLORS.onPrimary, fontSize: 15, fontWeight: '600' },
  pad: { padding: 12 },

  // conference
  createConfBtn: { backgroundColor: COLORS.primaryDark, margin: 12, padding: 14, borderRadius: 12, alignItems: 'center' },
  createConfText: { color: COLORS.onPrimary, fontSize: 15, fontWeight: '600' },
  confCard: { backgroundColor: COLORS.surface, margin: 12, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  confName: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },
  confMeta: { flexDirection: 'row', gap: 12, marginTop: 8 },
  confBadge: { fontSize: 16 },
  confParticipants: { fontSize: 13, color: COLORS.textSecondary },
  confRoom: { flex: 1, backgroundColor: COLORS.background },
  participantRow: { flexDirection: 'row', alignItems: 'center', padding: 14, margin: 6, backgroundColor: COLORS.surface, borderRadius: 10, gap: 10 },
  participantSpeaking: { borderWidth: 1, borderColor: COLORS.secondary },
  participantDot: { width: 10, height: 10, borderRadius: 5 },
  participantName: { fontSize: 15, fontWeight: '500', color: COLORS.textPrimary, flex: 1 },
  speakingBadge: { fontSize: 11, color: COLORS.secondary, fontWeight: '600' },
  toggleBtn: { padding: 14, margin: 6 },
  toggleText: { color: COLORS.primary, fontSize: 15, textAlign: 'center' },

  // chat
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 14, margin: 4, marginHorizontal: 12 },
  bubbleIn: { alignSelf: 'flex-start', backgroundColor: COLORS.bubbleReceived },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: COLORS.bubbleSent },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  inputBar: { flexDirection: 'row', padding: 8, backgroundColor: COLORS.surface, borderTopWidth: 1, borderColor: COLORS.border },
  chatInput: { flex: 1, backgroundColor: COLORS.surfaceVariant, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: COLORS.textPrimary, marginRight: 8 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: COLORS.onPrimary, fontSize: 18, fontWeight: '700' },

  // ptt
  pttBar: { flexDirection: 'row', justifyContent: 'center', padding: 8, backgroundColor: COLORS.surface, borderTopWidth: 1, borderColor: COLORS.border },
  pttMini: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 24, backgroundColor: COLORS.surfaceVariant },
  pttMiniText: { fontSize: 14, color: COLORS.textPrimary, fontWeight: '600' },
  pttBtn: { margin: 16, padding: 20, borderRadius: 16, backgroundColor: COLORS.surfaceVariant, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  pttActive: { backgroundColor: COLORS.error, borderColor: COLORS.error },
  pttText: { fontSize: 16, fontWeight: '700', color: COLORS.onPrimary },
});
