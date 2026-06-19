// ============================================================
// Mash — UpdateNotificationScreen: уведомление об обновлении
// ============================================================
// Показывается после установки OTA-обновления.
// Содержит changelog и кнопку "Закрыть".
// ============================================================

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { COLORS } from '../constants';
import type { ChangelogEntry } from '../types';

interface Props {
  visible: boolean;
  changelog: ChangelogEntry | null;
  onDismiss: () => void;
}

export function UpdateNotificationScreen({ visible, changelog, onDismiss }: Props) {
  if (!changelog) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>ПО обновлено</Text>
          <Text style={styles.version}>v{changelog.version}</Text>

          <ScrollView style={styles.changelogScroll} showsVerticalScrollIndicator={false}>
            {changelog.changelog.map((item, idx) => (
              <View key={idx} style={styles.changelogItem}>
                <Text style={styles.bullet}>{'\u2022'}</Text>
                <Text style={styles.changelogText}>{item}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.closeButton} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.closeButtonText}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  version: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  changelogScroll: {
    maxHeight: 300,
    marginBottom: 20,
  },
  changelogItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingRight: 8,
  },
  bullet: {
    fontSize: 16,
    color: COLORS.secondary,
    marginRight: 10,
    lineHeight: 22,
  },
  changelogText: {
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 22,
    flex: 1,
  },
  closeButton: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.onPrimary,
  },
});
