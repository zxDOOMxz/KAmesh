import React from 'react';
import { COLORS, MOCK_CONTACTS, Contact } from '../types';

interface Props {
  nodeName: string;
  onSelectPeer: (id: string, name: string) => void;
}

const statusLabel: Record<string, string> = {
  online: 'В сети',
  offline: 'Нет связи',
  connecting: 'Поиск...',
};

const statusColor: Record<string, string> = {
  online: COLORS.success,
  offline: COLORS.textTertiary,
  connecting: COLORS.warning,
};

function rssiBars(rssi: number): string {
  if (rssi > -60) return '▂▄▆█';
  if (rssi > -75) return '▂▄▆_';
  if (rssi > -85) return '▂▄__';
  return '▂___';
}

function transportIcon(contactId: string): { label: string; color: string } {
  if (contactId === 'peer-alice') return { label: 'BLE', color: '#58A6FF' };
  if (contactId === 'peer-bob') return { label: 'WiFi', color: '#3FB950' };
  if (contactId === 'peer-charlie') return { label: 'GSM', color: '#D29922' };
  return { label: '--', color: '#484F58' };
}

export const ChatListScreen: React.FC<Props> = ({ nodeName, onSelectPeer }) => {
  return (
    <div style={styles.container}>
      {/* Шапка */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>KAmesh</div>
          <div style={styles.headerSub}>
            <span style={{ color: COLORS.success, fontSize: 10 }}>●</span>
            {' '}{nodeName}
          </div>
        </div>
        <div style={styles.stats}>
          <div style={styles.stat}>
            <span style={styles.statValue}>{MOCK_CONTACTS.filter(c => c.status === 'online').length}</span>
            <span style={styles.statLabel}>в сети</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>{MOCK_CONTACTS.length}</span>
            <span style={styles.statLabel}>узлов</span>
          </div>
        </div>
      </div>

      {/* Список контактов */}
      <div style={styles.list}>
        {MOCK_CONTACTS.map(contact => (
          <div
            key={contact.id}
            style={styles.contact}
            onClick={() => onSelectPeer(contact.id, contact.name)}
          >
            <div style={styles.avatar}>
              {contact.name[0]}
            </div>
            <div style={styles.contactInfo}>
              <div style={styles.contactName}>{contact.name}</div>
              <div style={styles.contactMeta}>
                <span style={{ color: statusColor[contact.status], fontSize: 10 }}>●</span>
                {' '}{statusLabel[contact.status]}
                {' · '}{rssiBars(contact.rssi)} {contact.rssi} dBm
              </div>
              <div style={styles.transportRow}>
                <span style={{ ...styles.transportTag, color: transportIcon(contact.id).color, borderColor: transportIcon(contact.id).color }}>
                  {transportIcon(contact.id).label}
                </span>
              </div>
            </div>
            {contact.unread > 0 && (
              <div style={styles.badge}>{contact.unread}</div>
            )}
          </div>
        ))}

        {/* Симуляция сканирования */}
        <div style={styles.scanning}>
          <div style={styles.scanDots}>
            <span style={styles.scanDot} />
            <span style={{ ...styles.scanDot, animationDelay: '0.2s' }} />
            <span style={{ ...styles.scanDot, animationDelay: '0.4s' }} />
          </div>
          <span style={styles.scanText}>Поиск устройств поблизости...</span>
        </div>
      </div>

      {/* Подпись */}
      <div style={styles.footer}>
        <span>⚡ GSM · WiFi · BLE · TTL 7 · Зашифровано</span>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid ' + COLORS.border,
    background: COLORS.surface,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  stats: {
    display: 'flex',
    gap: 16,
  },
  stat: {
    textAlign: 'center' as const,
  },
  statValue: {
    display: 'block',
    fontSize: 18,
    fontWeight: 700,
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textTertiary,
    textTransform: 'uppercase' as const,
  },
  list: {
    flex: 1,
    overflow: 'auto',
  },
  contact: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 20px',
    borderBottom: '1px solid ' + COLORS.border,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: COLORS.primaryDim,
    color: COLORS.textPrimary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    fontWeight: 600,
    flexShrink: 0,
  },
  contactInfo: {
    flex: 1,
    minWidth: 0,
  },
  contactName: {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.textPrimary,
  },
  contactMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  transportRow: {
    marginTop: 4,
  },
  transportTag: {
    fontSize: 9,
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: 4,
    border: '1px solid',
    display: 'inline-block',
    letterSpacing: '0.5px',
  },
  badge: {
    background: COLORS.primary,
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 10,
    minWidth: 18,
    textAlign: 'center' as const,
  },
  scanning: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    color: COLORS.textTertiary,
    fontSize: 11,
  },
  scanDots: {
    display: 'flex',
    gap: 3,
  },
  scanDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: COLORS.primary,
    animation: 'pulse 1.2s infinite',
  },
  scanText: {
    fontStyle: 'italic',
  },
  footer: {
    textAlign: 'center' as const,
    padding: '8px 16px',
    fontSize: 10,
    color: COLORS.textTertiary,
    borderTop: '1px solid ' + COLORS.border,
  },
};
