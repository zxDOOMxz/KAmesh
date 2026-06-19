import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { IconButton } from 'react-native-paper';
import { COLORS } from '../constants';

interface VoiceRecorderProps {
  onSendVoiceMail: (filePath: string, duration: number) => void;
  disabled?: boolean;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onSendVoiceMail,
  disabled,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordedPath, setRecordedPath] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startPulse = useCallback(() => {
    const pulse = () => {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (isRecording) pulse();
      });
    };
    pulse();
  }, [isRecording, pulseAnim]);

  const handleStopRecording = useCallback(async () => {
    try {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      pulseAnim.setValue(1);

      if (recordedPath && duration > 0) {
        onSendVoiceMail(recordedPath, duration);
      }
    } catch (err) {
      console.warn('[VoiceRecorder] Ошибка остановки:', err);
    }
  }, [recordedPath, duration, onSendVoiceMail, pulseAnim]);

  // Синхронизируем ref с актуальным колбэком
  stopRef.current = handleStopRecording;

  const handleStartRecording = useCallback(async () => {
    try {
      setIsRecording(true);
      setDuration(0);
      startPulse();

      const { startRecording } = await import('../services/VoiceMailService');
      const path = await startRecording();
      setRecordedPath(path);

      let seconds = 0;
      timerRef.current = setInterval(() => {
        seconds += 1;
        setDuration(seconds);
        if (seconds >= 30) {
          stopRef.current();
        }
      }, 1000);
    } catch (err) {
      console.warn('[VoiceRecorder] Ошибка записи:', err);
      setIsRecording(false);
    }
  }, [startPulse]);

  const handleCancelRecording = useCallback(async () => {
    try {
      const { stopRecording } = await import('../services/VoiceMailService');
      await stopRecording();
    } catch { /* запись могла ещё не начаться */ }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordedPath(null);
    setDuration(0);
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  if (isRecording) {
    return (
      <View style={styles.recordingContainer}>
        <IconButton
          icon="close"
          iconColor={COLORS.error}
          size={20}
          onPress={handleCancelRecording}
        />
        <Animated.View
          style={[styles.pulse, { opacity: pulseAnim }]}
        >
          <IconButton
            icon="microphone"
            iconColor={COLORS.error}
            size={24}
          />
        </Animated.View>
        <Text style={styles.recordingDuration}>
          {formatDuration(duration)}
        </Text>
        <IconButton
          icon="send"
          iconColor={COLORS.primary}
          size={20}
          onPress={handleStopRecording}
          disabled={duration < 1}
        />
      </View>
    );
  }

  return (
    <IconButton
      icon="microphone"
      iconColor={COLORS.textSecondary}
      size={24}
      onPress={handleStartRecording}
      disabled={disabled}
      style={styles.micButton}
    />
  );
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const styles = StyleSheet.create({
  micButton: {
    margin: 0,
  },
  recordingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  pulse: {
    marginHorizontal: 4,
  },
  recordingDuration: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginHorizontal: 8,
  },
});
