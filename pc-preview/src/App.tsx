import React, { useState } from 'react';
import { COLORS } from './types';
import { LoginScreen } from './pages/LoginScreen';
import { ChatListScreen } from './pages/ChatListScreen';
import { ChatScreen } from './pages/ChatScreen';
import { MenuScreen } from './pages/MenuScreen';
import { ContactListScreen } from './pages/ContactListScreen';
import { ConferenceListScreen } from './pages/ConferenceListScreen';
import { ShareScreen } from './pages/ShareScreen';
import { UpdateNotificationScreen } from './pages/UpdateNotificationScreen';

type Screen = 'login' | 'chatlist' | 'chat' | 'menu' | 'contacts' | 'conf_list' | 'share';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [nodeName, setNodeName] = useState('');
  const [selectedPeerId, setSelectedPeerId] = useState('');
  const [selectedPeerName, setSelectedPeerName] = useState('');
  const [contactMode, setContactMode] = useState<'chat' | 'voice' | 'call'>('chat');
  const [showUpdate, setShowUpdate] = useState(false);

  const mockUpdateChangelog = {
    version: '1.1.0',
    versionCode: 2,
    changelog: [
      'Добавлена PTT-рация (Intercom) — общайся голосом в реальном времени с ближайшими узлами',
      'Добавлены каналы — присоединяйся к тематическим комнатам (MoscowMoto2025, Bikers и др.)',
      'Улучшена маршрутизация: DTN теперь хранит пакеты до 7 дней и раздаёт при новой встрече',
      'Никнеймы — каждый пользователь получает уникальный ник при входе (без смены)',
      'Конференции — открытые и закрытые комнаты с голосовой связью',
    ],
    installedAt: Date.now(),
  };

  const handleLogin = (name: string) => {
    setNodeName(name);
    setScreen('menu');
  };

  const handleSelectPeer = (id: string, name: string) => {
    setSelectedPeerId(id);
    setSelectedPeerName(name);
    if (contactMode === 'chat') {
      setScreen('chat');
    } else if (contactMode === 'call') {
      setScreen('chatlist');
    } else {
      setScreen('chat');
    }
  };

  const openContacts = (mode: 'chat' | 'voice' | 'call') => {
    setContactMode(mode);
    setScreen('contacts');
  };

  return (
    <div style={styles.root}>
      <div style={styles.window}>
        {screen === 'login' && <LoginScreen onLogin={handleLogin} />}

        {screen === 'menu' && nodeName && (
          <MenuScreen
            nickname={nodeName}
            onSendMessage={() => openContacts('chat')}
            onSendVoice={() => openContacts('voice')}
            onVoiceCall={() => openContacts('call')}
            onCreateConference={() => setScreen('chatlist')}
            onJoinConference={() => setScreen('conf_list')}
            onShareApp={() => setScreen('share')}
          />
        )}

        {screen === 'contacts' && (
          <ContactListScreen
            onBack={() => setScreen('menu')}
            onSelect={handleSelectPeer}
            mode={contactMode}
          />
        )}

        {screen === 'chatlist' && nodeName && (
          <ChatListScreen
            nodeName={nodeName}
            onSelectPeer={handleSelectPeer}
          />
        )}

        {screen === 'chat' && (
          <ChatScreen
            peerId={selectedPeerId}
            peerName={selectedPeerName}
            onBack={() => setScreen('menu')}
          />
        )}

        {screen === 'conf_list' && (
          <ConferenceListScreen
            onBack={() => setScreen('menu')}
            onJoin={(id) => setScreen('chatlist')}
          />
        )}

        {screen === 'share' && (
          <ShareScreen onBack={() => setScreen('menu')} />
        )}

        <div style={styles.navBar}>
          <span style={styles.navBrand}>KAmesh — превью</span>
          <div style={styles.navLinks}>
            <button
              style={screen === 'menu' ? styles.navBtnActive : styles.navBtn}
              onClick={() => { if (nodeName) setScreen('menu'); }}
            >
              Меню
            </button>
            <button
              style={styles.navBtn}
              onClick={() => setShowUpdate(true)}
            >
              Обновление
            </button>
          </div>
        </div>

        {showUpdate && (
          <UpdateNotificationScreen
            changelog={mockUpdateChangelog}
            onDismiss={() => setShowUpdate(false)}
          />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100vw',
    height: '100vh',
    background: '#0A0E14',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  window: {
    width: 420,
    height: 760,
    background: COLORS.background,
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px ' + COLORS.border,
    position: 'relative',
  },
  navBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    borderTop: '1px solid ' + COLORS.border,
    background: COLORS.surface,
    flexShrink: 0,
  },
  navBrand: {
    color: COLORS.textTertiary,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  navLinks: {
    display: 'flex',
    gap: 6,
  },
  navBtn: {
    background: 'transparent',
    border: '1px solid ' + COLORS.border,
    color: COLORS.textSecondary,
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    cursor: 'pointer',
  },
  navBtnActive: {
    background: COLORS.primaryDim,
    border: '1px solid ' + COLORS.primary,
    color: COLORS.textPrimary,
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 11,
    cursor: 'pointer',
  },
};
