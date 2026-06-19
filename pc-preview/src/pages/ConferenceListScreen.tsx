import React, { useState } from 'react';
import { COLORS } from '../types';

interface Conference {
  id: string;
  name: string;
  hasPassword: boolean;
  participantCount: number;
}

const MOCK_CONFERENCES: Conference[] = [
  { id: 'conf-1', name: 'МКАД 1', hasPassword: false, participantCount: 3 },
  { id: 'conf-2', name: 'Байкал 2025', hasPassword: false, participantCount: 7 },
  { id: 'conf-3', name: 'MoscowMoto', hasPassword: false, participantCount: 12 },
  { id: 'conf-4', name: 'Встреча у БайкПоста', hasPassword: true, participantCount: 2 },
  { id: 'conf-5', name: 'Ночной пробег', hasPassword: false, participantCount: 5 },
];

interface Props {
  onBack: () => void;
  onJoin: (id: string) => void;
}

export function ConferenceListScreen({ onBack, onJoin }: Props) {
  const [search, setSearch] = useState('');

  const filtered = search
    ? MOCK_CONFERENCES.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : MOCK_CONFERENCES;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>{'< Назад'}</button>
        <span style={styles.headerTitle}>Войти в конференцию</span>
      </div>
      <input
        style={styles.search}
        placeholder="Поиск конференции..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div style={styles.list}>
        {filtered.map(c => (
          <div key={c.id} style={styles.card} onClick={() => onJoin(c.id)}>
            <div style={styles.cardBody}>
              <span style={styles.cardName}>{c.name}</span>
              <div style={styles.cardMeta}>
                <span>{c.hasPassword ? '🔒' : '🔓'}</span>
                <span style={styles.count}>{c.participantCount} уч.</span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={styles.empty}>{search ? 'Ничего не найдено' : 'Нет открытых конференций рядом'}</p>
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
  card: { margin: '6px 12px', padding: 16, background: COLORS.surface, borderRadius: 12, border: '1px solid ' + COLORS.border, cursor: 'pointer' },
  cardBody: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardName: { fontSize: 16, fontWeight: 600, color: COLORS.textPrimary },
  cardMeta: { display: 'flex', gap: 12, fontSize: 13, color: COLORS.textSecondary },
  count: { fontSize: 13, color: COLORS.textSecondary },
  empty: { color: COLORS.textTertiary, textAlign: 'center', padding: 32 },
};
