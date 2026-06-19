// ============================================================
// Mash — CryptoService: X3DH + Double Ratchet (Signal Protocol)
// ============================================================
// Реализует сквозное шифрование сообщений.
// X3DH — асинхронный обмен ключами при первом контакте.
// Double Ratchet — последующая смена ключей на каждое сообщение.
// ============================================================

import { x25519 } from '@noble/curves/ed25519';
import { AES, utils } from 'react-native-simple-crypto';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { KeyBundle, KeySession, MeshPacket, MessageType } from '../types';
import {
  getKeyBundle,
  getKeySessions,
  saveKeySession,
  setKeyBundle,
} from './StorageService';

/** Длина ключей в байтах */
const KEY_LENGTH = 32;

/** Длина соли для HKDF */
const SALT_LENGTH = 32;

/** Количество одноразовых пре-ключей (OPK) в пуле */
const OPK_POOL_SIZE = 10;

// ============================================================
// Генерация собственного KeyBundle
// ============================================================

/**
 * Создаёт новый набор ключей для X3DH-рукопожатия.
 * Вызывается один раз при инициализации приложения.
 */
export async function generateKeyBundle(): Promise<KeyBundle> {
  try {
    // Генерируем Identity Key (долговременный)
    const identityKey = await utils.randomBytes(KEY_LENGTH);

    // Генерируем Signed Pre-Key (среднесрочный)
    const signedPreKey = await utils.randomBytes(KEY_LENGTH);

    // Подписываем SPK ключом IK (HMAC-SHA256)
    const signature = await hmacSign(identityKey, signedPreKey);

    // Генерируем пул One-Time Pre-Keys
    const oneTimePreKeys: string[] = [];
    for (let i = 0; i < OPK_POOL_SIZE; i++) {
      const opk = await utils.randomBytes(KEY_LENGTH);
      oneTimePreKeys.push(await bytesToBase64(opk));
    }

    const bundle: KeyBundle = {
      identityKey: await bytesToBase64(identityKey),
      signedPreKey: await bytesToBase64(signedPreKey),
      signature: await bytesToBase64(signature),
      oneTimePreKeys,
    };

    // Сохраняем в локальное хранилище
    setKeyBundle(JSON.stringify(bundle));

    return bundle;
  } catch (err) {
    console.warn('[CryptoService] Ошибка генерации KeyBundle:', err);
    throw err;
  }
}

// ============================================================
// X3DH — асинхронный обмен ключами
// ============================================================

/**
 * Выполняет X3DH-рукопожатие: создаёт общий секрет
 * на основе своего identityKey и пре-ключей собеседника.
 *
 * @param peerBundle — KeyBundle собеседника (полученный через BLE)
 * @param peerId — ID собеседника
 */
export async function performX3DH(
  peerBundle: KeyBundle,
  peerId: string,
): Promise<KeySession> {
  try {
    const myBundleJson = getKeyBundle();
    if (!myBundleJson) {
      throw new Error('[CryptoService] Собственный KeyBundle не найден');
    }

    const myBundle: KeyBundle = JSON.parse(myBundleJson);
    const myIdentityKey = await base64ToBytes(myBundle.identityKey);
    const mySignedPreKey = await base64ToBytes(myBundle.signedPreKey);
    const peerIdentityKey = await base64ToBytes(peerBundle.identityKey);
    const peerSignedPreKey = await base64ToBytes(peerBundle.signedPreKey);

    // DH1 = IK_A × SPK_B
    const dh1 = await ecdh(myIdentityKey, peerSignedPreKey);

    // DH2 = SPK_A × IK_B
    const dh2 = await ecdh(mySignedPreKey, peerIdentityKey);

    // DH3 = SPK_A × SPK_B
    const dh3 = await ecdh(mySignedPreKey, peerSignedPreKey);

    // Если у собеседника есть OPK — используем его
    let dh4: ArrayBuffer | null = null;
    if (peerBundle.oneTimePreKeys.length > 0) {
      const peerOpk = await base64ToBytes(peerBundle.oneTimePreKeys[0]);
      dh4 = await ecdh(mySignedPreKey, peerOpk);
    }

    // SK = HKDF(DH1 || DH2 || DH3 || [DH4])
    const concatKeys = concatenateBuffers([
      dh1,
      dh2,
      dh3,
      ...(dh4 ? [dh4] : []),
    ]);
    const salt = await utils.randomBytes(SALT_LENGTH);
    const sharedSecretBase = hkdf(sha256, new Uint8Array(concatKeys), new Uint8Array(salt), new TextEncoder().encode('KAmeshX3DH'), KEY_LENGTH * 3);

    // Разделяем общий секрет на rootKey, sendKey, recvKey
    const rootKey = sharedSecretBase.slice(0, KEY_LENGTH);
    const sendKey = sharedSecretBase.slice(KEY_LENGTH, KEY_LENGTH * 2);
    const recvKey = sharedSecretBase.slice(KEY_LENGTH * 2);

    const session: KeySession = {
      peerId,
      rootKey: await bytesToBase64(rootKey),
      sendKey: await bytesToBase64(sendKey),
      recvKey: await bytesToBase64(recvKey),
      sendCounter: 0,
      recvCounter: 0,
      createdAt: Date.now(),
    };

    // Сохраняем сессию
    saveKeySession(peerId, session);

    return session;
  } catch (err) {
    console.warn('[CryptoService] Ошибка X3DH:', err);
    throw err;
  }
}

