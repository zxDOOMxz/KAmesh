import React, { useState } from 'react';
import { COLORS, ChatMessage } from '../types';

interface Props {
  message: ChatMessage;
  formatTime: (ts: number) => string;
}

export const MessageBubble: React.FC<Props> = ({ message, formatTime }) => {
  const [playing, setPlaying] = useState(false);
  const isMine = !message.isIncoming;

  const statusIcon: Record<string, string> = { sending: '~', sent: '>', delivered: '>>', failed: '!' };
  const statusColor: Record<string, string> = { sending: COLORS.textTertiary, sent: COLORS.textTertiary, delivered: COLORS.primary, failed: COLORS.error };

  if (message.type === 'voice') {
    return (
      <div style={{ ...styles.row, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
        <div style={{ ...styles.bubble, background: isMine ? COLORS.bubbleSelf : COLORS.bubbleOther, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={styles.playBtn} onClick={() => setPlaying(!playing)}>
            {playing ? '||' : '>'}
          </button>
          <div style={{ flex: 1 }}>
            <div style={styles.waveform}>
              {[8, 18, 12, 20, 14, 8, 16, 22, 10].map((h, i) => (
                <span key={i} style={{ ...styles.waveBar, height: h }} />
              ))}
            </div>
            <span style={styles.voiceDuration}>{message.voiceMailDuration ?? 0}"</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.row, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
      <div style={{ ...styles.bubble, background: isMine ? COLORS.bubbleSelf : COLORS.bubbleOther }}>
        <span style={styles.text}>{message.text}</span>
        <div style={styles.meta}>
          <span style={styles.time}>{formatTime(message.timestamp)}</span>
          {isMine && (
            <span style={{ color: statusColor[message.status], fontSize: 10 }}>
              {statusIcon[message.status]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  row: { display: 'flex', marginBottom: 4 },
  bubble: { maxWidth: '75%', padding: '8px 12px', borderRadius: 12, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  text: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  meta: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  time: { fontSize: 10, color: COLORS.textTertiary },
  playBtn: { background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: COLORS.textPrimary, fontSize: 12, cursor: 'pointer', flexShrink: 0 },
  voiceInfo: { flex: 1 },
  waveform: { display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 },
  waveBar: { width: 3, borderRadius: 2, background: COLORS.textSecondary, minHeight: 4 },
  voiceDuration: { fontSize: 10, color: COLORS.textTertiary },
};
