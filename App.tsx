import React, { useEffect, useState } from 'react';
import { StatusBar, LogBox } from 'react-native';
import { Provider as PaperProvider, MD3DarkTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import uuidv4 from 'react-native-uuid';
import { generateKeyBundle } from './src/services/CryptoService';
import { BleService } from './src/services/BleService';
import { MeshService } from './src/services/MeshService';
import { VoiceCallService } from './src/services/VoiceCallService';
import { IntercomService } from './src/services/IntercomService';
import { ChannelService } from './src/services/ChannelService';
import { TransportManager } from './src/services/TransportManager';
import { ContactService } from './src/services/ContactService';
import { ConferenceService } from './src/services/ConferenceService';
import { startBackgroundTask } from './src/services/BackgroundService';
import { UpdateService } from './src/services/UpdateService';
import { ShareService } from './src/services/ShareService';
import { SoundService } from './src/services/SoundService';
import { setNodeId, getNodeId, performCacheCleanupIfNeeded } from './src/services/StorageService';
import { COLORS } from './src/constants';
import type { ChangelogEntry } from './src/types';
import { ChatScreen } from './src/screens/ChatScreen';
import { NicknameRegistrationScreen } from './src/screens/NicknameRegistrationScreen';
import { UpdateNotificationScreen } from './src/screens/UpdateNotificationScreen';

LogBox.ignoreLogs([
  'BleManager',
  'new NativeEventEmitter',
  'RNCNetInfo',
]);

const theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: COLORS.primary,
    background: COLORS.background,
    surface: COLORS.surface,
    surfaceVariant: COLORS.surfaceVariant,
    error: COLORS.error,
    onBackground: COLORS.textPrimary,
    onSurface: COLORS.textPrimary,
    onSurfaceVariant: COLORS.textSecondary,
    outline: COLORS.border,
  },
};

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [needsNickname, setNeedsNickname] = useState(false);
  const [pendingChangelog, setPendingChangelog] = useState<ChangelogEntry | null>(null);
  const [showUpdateNotif, setShowUpdateNotif] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        performCacheCleanupIfNeeded();

        let existingId = getNodeId();
        if (!existingId) {
          existingId = `kamesh-${uuidv4.v4().slice(0, 8)}`;
          setNodeId(existingId);
        }

        await generateKeyBundle();
        await BleService.initialize();
        BleService.startScanning();
        await TransportManager.initialize();
        await MeshService.initialize();
        VoiceCallService.initialize();

        MeshService.onPacket((packet) => {
          IntercomService.handleIncomingAudio(packet.payload, packet.sourceId);
          ChannelService.handleChannelPacket(packet);
        });

        await UpdateService.initialize();

        const changelog = UpdateService.getPendingChangelog();
        if (changelog) {
          setPendingChangelog(changelog);
          setShowUpdateNotif(true);
        }

        // Инициализируем сервис контактов
        await ContactService.initialize();
        // Инициализируем сервис шаринга приложения
        await ShareService.initialize();
        // Инициализируем звуковые уведомления
        await SoundService.initialize();
        // Инициализируем сервис конференций
        await ConferenceService.initialize();

        // Если нет никнейма — покажем экран регистрации
        if (!ContactService.hasNickname()) {
          setNeedsNickname(true);
        }

        await startBackgroundTask();

        setIsReady(true);
      } catch (err) {
        console.warn('[App] Ошибка инициализации:', err);
        setIsReady(true);
      }
    };

    initialize();

    return () => {
      MeshService.destroy();
      TransportManager.destroy();
    };
  }, []);

  const handleNicknameRegistered = (nickname: string) => {
    setNeedsNickname(false);
  };

  const handleDismissUpdate = () => {
    setShowUpdateNotif(false);
    UpdateService.dismissChangelog();
  };

  if (!isReady) {
    return null;
  }

  if (needsNickname) {
    return (
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <StatusBar barStyle="light-content" backgroundColor={COLORS.background} translucent={false} />
          <NicknameRegistrationScreen onRegistered={handleNicknameRegistered} />
        </PaperProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={COLORS.background}
          translucent={false}
        />
        <ChatScreen />
        <UpdateNotificationScreen
          visible={showUpdateNotif}
          changelog={pendingChangelog}
          onDismiss={handleDismissUpdate}
        />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