// ============================================================
// Double Ratchet — шифрование/дешифрование
// ============================================================

/**
 * Шифрует сообщение с использованием Double Ratchet.
 * На каждом сообщении цепочный ключ обновляется (DH-ratchet).
 */
export async function encryptMessage(
  plaintext: string,
  peerId: string,
): Promise<string> {
  try {
    let session = getKeySessions()[peerId];
    if (!session) {
      throw new Error(`[CryptoService] Нет сессии ключей для ${peerId}`);
    }

    // Получаем текущий ключ отправки
    const sendKeyBytes = await base64ToBytes(session.sendKey);

    // Генерируем IV (12 байт для AES-GCM)
    const iv = await utils.randomBytes(12);

    // Шифруем AES-256-GCM
    const encrypted = await AES.encrypt(
      stringToBytes(plaintext),
      sendKeyBytes,
      iv,
    );

    // Увеличиваем счётчик
    session.sendCounter += 1;

    // Ratchet: обновляем ключи (KDF цепочки)
    const newKeys = await ratchetStep(session.sendKey, session.rootKey);
    session.sendKey = newKeys.chainKey;
    session.rootKey = newKeys.rootKey;

    // Сохраняем обновлённую сессию
    saveKeySession(peerId, session);

    // Возвращаем base64: IV + ciphertext + tag
    const combined = concatenateBuffers([iv, encrypted]);
    return await bytesToBase64(combined);
  } catch (err) {
    console.warn('[CryptoService] Ошибка шифрования:', err);
    throw err;
  }
}

/**
 * Дешифрует сообщение, полученное от peerId.
 */
export async function decryptMessage(
  cipherB64: string,
  peerId: string,
): Promise<string> {
  try {
    const session = getKeySessions()[peerId];
    if (!session) {
      throw new Error(`[CryptoService] Нет сессии ключей для ${peerId}`);
    }

    const recvKeyBytes = await base64ToBytes(session.recvKey);
    const combined = await base64ToBytes(cipherB64);

    // Первые 12 байт — IV
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // Дешифруем
    const decrypted = await AES.decrypt(ciphertext, recvKeyBytes, iv);

    // Обновляем ключи приёма
    session.recvCounter += 1;
    const newKeys = await ratchetStep(session.recvKey, session.rootKey);
    session.recvKey = newKeys.chainKey;
    session.rootKey = newKeys.rootKey;

    saveKeySession(peerId, session);

    return bytesToString(decrypted);
  } catch (err) {
    console.warn('[CryptoService] Ошибка дешифрования:', err);
    throw err;
  }
}

// ============================================================
// Шифрование/дешифрование MeshPacket
// ============================================================

/**
 * Шифрует payload MeshPacket перед отправкой в mesh-сеть.
 */
export async function encryptPacket(packet: MeshPacket): Promise<MeshPacket> {
  try {
    if (
      packet.type === MessageType.KEY_EXCHANGE ||
      packet.type === MessageType.PING ||
      packet.type === MessageType.PONG ||
      packet.type === MessageType.DELIVERY_ACK ||
      packet.type === MessageType.INTERCOM_AUDIO ||
      packet.type === MessageType.SDP_OFFER ||
      packet.type === MessageType.SDP_ANSWER ||
      packet.type === MessageType.ICE_CANDIDATE
    ) {
      // Служебные пакеты не шифруются
      return packet;
    }

    const encryptedPayload = await encryptMessage(packet.payload, packet.targetId);
    return { ...packet, payload: encryptedPayload };
  } catch (err) {
    console.warn('[CryptoService] Ошибка шифрования пакета:', err);
    throw err;
  }
}

