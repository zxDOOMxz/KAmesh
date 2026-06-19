// ============================================================
// Mash — BackgroundService: фоновый режим
// ============================================================
// Настраивает headless-задачу (react-native-background-actions)
// для сканирования BLE и обработки mesh-сети,
// даже когда приложение свёрнуто или экран выключен.
// ============================================================

import BackgroundService from 'react-native-background-actions';
import { Platform } from 'react-native';

// ============================================================
// Конфигурация фоновой задачи
// ============================================================

const BACKGROUND_OPTIONS = {
  taskName: 'KAmeshMeshScan',
  taskTitle: 'KAmesh',
  taskDesc: 'KAmesh: поиск устройств для офлайн-связи',
  taskIcon: {
    name: 'ic_scan',
    type: 'drawable',
  },
  color: '#58A6FF',
  linkingURI: 'kamesh://chat',
  parameters: {
    delay: 5000,
  },
  // Android-specific
  progressBar: {
    max: 100,
    value: 0,
    indeterminate: true,
  },
  ...(Platform.OS === 'android'
    ? {
        foregroundService: {
          notificationTitle: 'KAmesh',
          notificationText: 'KAmesh: поиск устройств…',
          notificationIcon: 'ic_scan',
          notificationColor: '#58A6FF',
        },
      }
    : {}),
};

// ============================================================
// Запуск фоновой задачи
// ============================================================

/**
 * Запускает фоновый процесс, который:
 * 1. Сканирует BLE-устройства
 * 2. Обрабатывает входящие mesh-пакеты
 * 3. Пытается доставить pending-сообщения
 * 4. Обновляет маршрутную таблицу
 *
 * Должен быть вызван после инициализации BleService и MeshService.
 */
export async function startBackgroundTask(): Promise<void> {
  try {
    if (BackgroundService.isRunning()) {
      console.warn('[BackgroundService] Фоновая задача уже запущена');
      return;
    }

    await BackgroundService.start(async (taskData) => {
      const { delay } = taskData || { delay: 5000 };

      // Импортируем сервисы динамически (они могут быть не готовы при старте)
      let meshes: typeof import('./MeshService') | null = null;
      let bles: typeof import('./BleService') | null = null;

      while (BackgroundService.isRunning()) {
        try {
          // Ленивый импорт для доступа к актуальным данным
          if (!meshes || !bles) {
            meshes = await import('./MeshService') as typeof import('./MeshService');
            bles = await import('./BleService') as typeof import('./BleService');
          }

          const routeCount = meshes!.MeshService.getRouteTable().length;
          const connectedCount = bles!.BleService.getConnectedDevices().length;
          const pendingCount = (await import('./StorageService')).getPendingMessages().length;

          await BackgroundService.updateNotification({
            taskDesc: `Устройств: ${connectedCount} на связи, ${routeCount} в сети, ${pendingCount} ожидают`,
          });
        } catch (loopErr) {
          console.warn('[BackgroundService] Ошибка в цикле:', loopErr);
        }

        await new Promise(resolve => setTimeout(resolve, delay as number));
      }
    }, BACKGROUND_OPTIONS);

    console.warn('[BackgroundService] Фоновая задача запущена');
  } catch (err) {
    console.warn('[BackgroundService] Ошибка запуска фоновой задачи:', err);
  }
}

/**
 * Останавливает фоновую задачу.
 */
export async function stopBackgroundTask(): Promise<void> {
  try {
    if (!BackgroundService.isRunning()) return;

    await BackgroundService.stop();
    console.warn('[BackgroundService] Фоновая задача остановлена');
  } catch (err) {
    console.warn('[BackgroundService] Ошибка остановки:', err);
  }
}

/**
 * Проверяет, выполняется ли фоновая задача.
 */
export function isBackgroundTaskRunning(): boolean {
  return BackgroundService.isRunning();
}
