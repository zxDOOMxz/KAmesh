import React, { useState } from 'react';
import { COLORS } from '../types';

interface Props {
  onLogin: (name: string) => void;
}

export const LoginScreen: React.FC<Props> = ({ onLogin }) => {
  const [name, setName] = useState('');
  const [step, setStep] = useState<'welcome' | 'setup'>('welcome');

  const handleStart = () => {
    if (name.trim()) {
      onLogin(name.trim());
    }
  };

  if (step === 'welcome') {
    return (
      <div style={styles.container}>
        <div style={styles.hero}>
          <div style={styles.logo}>⟠</div>
          <h1 style={styles.title}>KAmesh</h1>
          <p style={styles.subtitle}>Офлайн-мессенджер через Bluetooth mesh</p>
          <p style={styles.description}>
            Общайся без интернета, WiFi и GSM. Сообщения передаются
            напрямую между телефонами через BLE-сеть с ретрансляцией
            до 7 прыжков. Все данные защищены сквозным шифрованием.
          </p>
        </div>

        <div style={styles.features}>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>📝</span>
            <span style={styles.featureText}>Текстовые сообщения</span>
          </div>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>🎤</span>
            <span style={styles.featureText}>Голосовые сообщения (Opus 8 кбит/с)</span>
          </div>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>📞</span>
            <span style={styles.featureText}>Голосовые вызовы через WebRTC</span>
          </div>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>🔒</span>
            <span style={styles.featureText}>Сквозное шифрование (Signal Protocol)</span>
          </div>
          <div style={styles.feature}>
            <span style={styles.featureIcon}>🕸️</span>
            <span style={styles.featureText}>Mesh-сеть до 7 прыжков</span>
          </div>
        </div>

        <div style={styles.startArea}>
          <input
            style={styles.input}
            placeholder="Введи своё имя (node name)"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
            maxLength={20}
          />
          <button
            style={{ ...styles.button, opacity: name.trim() ? 1 : 0.5 }}
            disabled={!name.trim()}
            onClick={handleStart}
          >
            {'>'} Войти в сеть
          </button>
        </div>

        <div style={styles.footer}>
          <span style={styles.statusDot} />
          <span style={styles.statusText}>Офлайн-режим · без регистрации</span>
        </div>
      </div>
    );
  }

  return null;
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '32px 28px',
    overflow: 'auto',
  },
  hero: {
    textAlign: 'center' as const,
    marginBottom: 28,
  },
  logo: {
    fontSize: 48,
    color: COLORS.primary,
    marginBottom: 8,
    lineHeight: 1,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 700,
    color: COLORS.textPrimary,
    letterSpacing: '-0.5px',
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: 500,
  },
  description: {
    margin: '14px 0 0',
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 1.6,
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginBottom: 28,
  },
  feature: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    background: COLORS.surface,
    borderRadius: 8,
    border: '1px solid ' + COLORS.border,
  },
  featureIcon: {
    fontSize: 16,
    width: 24,
    textAlign: 'center' as const,
  },
  featureText: {
    fontSize: 12,
    color: COLORS.textPrimary,
  },
  startArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  input: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid ' + COLORS.border,
    background: COLORS.surfaceVariant,
    color: COLORS.textPrimary,
    fontSize: 14,
    outline: 'none',
  },
  button: {
    padding: '10px 14px',
    borderRadius: 8,
    border: 'none',
    background: COLORS.primary,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    padding: '10px 0',
    borderTop: '1px solid ' + COLORS.border,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: COLORS.success,
  },
  statusText: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
};