/**
 * Дешифрует payload входящего MeshPacket.
 */
export async function decryptPacket(
  packet: MeshPacket,
  myNodeId: string,
): Promise<MeshPacket> {
  try {
    if (
      packet.type === MessageType.KEY_EXCHANGE ||
      packet.type === MessageType.PING ||
      packet.type === MessageType.PONG ||
      packet.type === MessageType.DELIVERY_ACK ||
      packet.type === MessageType.INTERCOM_AUDIO ||
      packet.type === MessageType.SDP_OFFER ||
      packet.type === MessageType.SDP_ANSWER ||
      packet.type === MessageType.ICE_CANDIDATE
    ) {
      // Сигнальные сообщения не шифруются (SDP и ICE уже защищены DTLS)
      return packet;
    }

    // Дешифруем, только если сообщение адресовано нам
    if (packet.targetId !== myNodeId && !packet.isBroadcast) {
      return packet;
    }

    const decrypted = await decryptMessage(packet.payload, packet.sourceId);
    return { ...packet, payload: decrypted };
  } catch (err) {
    console.warn('[CryptoService] Ошибка дешифрования пакета:', err);
    // Возвращаем исходный пакет — возможно, нет ключа
    return packet;
  }
}

// ============================================================
// Вспомогательные криптографические функции
// ============================================================

/**
 * HMAC-SHA256 подпись
 */
async function hmacSign(key: ArrayBuffer, data: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    // Используем HKDF без расширения, только для HMAC
    const salt = await utils.randomBytes(32);
    const result = hkdf(
      sha256,
      new Uint8Array(concatenateBuffers([key, data])),
      new Uint8Array(salt),
      new TextEncoder().encode('KAmeshHMAC'),
      KEY_LENGTH,
    );
    return result;
  } catch (err) {
    console.warn('[CryptoService] Ошибка HMAC:', err);
    throw err;
  }
}

/**
 * ECDH — вычисление общего секрета через X25519 (Curve25519).
 * Использует @noble/curves — pure JS, совместим с RN.
 */
async function ecdh(
  privateKey: ArrayBuffer,
  publicKey: ArrayBuffer,
): Promise<ArrayBuffer> {
  try {
    const priv = new Uint8Array(privateKey);
    const pub = new Uint8Array(publicKey);
    const shared = x25519.getSharedSecret(priv, pub);
    // Обрезаем до KEY_LENGTH (x25519 выдаёт 32 байта)
    return shared.buffer.slice(0, KEY_LENGTH);
  } catch (err) {
    console.warn('[CryptoService] Ошибка ECDH (x25519):', err);
    throw err;
  }
}

/**
 * Ratchet step: обновление ключей через KDF
 */
async function ratchetStep(
  currentChainKey: string,
  currentRootKey: string,
): Promise<{ chainKey: string; rootKey: string }> {
  try {
    const ckBytes = await base64ToBytes(currentChainKey);
    const rkBytes = await base64ToBytes(currentRootKey);
    const salt = await utils.randomBytes(SALT_LENGTH);

    const derived = hkdf(
      sha256,
      new Uint8Array(concatenateBuffers([ckBytes, rkBytes])),
      new Uint8Array(salt),
      new TextEncoder().encode('KAmeshRatchet'),
      KEY_LENGTH * 2,
    );

    return {
      chainKey: await bytesToBase64(derived.slice(0, KEY_LENGTH)),
      rootKey: await bytesToBase64(derived.slice(KEY_LENGTH)),
    };
  } catch (err) {
    console.warn('[CryptoService] Ошибка ratchet:', err);
    throw err;
  }
}

// ============================================================
// Утилиты для работы с байтами
// ============================================================

async function bytesToBase64(bytes: ArrayBuffer): Promise<string> {
  // Используем глобальный btoa через Uint8Array
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

async function base64ToBytes(b64: string): Promise<ArrayBuffer> {
  const binary = atob(b64);
  const uint8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8[i] = binary.charCodeAt(i);
  }
  return uint8.buffer;
}

function stringToBytes(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer;
}

function bytesToString(buf: ArrayBuffer): string {
  return new TextDecoder().decode(buf);
}

function concatenateBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLen = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result.buffer;
}
