// ============================================================
// Mash — VoiceMailService: голосовая почта
// ============================================================
// Отвечает за запись аудио, сжатие в Opus (8 кбит/с, 16 кГц, моно),
// фрагментацию на чанки по 480 байт для BLE MTU=512, и сборку на
// стороне получателя с воспроизведением.
// ============================================================

import uuidv4 from 'react-native-uuid';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import * as FileSystem from 'expo-file-system';
import { MessageType, MeshPacket } from '../types';
import { BLE_PAYLOAD_LIMIT, VOICE_MAX_FRAGMENTS } from '../constants';
import { MeshService } from './MeshService';

/** Максимальная длительность записи (мс) */
const MAX_RECORDING_DURATION_MS = 30_000;

/** Таймаут сборки фрагментов: 5 минут — очистка зависших сессий */
const ASSEMBLY_TIMEOUT_MS = 300_000;

/** Путь к временному Opus-файлу */
const TEMP_OPUS_FILE = 'voice_temp.opus';

/** Единственный экземпляр рекордера/плеера */
const audioRecorderPlayer = new AudioRecorderPlayer();

/** Время начала записи (для отслеживания длительности) */
let recordingStartTime = 0;

/** Карта сборки фрагментов: sessionId -> fragile assembly */
const assemblyBuffer = new Map<string, {
  chunks: string[];
  total: number;
  received: number;
  metadata: { duration: number };
  createdAt: number;
}>();

// ============================================================
// Запись голосового сообщения
// ============================================================

/**
 * Начинает запись с микрофона в Opus-файл.
 * Возвращает путь к временному файлу.
 */
export async function startRecording(): Promise<string> {
  try {
    const path = `${FileSystem.cacheDirectory}${TEMP_OPUS_FILE}`;

    const audioSet = {
      AudioEncoderAndroid: 'opus',
      AudioSourceAndroid: 'mic',
      AVEncoderAudioQualityKeyIOS: 'high',
      AVNumberOfChannelsKeyIOS: 1,
      AVSampleRateConverterAudioQualityKeyIOS: 'high',
      AVEncoderBitRateKeyIOS: 8000,
      AVSampleRateKeyIOS: 16000,
      AVFormatIDKeyIOS: 'opus',
      OutputFormatAndroid: 'opus',
      SampleRate: 16000,
      NumberOfChannels: 1,
      BitRate: 8000,
    } as Record<string, string | number>;

    await audioRecorderPlayer.startRecorder(path, audioSet);
    recordingStartTime = Date.now();
    console.warn('[VoiceMailService] Запись начата');

    return path;
  } catch (err) {
    console.warn('[VoiceMailService] Ошибка начала записи:', err);
    throw err;
  }
}

/**
 * Останавливает запись и возвращает путь к Opus-файлу.
 */
export async function stopRecording(): Promise<{ path: string; duration: number }> {
  try {
    const result = await audioRecorderPlayer.stopRecorder();
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

    console.warn('[VoiceMailService] Запись остановлена');

    return {
      path: result,
      duration,
    };
  } catch (err) {
    console.warn('[VoiceMailService] Ошибка остановки записи:', err);
    throw err;
  }
}

// ============================================================
// Фрагментация Opus-файла
// ============================================================

/**
 * Читает Opus-файл, разбивает на фрагменты по BLE_PAYLOAD_LIMIT байт
 * и отправляет через MeshService.
 *
 * @param filePath — путь к Opus-файлу
 * @param targetId — ID получателя
 * @param duration — длительность записи (сек)
 */
