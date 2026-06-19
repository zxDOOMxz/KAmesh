import BackgroundService from 'react-native-background-actions';
import { BleService } from './BleService';
import { COLORS } from '../constants';

const backgroundOptions = {
  taskName: 'KAmesh',
  taskTitle: 'KAmesh',
  taskDesc: 'Mesh-сеть активна. Сканирование BLE и приём сообщений.',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: COLORS.primary.slice(1),
  linkingURI: 'kamesh://',
  parameters: {
    delay: 1000,
  },
  progressBar: {
    max: 100,
    value: 0,
    indeterminate: true,
  },
};

let isRunning = false;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

async function backgroundTask(taskData?: { delay: number }): Promise<void> {
  await BleService.startScanning();

  while (BackgroundService.isRunning()) {
    if (!BleService.isInitialized()) {
      console.warn('[BackgroundService] BLE не инициализирован, перезапуск...');
      try {
        await BleService.initialize();
        await BleService.startScanning();
      } catch (err) {
        console.warn('[BackgroundService] Ошибка перезапуска BLE:', err);
      }
    }

    await new Promise(resolve => setTimeout(resolve, taskData?.delay ?? 1000));
  }
}

function startWatchdog(): void {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(async () => {
    if (!isRunning) return;
    const running = BackgroundService.isRunning();
    if (!running) {
      console.warn('[BackgroundService] Watchdog: задача упала, перезапуск...');
      isRunning = false;
      try {
        await startBackgroundTask();
      } catch (err) {
        console.warn('[BackgroundService] Watchdog: ошибка перезапуска:', err);
      }
    }
  }, 15000);
}

function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

export async function startBackgroundTask(): Promise<void> {
  if (isRunning) return;

  try {
    await BackgroundService.start(backgroundTask, {
      ...backgroundOptions,
      parameters: { delay: 1000 },
    });
    isRunning = true;
    startWatchdog();
    console.warn('[BackgroundService] Фоновый режим запущен');
  } catch (err) {
    console.warn('[BackgroundService] Ошибка запуска фонового режима:', err);
    isRunning = false;
  }
}

export async function stopBackgroundTask(): Promise<void> {
  if (!isRunning) return;

  try {
    stopWatchdog();
    await BackgroundService.stop();
    isRunning = false;
    console.warn('[BackgroundService] Фоновый режим остановлен');
  } catch (err) {
    console.warn('[BackgroundService] Ошибка остановки фонового режима:', err);
  }
}

export function isBackgroundTaskRunning(): boolean {
  return isRunning && BackgroundService.isRunning();
}

export async function updateBackgroundNotification(desc: string): Promise<void> {
  if (!isRunning) return;
  try {
    await BackgroundService.updateNotification({
      ...backgroundOptions,
      taskDesc: desc,
    });
  } catch (err) {
    console.warn('[BackgroundService] updateTask error:', err);
  }
}
