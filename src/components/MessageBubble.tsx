import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { IconButton } from 'react-native-paper';
import { ChatMessage, MessageType, DeliveryStatus } from '../types';
import { COLORS } from '../constants';

interface MessageBubbleProps {
  message: ChatMessage;
  onPlayVoiceMail?: (uri: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({ message, onPlayVoiceMail }) => {
    const isSent = !message.isIncoming;

    const statusIcon =
      message.status === DeliveryStatus.SENDING ? 'clock-outline' :
      message.status === DeliveryStatus.DELIVERED ? 'check' :
      message.status === DeliveryStatus.FAILED ? 'alert-circle-outline' :
      'clock-outline';

    const statusColor =
      message.status === DeliveryStatus.DELIVERED ? COLORS.secondary :
      message.status === DeliveryStatus.FAILED ? COLORS.error :
      COLORS.textTertiary;

    return (
      <View
        style={[
          styles.container,
          isSent ? styles.containerSent : styles.containerReceived,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isSent ? styles.bubbleSent : styles.bubbleReceived,
          ]}
        >
          {message.type === MessageType.TEXT && message.text && (
            <Text style={styles.messageText}>{message.text}</Text>
          )}

          {message.type === MessageType.VOICE_MAIL && message.voiceMailUri && (
            <TouchableOpacity
              style={styles.voiceMailContainer}
              onPress={() => onPlayVoiceMail?.(message.voiceMailUri!)}
              activeOpacity={0.7}
            >
              <IconButton
                icon="play-circle-outline"
                iconColor={COLORS.primary}
                size={32}
              />
              <View style={styles.voiceMailInfo}>
                <Text style={styles.voiceMailLabel}>Голосовое сообщение</Text>
                {message.voiceMailDuration && (
                  <Text style={styles.voiceMailDuration}>
                    {message.voiceMailDuration} сек
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}

          {message.downloadProgress !== undefined && message.downloadProgress < 100 && (
            <View style={styles.progressContainer}>
              <View
                style={[styles.progressBar, { width: `${message.downloadProgress}%` }]}
              />
            </View>
          )}
        </View>

        <View style={styles.metaRow}>
          <Text style={[styles.timestamp, { color: statusColor }]}>
            {formatTime(message.timestamp)}
          </Text>
          {isSent && (
            <IconButton
              icon={statusIcon}
              iconColor={statusColor}
              size={12}
              style={styles.statusIcon}
            />
          )}
        </View>
      </View>
    );
  },
);

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 12,
    maxWidth: '80%',
  },
  containerSent: {
    alignSelf: 'flex-end',
  },
  containerReceived: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleSent: {
    backgroundColor: COLORS.bubbleSent,
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: COLORS.bubbleReceived,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  messageText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    lineHeight: 20,
  },
  voiceMailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 180,
  },
  voiceMailInfo: {
    marginLeft: 4,
  },
  voiceMailLabel: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  voiceMailDuration: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  progressContainer: {
    height: 3,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
    marginRight: 4,
  },
  timestamp: {
    fontSize: 11,
  },
  statusIcon: {
    margin: 0,
    padding: 0,
    width: 14,
    height: 14,
  },
});
