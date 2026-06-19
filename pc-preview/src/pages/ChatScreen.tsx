import React, { useState } from 'react';
import { COLORS, MOCK_MESSAGES, ChatMessage } from '../types';
import { MessageBubble } from '../components/MessageBubble';
import { VoiceCallUI } from '../components/VoiceCallUI';

interface Props {
  peerId: string;
  peerName: string;
  onBack: () => void;
}

export const ChatScreen: React.FC<Props> = ({ peerId, peerName, onBack }) => {
  const [text, setText] = useState('');
  const [messages] = useState<ChatMessage[]>(MOCK_MESSAGES[peerId] || []);
  const [showCallUI, setShowCallUI] = useState(false);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'ringing' | 'connected' | 'ended'>('idle');

  const handleSend = () => {
    if (!text.trim()) return;
    setText('');
  };

  const handleStartCall = () => {
    setCallState('calling');
    setShowCallUI(true);
    setTimeout(() => setCallState('connected'), 2000);
  };

  const handleEndCall = () => {
    setCallState('ended');
    setTimeout(() => {
      setShowCallUI(false);
      setCallState('idle');
    }, 1000);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  };

  return (
    <div style={styles.container}>
      {/* Шапка */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>{'<'}</button>
        <div style={styles.avatar}>{peerName[0]}</div>
        <div style={styles.headerInfo}>
          <div style={styles.peerName}>{peerName}</div>
          <div style={styles.peerStatus}>офлайн-режим · mesh: 2 прыжка</div>
        </div>
        <button style={styles.callBtn} onClick={handleStartCall} title="Позвонить">
          📞
        </button>
      </div>

      {/* Сообщения */}
      <div style={styles.messageList}>
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            formatTime={formatTime}
          />
        ))}
        <div style={styles.systemMsg}>
          <span>🔒 Сообщения защищены сквозным шифрованием</span>
        </div>
      </div>

      {/* Ввод */}
      <div style={styles.inputBar}>
        <button style={styles.voiceBtn} title="Голосовое сообщение">
          🎤
        </button>
        <input
          style={styles.textInput}
          placeholder="Сообщение..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button
          style={{ ...styles.sendBtn, opacity: text.trim() ? 1 : 0.4 }}
          onClick={handleSend}
          disabled={!text.trim()}
        >
          ➤
        </button>
      </div>

      {/* Оверлей звонка */}
      {showCallUI && (
        <VoiceCallUI
          peerName={peerName}
          state={callState}
          onEnd={handleEndCall}
        />
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderBottom: '1px solid ' + COLORS.border,
    background: COLORS.surface,
  },
  backBtn: {
    background: 'transparent',
    border: 'none',
    color: COLORS.primary,
    fontSize: 18,
    cursor: 'pointer',
    padding: '4px 8px',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: COLORS.primaryDim,
    color: COLORS.textPrimary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 600,
    flexShrink: 0,
  },
  headerInfo: {
    flex: 1,
  },
  peerName: {
    fontSize: 15,
    fontWeight: 600,
    color: COLORS.textPrimary,
  },
  peerStatus: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  callBtn: {
    background: 'transparent',
    border: '1px solid ' + COLORS.border,
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 16,
    cursor: 'pointer',
  },
  messageList: {
    flex: 1,
    overflow: 'auto',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  systemMsg: {
    textAlign: 'center' as const,
    padding: '12px 0',
    fontSize: 10,
    color: COLORS.textTertiary,
  },
  inputBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderTop: '1px solid ' + COLORS.border,
    background: COLORS.surface,
  },
  voiceBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    padding: '4px',
  },
  textInput: {
    flex: 1,
    padding: '8px 14px',
    borderRadius: 20,
    border: '1px solid ' + COLORS.border,
    background: COLORS.surfaceVariant,
    color: COLORS.textPrimary,
    fontSize: 14,
    outline: 'none',
  },
  sendBtn: {
    background: COLORS.primary,
    border: 'none',
    borderRadius: '50%',
    width: 36,
    height: 36,
    color: '#fff',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
