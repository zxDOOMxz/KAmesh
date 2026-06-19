// ============================================================
// Mash — BackgroundService: фоновый режим (заглушка)
// ============================================================
// react-native-background-actions несовместим с New Architecture
// в RN 0.76. Для alpha-версии фоновая задача отключена.
// TODO: найти замену (expo-task-manager или foreground-сервис BLE)
// ============================================================

/**
 * Заглушка — фоновая задача не запускается.
 */
export async function startBackgroundTask(): Promise<void> {
  console.warn('[BackgroundService] Отключён (react-native-background-actions несовместим с RN 0.76)');
}

/**
 * Заглушка — остановка не требуется.
 */
export async function stopBackgroundTask(): Promise<void> {
  // no-op
}

/**
 * Всегда возвращает false (задача не запущена).
 */
export function isBackgroundTaskRunning(): boolean {
  return false;
}
