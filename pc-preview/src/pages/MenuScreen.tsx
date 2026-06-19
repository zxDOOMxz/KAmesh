import React from 'react';
import { COLORS } from '../types';

interface Props {
  nickname: string;
  onSendMessage: () => void;
  onSendVoice: () => void;
  onVoiceCall: () => void;
  onCreateConference: () => void;
  onJoinConference: () => void;
  onShareApp: () => void;
}

export function MenuScreen({ nickname, onSendMessage, onSendVoice, onVoiceCall, onCreateConference, onJoinConference, onShareApp }: Props) {
  const items = [
    { label: 'Отправить сообщение', icon: '💬', action: onSendMessage },
    { label: 'Отправить голосовое', icon: '🎤', action: onSendVoice },
    { label: 'Голосовая связь', icon: '📞', action: onVoiceCall },
    { label: 'Создать конференцию', icon: '👥', action: onCreateConference },
    { label: 'Войти в конференцию', icon: '🚪', action: onJoinConference },
    { label: 'Поделиться приложением', icon: '📤', action: onShareApp },
  ];

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>KAmesh</h1>
      <p style={styles.sub}>{nickname}</p>
      <div style={styles.group}>
        {items.map(item => (
          <button key={item.label} style={styles.btn} onClick={item.action}>
            <span style={styles.btnIcon}>{item.icon}</span>
            <span style={styles.btnLabel}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: 24,
    background: COLORS.background,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    color: COLORS.primary,
    textAlign: 'center',
    margin: '0 0 4px 0',
  },
  sub: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    margin: '0 0 32px 0',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: COLORS.surface,
    border: '1px solid ' + COLORS.border,
    borderRadius: 14,
    padding: 18,
    cursor: 'pointer',
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 600,
    textAlign: 'left' as const,
  },
  btnIcon: {
    fontSize: 22,
  },
  btnLabel: {
    fontSize: 16,
    fontWeight: 600,
    color: COLORS.textPrimary,
  },
};
