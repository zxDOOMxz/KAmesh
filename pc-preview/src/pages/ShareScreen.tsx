import React, { useState } from 'react';
import { COLORS } from '../types';

const MOCK_PEERS = [
  { id: 'peer-1', name: 'MotoRider', online: true },
  { id: 'peer-2', name: 'NightWolf', online: true },
  { id: 'peer-3', name: 'RoadKing', online: false },
  { id: 'peer-4', name: 'SpeedDemon', online: true },
  { id: 'peer-5', name: 'ThunderBolt', online: false },
];

interface Props {
  onBack: () => void;
}

export function ShareScreen({ onBack }: Props) {
  const [step, setStep] = useState<'select' | 'sending' | 'done'>('select');
  const [search, setSearch] = useState('');
  const [progress, setProgress] = useState(0);
  const [selectedName, setSelectedName] = useState('');

  const filtered = search
    ? MOCK_PEERS.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : MOCK_PEERS;

  const handleSend = (name: string) => {
    setSelectedName(name);
    setStep('sending');
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setStep('done'), 500);
          return 100;
        }
        return prev + 10;
      });
    }, 300);
  };

  if (step === 'sending' || step === 'done') {
    return (
      <div style={styles.container}>
        <div style={styles.center}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {step === 'sending' ? '📤' : '✅'}
          </div>
          <div style={styles.statusText}>
            {step === 'sending'
              ? `Отправка ${selectedName}...`
              : `APK отправлен ${selectedName}!`}
          </div>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          {step === 'done' && (
            <button style={styles.doneBtn} onClick={onBack}>
              Назад в меню
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>{'< Назад'}</button>
        <span style={styles.headerTitle}>Кому отправить приложение?</span>
      </div>
      <input
        style={styles.search}
        placeholder="Поиск..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div style={styles.list}>
        {filtered.map(p => (
          <div key={p.id} style={styles.peerRow} onClick={() => handleSend(p.name)}>
            <div style={{
              ...styles.avatar,
              background: p.online ? COLORS.primaryDim : COLORS.surfaceVariant,
            }}>
              {p.name[0].toUpperCase()}
            </div>
            <div style={styles.peerInfo}>
              <div style={styles.peerName}>{p.name}</div>
              <div style={styles.peerStatus}>
                <span style={{ color: p.online ? COLORS.success : COLORS.textTertiary }}>●</span>
                {' '}{p.online ? 'Онлайн' : 'Офлайн'}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={styles.empty}>Ничего не найдено</p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { flex: 1, display: 'flex', flexDirection: 'column', background: COLORS.background },
  header: { display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderBottom: '1px solid ' + COLORS.border, background: COLORS.surface },
  backBtn: { background: 'none', border: 'none', color: COLORS.primary, fontSize: 14, cursor: 'pointer', padding: 0 },
  headerTitle: { fontSize: 16, fontWeight: 600, color: COLORS.textPrimary },
  search: { margin: 12, padding: 12, borderRadius: 10, border: '1px solid ' + COLORS.border, background: COLORS.surfaceVariant, color: COLORS.textPrimary, fontSize: 15, outline: 'none' },
  list: { flex: 1, overflow: 'auto' },
  peerRow: { display: 'flex', alignItems: 'center', gap: 12, padding: 14, margin: '4px 12px', background: COLORS.surface, borderRadius: 12, cursor: 'pointer' },
  avatar: { width: 42, height: 42, borderRadius: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textPrimary, fontSize: 18, fontWeight: 700 },
  peerInfo: { flex: 1 },
  peerName: { fontSize: 15, fontWeight: 600, color: COLORS.textPrimary },
  peerStatus: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  empty: { color: COLORS.textTertiary, textAlign: 'center', padding: 32 },
  center: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 },
  statusText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: 600, marginBottom: 24, textAlign: 'center' },
  progressBar: { width: '80%', height: 8, background: COLORS.surfaceVariant, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', background: COLORS.primary, borderRadius: 4, transition: 'width 0.3s' },
  doneBtn: { marginTop: 32, padding: '12px 32px', border: 'none', borderRadius: 12, background: COLORS.primary, color: '#FFFFFF', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
};
