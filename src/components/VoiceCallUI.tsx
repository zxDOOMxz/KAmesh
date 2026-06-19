import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { IconButton } from 'react-native-paper';
import { CallState } from '../types';
import { COLORS } from '../constants';

interface VoiceCallUIProps {
  state: CallState;
  peerName: string;
  onAnswer: () => void;
  onReject: () => void;
  onEnd: () => void;
}

export const VoiceCallUI: React.FC<VoiceCallUIProps> = ({
  state,
  peerName,
  onAnswer,
  onReject,
  onEnd,
}) => {
  if (state === CallState.IDLE) return null;

  const getStatusText = () => {
    switch (state) {
      case CallState.CALLING:
        return `Звоним ${peerName}...`;
      case CallState.RINGING:
        return `${peerName} звонит вам...`;
      case CallState.CONNECTING:
        return 'Устанавливаем соединение...';
      case CallState.CONNECTED:
        return `Разговор с ${peerName}`;
      case CallState.ENDED:
        return 'Вызов завершён';
      default:
        return '';
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <Text style={styles.statusText}>{getStatusText()}</Text>

        <View style={styles.avatar}>
          <IconButton icon="account-voice" iconColor={COLORS.primary} size={48} />
        </View>

        <View style={styles.controls}>
          {state === CallState.RINGING && (
            <>
              <TouchableOpacity style={styles.answerButton} onPress={onAnswer}>
                <IconButton icon="phone" iconColor={COLORS.onPrimary} size={28} />
                <Text style={styles.buttonLabel}>Ответить</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectButton} onPress={onReject}>
                <IconButton icon="phone-off" iconColor={COLORS.onPrimary} size={28} />
                <Text style={styles.buttonLabel}>Отклонить</Text>
              </TouchableOpacity>
            </>
          )}

          {(state === CallState.CONNECTED ||
            state === CallState.CALLING ||
            state === CallState.CONNECTING) && (
            <TouchableOpacity style={styles.endCallButton} onPress={onEnd}>
              <IconButton icon="phone-off" iconColor={COLORS.onPrimary} size={28} />
              <Text style={styles.buttonLabel}>Завершить</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    minWidth: 280,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusText: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  controls: {
    flexDirection: 'row',
    gap: 24,
  },
  answerButton: {
    backgroundColor: COLORS.secondary,
    borderRadius: 40,
    padding: 8,
    alignItems: 'center',
    minWidth: 80,
  },
  rejectButton: {
    backgroundColor: COLORS.error,
    borderRadius: 40,
    padding: 8,
    alignItems: 'center',
    minWidth: 80,
  },
  endCallButton: {
    backgroundColor: COLORS.error,
    borderRadius: 40,
    padding: 8,
    alignItems: 'center',
    minWidth: 80,
  },
  buttonLabel: {
    color: COLORS.onPrimary,
    fontSize: 12,
    marginTop: 4,
  },
});
