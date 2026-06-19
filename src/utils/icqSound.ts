/**
 * Генерация WAV-файла с ICQ-подобным звуком уведомления.
 * Два коротких восходящих тона: ~800 Гц → ~1000 Гц.
 */

/** Создать WAV-буфер с двухтональным звуком */
function generateIcqWav(): Uint8Array {
  const sampleRate = 22050;
  const tone1Freq = 800;
  const tone2Freq = 1050;
  const toneDuration = 0.1; // 100 мс на тон
  const gapDuration = 0.05; // 50 мс пауза
  const totalSamples = Math.floor(sampleRate * (toneDuration * 2 + gapDuration));
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = totalSamples * blockAlign;
  const fileSize = 44 + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Generate audio data
  const tone1Samples = Math.floor(sampleRate * toneDuration);
  const gapSamples = Math.floor(sampleRate * gapDuration);
  const tone2Samples = Math.floor(sampleRate * toneDuration);
  const volume = 0.7;

  let sampleIndex = 0;
  const writeSample = (freq: number, numSamples: number) => {
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const value = Math.sin(2 * Math.PI * freq * t) * volume;
      const intVal = Math.max(-32767, Math.min(32767, Math.floor(value * 32767)));
      view.setInt16(44 + sampleIndex * 2, intVal, true);
      sampleIndex++;
    }
  };

  // Envelope: fade in/out for smoother sound
  const writeSampleWithEnvelope = (freq: number, numSamples: number) => {
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Simple trapezoid envelope
      const fadeLen = Math.min(numSamples * 0.1, 200);
      let envelope = 1;
      if (i < fadeLen) envelope = i / fadeLen;
      if (i > numSamples - fadeLen) envelope = (numSamples - i) / fadeLen;

      const value = Math.sin(2 * Math.PI * freq * t) * volume * envelope;
      const intVal = Math.max(-32767, Math.min(32767, Math.floor(value * 32767)));
      view.setInt16(44 + sampleIndex * 2, intVal, true);
      sampleIndex++;
    }
  };

  writeSampleWithEnvelope(tone1Freq, tone1Samples);
  // Gap (silence)
  sampleIndex += gapSamples;
  writeSampleWithEnvelope(tone2Freq, tone2Samples);

  return new Uint8Array(buffer);
}

/** Преобразовать Uint8Array в base64 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function getIcqWavBase64(): string {
  const wav = generateIcqWav();
  return uint8ArrayToBase64(wav);
}

export const ICQ_WAV_MIME = 'audio/wav';
export const ICQ_WAV_FILENAME = 'icq-notification.wav';
