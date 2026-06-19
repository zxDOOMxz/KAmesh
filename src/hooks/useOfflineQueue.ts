import { useEffect, useRef } from 'react';
import { MeshService } from '../services/MeshService';
import { BleService } from '../services/BleService';

/**
 * Хук автоматической обработки офлайн-очереди.
 * При каждом новом подключении BLE-устройства
 * запускает доставку накопленных pending-сообщений.
 */
export function useOfflineQueue(): void {
  const processedRef = useRef<string[]>([]);

  useEffect(() => {
    const unsubConnection = BleService.onConnection((peripheralId, connected) => {
      if (connected && !processedRef.current.includes(peripheralId)) {
        processedRef.current.push(peripheralId);
        MeshService.processPendingQueue().catch(() => {});

        // Очищаем кэш обработанных id через 5 минут
        setTimeout(() => {
          processedRef.current = processedRef.current.filter(
            id => id !== peripheralId,
          );
        }, 300_000);
      }
    });

    return () => {
      unsubConnection();
    };
  }, []);
}
