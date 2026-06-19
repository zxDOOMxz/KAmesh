import React from 'react';
import { COLORS } from '../types';

interface ChangelogEntry {
  version: string;
  versionCode: number;
  changelog: string[];
  installedAt: number;
}

interface Props {
  changelog: ChangelogEntry;
  onDismiss: () => void;
}

export function UpdateNotificationScreen({ changelog, onDismiss }: Props) {
  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h2 style={styles.title}>ПО обновлено</h2>
        <p style={styles.version}>v{changelog.version}</p>

        <div style={styles.changelogList}>
          {changelog.changelog.map((item, idx) => (
            <div key={idx} style={styles.item}>
              <span style={styles.bullet}>{'\u2022'}</span>
              <span style={styles.text}>{item}</span>
            </div>
          ))}
        </div>

        <button style={styles.closeBtn} onClick={onDismiss}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 1000,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    border: '1px solid ' + COLORS.border,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: COLORS.primary,
    textAlign: 'center' as const,
    margin: '0 0 4px 0',
  },
  version: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center' as const,
    margin: '0 0 20px 0',
  },
  changelogList: {
    marginBottom: 20,
    maxHeight: 300,
    overflowY: 'auto' as const,
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  bullet: {
    color: '#3FB950',
    fontSize: 16,
    lineHeight: '22px',
    flexShrink: 0,
  },
  text: {
    color: COLORS.textPrimary,
    fontSize: 15,
    lineHeight: '22px',
  },
  closeBtn: {
    width: '100%',
    background: COLORS.primary,
    border: 'none',
    borderRadius: 12,
    padding: '14px 0',
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