export async function fragmentAndSendVoiceMail(
  filePath: string,
  targetId: string,
  duration: number,
): Promise<void> {
  try {
    // Читаем файл как base64
    const base64Content = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.Base64 });
    const totalBytes = base64Content.length;
    const totalFragments = Math.ceil(totalBytes / BLE_PAYLOAD_LIMIT);

    if (totalFragments > VOICE_MAX_FRAGMENTS) {
      throw new Error(`Слишком много фрагментов: ${totalFragments}`);
    }

    const sessionId = uuidv4.v4();

    // Отправляем метаданные первым пакетом
    const metadataPayload = JSON.stringify({
      duration,
      totalFragments,
      sessionId,
      fileName: 'voice.opus',
    });

    await MeshService.sendMessage(
      MessageType.VOICE_MAIL,
      metadataPayload,
      targetId,
      { fragmentIndex: 0, fragmentTotal: totalFragments + 1, fragmentSessionId: sessionId },
    );

    // Отправляем каждый фрагмент
    for (let i = 0; i < totalFragments; i++) {
      const start = i * BLE_PAYLOAD_LIMIT;
      const end = Math.min(start + BLE_PAYLOAD_LIMIT, totalBytes);
      const chunk = base64Content.slice(start, end);

      await MeshService.sendMessage(
        MessageType.VOICE_MAIL_CHUNK,
        chunk,
        targetId,
        {
          fragmentIndex: i + 1,
          fragmentTotal: totalFragments + 1,
          fragmentSessionId: sessionId,
        },
      );
    }

    console.warn(
      `[VoiceMailService] Отправлено ${totalFragments + 1} фрагментов для ${targetId}`,
    );
  } catch (err) {
    console.warn('[VoiceMailService] Ошибка фрагментации/отправки:', err);
    throw err;
  }
}

// ============================================================
// Сборка фрагментов (на стороне получателя)
// ============================================================

/**
 * Обрабатывает входящий фрагмент голосового сообщения.
 * Когда все фрагменты получены — собирает и сохраняет файл.
 *
 * @param packet — входящий mesh-пакет
 * @returns путь к собранному Opus-файлу, или null если сборка ещё не завершена
 */
export async function processIncomingFragment(
  packet: MeshPacket,
): Promise<string | null> {
  try {
    if (!packet.fragmentSessionId || packet.fragmentIndex === undefined || packet.fragmentTotal === undefined) {
      return null;
    }

    const { fragmentSessionId, fragmentIndex, fragmentTotal, payload } = packet;

    // Очищаем зависшие сессии (таймаут 5 мин)
    const now = Date.now();
    for (const [sid, buf] of assemblyBuffer) {
      if (now - buf.createdAt > ASSEMBLY_TIMEOUT_MS) {
        assemblyBuffer.delete(sid);
      }
    }

    // Инициализируем буфер сборки
    if (!assemblyBuffer.has(fragmentSessionId)) {
      assemblyBuffer.set(fragmentSessionId, {
        chunks: new Array(fragmentTotal).fill(''),
        total: fragmentTotal,
        received: 0,
        metadata: { duration: 0 },
        createdAt: now,
      });
    }

    const buffer = assemblyBuffer.get(fragmentSessionId)!;

    // Фрагмент 0 — метаданные
    if (fragmentIndex === 0) {
      try {
        const meta = JSON.parse(payload);
        buffer.metadata = { duration: meta.duration || 0 };
      } catch { /* ignore */ }
      buffer.received += 1;
    } else {
      if (!buffer.chunks[fragmentIndex]) {
        buffer.chunks[fragmentIndex] = payload;
        buffer.received += 1;
      }
    }

    // Если получили все фрагменты — собираем
    if (buffer.received === buffer.total) {
      const assembledBase64 = buffer.chunks.join('');
      const outputPath = `${FileSystem.cacheDirectory}received_voice_${fragmentSessionId}.opus`;

      await FileSystem.writeAsStringAsync(outputPath, assembledBase64, { encoding: FileSystem.EncodingType.Base64 });

      assemblyBuffer.delete(fragmentSessionId);
      console.warn('[VoiceMailService] Голосовое сообщение собрано');

      return outputPath;
    }

    return null;
  } catch (err) {
    console.warn('[VoiceMailService] Ошибка сборки фрагмента:', err);
    return null;
  }
}

// ============================================================
// Воспроизведение
// ============================================================

/**
 * Воспроизводит Opus-файл голосового сообщения.
 */
export async function playVoiceMail(filePath: string): Promise<void> {
  try {
    await audioRecorderPlayer.startPlayer(filePath);
    console.warn('[VoiceMailService] Воспроизведение начато');
  } catch (err) {
    console.warn('[VoiceMailService] Ошибка воспроизведения:', err);
    throw err;
  }
}

/**
 * Останавливает воспроизведение.
 */
export async function stopPlayback(): Promise<void> {
  try {
    await audioRecorderPlayer.stopPlayer();
  } catch (err) {
    console.warn('[VoiceMailService] Ошибка остановки:', err);
  }
}
