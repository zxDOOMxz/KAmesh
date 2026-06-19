import React, { useState } from 'react';
import { COLORS, MOCK_CONTACTS } from '../types';

interface Props {
  onBack: () => void;
  onSelect: (id: string, name: string) => void;
  mode: 'chat' | 'voice' | 'call';
}

export function ContactListScreen({ onBack, onSelect, mode }: Props) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? MOCK_CONTACTS.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : MOCK_CONTACTS;

  const label = mode === 'chat' ? 'Выберите получателя' : mode === 'voice' ? 'Голосовое сообщение' : 'Вызов';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>{'< Назад'}</button>
        <span style={styles.headerTitle}>{label}</span>
      </div>
      <input
        style={styles.search}
        placeholder="Введите никнейм..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div style={styles.list}>
        {filtered.map(c => (
          <div key={c.id} style={styles.contact} onClick={() => onSelect(c.id, c.name)}>
            <div style={{ ...styles.avatar, background: c.status === 'online' ? COLORS.primary : COLORS.surfaceVariant }}>
              {c.name[0]}
            </div>
            <div style={styles.info}>
              <div style={styles.name}>{c.name}</div>
              <div style={styles.status}>
                <span style={{ color: c.status === 'online' ? '#3FB950' : COLORS.textTertiary }}>●</span>
                {' '}{c.status === 'online' ? 'Онлайн' : 'Офлайн'}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p style={styles.empty}>Нет контактов</p>}
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
  contact: { display: 'flex', alignItems: 'center', gap: 12, padding: 14, margin: '3px 12px', background: COLORS.surface, borderRadius: 12, cursor: 'pointer' },
  avatar: { width: 42, height: 42, borderRadius: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', flexShrink: 0 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: 600, color: COLORS.textPrimary },
  status: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  empty: { color: COLORS.textTertiary, textAlign: 'center', padding: 32 },
};
