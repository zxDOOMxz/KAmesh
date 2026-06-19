// ============================================================
// Mash — ITransport: единый интерфейс для всех транспортов
// ============================================================
// Позволяет MeshService работать через GSM, WiFi или BLE,
// не зная деталей конкретного транспорта.
// ============================================================

import type { NodeId } from '../../types';

export type TransportDataHandler = (data: string, peerId: NodeId) => void;
export type TransportConnectionHandler = (peerId: NodeId, connected: boolean) => void;

export interface ITransport {
  /** Название транспорта (для логов) */
  readonly name: string;
  /** Приоритет: 0 — самый предпочтительный */
  readonly priority: number;

  /** Инициализация транспорта */
  init(): Promise<void>;

  /** Освобождение ресурсов */
  destroy(): void;

  /** Доступен ли транспорт прямо сейчас */
  isAvailable(): Promise<boolean>;

  /** Отправить данные конкретному пиру */
  send(peerId: NodeId, data: string): Promise<void>;

  /** Разослать данные всем подключённым пирам */
  broadcast(data: string): Promise<void>;

  /** Список ID пиров, доступных через этот транспорт */
  getConnectedPeers(): NodeId[];

  /** Проверить, доступен ли пир через этот транспорт */
  isConnected(peerId: NodeId): boolean;

  /** Уровень сигнала к пиру (0–100) или -1 если неизвестно */
  getSignalStrength(peerId: NodeId): number;

  /** Подписка на входящие данные */
  onData(handler: TransportDataHandler): () => void;

  /** Подписка на изменения статуса пира */
  onConnection(handler: TransportConnectionHandler): () => void;
}
