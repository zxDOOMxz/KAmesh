import React from 'react';
import { COLORS } from '../types';

interface Props {
  peerName: string;
  state: 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
  onEnd: () => void;
}

const stateLabels: Record<string, string> = {
  calling: 'Исходящий вызов...',
  ringing: 'Входящий вызов...',
  connecting: 'Установка соединения...',
  connected: 'Разговор',
  ended: 'Вызов завершён',
};

export const VoiceCallUI: React.FC<Props> = ({ peerName, state, onEnd }) => {
  if (state === 'idle') return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.avatar}>{peerName[0]}</div>
        <div style={styles.name}>{peerName}</div>
        <div style={styles.state}>{stateLabels[state] || state}</div>

        {state === 'connected' && (
          <div style={styles.wave}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ ...styles.waveRing, animationDelay: i * 0.4 + 's' }} />
            ))}
          </div>
        )}

        <button style={styles.endBtn} onClick={onEnd}>
          Завершить
        </button>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    background: COLORS.overlay,
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  card: {
    background: COLORS.surface,
    borderRadius: 20,
    padding: '40px 32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    minWidth: 260,
    border: '1px solid ' + COLORS.border,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: COLORS.primaryDim,
    color: COLORS.textPrimary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 32,
    fontWeight: 700,
  },
  name: {
    fontSize: 20,
    fontWeight: 700,
    color: COLORS.textPrimary,
  },
  state: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  wave: {
    position: 'relative' as const,
    width: 120,
    height: 120,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  waveRing: {
    position: 'absolute' as const,
    width: 60,
    height: 60,
    borderRadius: '50%',
    border: '2px solid ' + COLORS.success,
    animation: 'ping 2s infinite',
    opacity: 0.3,
  },
  endBtn: {
    background: COLORS.error,
    border: 'none',
    borderRadius: 24,
    padding: '10px 36px',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
