import { x25519 } from '@noble/curves/ed25519';
import { AES, utils } from 'react-native-simple-crypto';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { KeyBundle, KeySession, MeshPacket, MessageType } from '../types';
import {
  getKeyBundle,
  getKeySessions,
  saveKeySession,
  setKeyBundle,
} from './StorageService';

const KEY_LENGTH = 32;
const OPK_POOL_SIZE = 10;

// ============================================================
// KeyBundle generation
// ============================================================

export async function generateKeyBundle(): Promise<KeyBundle> {
  try {
    const identityKey = await utils.randomBytes(KEY_LENGTH);
    const signedPreKey = await utils.randomBytes(KEY_LENGTH);
    const signature = await hmacSign(identityKey, signedPreKey);

    const oneTimePreKeys: string[] = [];
    for (let i = 0; i < OPK_POOL_SIZE; i++) {
      const opk = await utils.randomBytes(KEY_LENGTH);
      oneTimePreKeys.push(bytesToBase64(opk));
    }

    const bundle: KeyBundle = {
      identityKey: bytesToBase64(identityKey),
      signedPreKey: bytesToBase64(signedPreKey),
      signature: bytesToBase64(signature),
      oneTimePreKeys,
    };

    setKeyBundle(JSON.stringify(bundle));
    return bundle;
  } catch (err) {
    console.warn('[CryptoService] generateKeyBundle error:', err);
    throw err;
  }
}

// ============================================================
// X3DH key exchange
// ============================================================

export async function performX3DH(
  peerBundle: KeyBundle,
  peerId: string,
): Promise<KeySession> {
  try {
    const myBundleJson = getKeyBundle();
    if (!myBundleJson) {
      throw new Error('[CryptoService] Own KeyBundle not found');
    }

    const myBundle: KeyBundle = JSON.parse(myBundleJson);
    const myIdentityKey = base64ToBytes(myBundle.identityKey);
    const mySignedPreKey = base64ToBytes(myBundle.signedPreKey);
    const peerIdentityKey = base64ToBytes(peerBundle.identityKey);
    const peerSignedPreKey = base64ToBytes(peerBundle.signedPreKey);

    // Verify peer's SPK signature (SPK signed by IK)
    const sigOk = await verifyHmac(peerIdentityKey, peerSignedPreKey, base64ToBytes(peerBundle.signature));
    if (!sigOk) {
      throw new Error('[CryptoService] Peer SPK signature verification failed');
    }

    // Generate ephemeral key pair for forward secrecy
    const ephemeralSecret = x25519.utils.randomPrivateKey();
    const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);

    // X3DH:
    // DH1 = IK_A × SPK_B  (static-static)
    const dh1 = ecdh(myIdentityKey, peerSignedPreKey);
    // DH2 = EK_A × IK_B   (ephemeral-static)
    const dh2 = ecdh(ephemeralSecret, peerIdentityKey);
    // DH3 = EK_A × SPK_B  (ephemeral-signed-pre)
    const dh3 = ecdh(ephemeralSecret, peerSignedPreKey);

    // DH4 = EK_A × OPK_B  (optional, one-time pre key)
    let dh4: ArrayBuffer | null = null;
    if (peerBundle.oneTimePreKeys.length > 0) {
      const peerOpk = base64ToBytes(peerBundle.oneTimePreKeys[0]);
      dh4 = ecdh(ephemeralSecret, peerOpk);
    }

    // SK = HKDF(DH1 || DH2 || DH3 || [DH4])
    const concatKeys = concatenateBuffers([
      dh1, dh2, dh3,
      ...(dh4 ? [dh4] : []),
    ]);

    const sharedSecretBase = hkdf(
      sha256,
      new Uint8Array(concatKeys),
      ephemeralPublic,
      new TextEncoder().encode('KAmeshX3DH'),
      KEY_LENGTH * 3,
    );

    const rootKey = sharedSecretBase.slice(0, KEY_LENGTH);
    const sendKey = sharedSecretBase.slice(KEY_LENGTH, KEY_LENGTH * 2);
    const recvKey = sharedSecretBase.slice(KEY_LENGTH * 2);

    const session: KeySession = {
      peerId,
      rootKey: bytesToBase64(rootKey),
      sendKey: bytesToBase64(sendKey),
      recvKey: bytesToBase64(recvKey),
      sendCounter: 0,
      recvCounter: 0,
      createdAt: Date.now(),
    };

    saveKeySession(peerId, session);
    return session;
  } catch (err) {
    console.warn('[CryptoService] X3DH error:', err);
    throw err;
  }
}

// ============================================================
// Double Ratchet encryption/decryption
// ============================================================

export async function encryptMessage(
  plaintext: string,
  peerId: string,
): Promise<string> {
  try {
    const keySessions = getKeySessions();
    const session = keySessions[peerId];
    if (!session) {
      throw new Error(`[CryptoService] No key session for ${peerId}`);
    }

    const sendKeyBytes = base64ToBytes(session.sendKey);
    const iv = await utils.randomBytes(12);

    const encrypted = await AES.encrypt(
      stringToBytes(plaintext),
      sendKeyBytes,
      iv,
    );

    session.sendCounter += 1;
    const newKeys = ratchetStep(session.sendKey, session.rootKey);
    session.sendKey = newKeys.chainKey;
    session.rootKey = newKeys.rootKey;

    saveKeySession(peerId, session);

    const combined = concatenateBuffers([iv, encrypted]);
    return bytesToBase64(combined);
  } catch (err) {
    console.warn('[CryptoService] encryptMessage error:', err);
    throw err;
  }
}

export async function decryptMessage(
  cipherB64: string,
  peerId: string,
): Promise<string> {
  try {
    const keySessions = getKeySessions();
    const session = keySessions[peerId];
    if (!session) {
      throw new Error(`[CryptoService] No key session for ${peerId}`);
    }

    const recvKeyBytes = base64ToBytes(session.recvKey);
    const combined = base64ToBytes(cipherB64);

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await AES.decrypt(ciphertext, recvKeyBytes, iv);

    session.recvCounter += 1;
    const newKeys = ratchetStep(session.recvKey, session.rootKey);
    session.recvKey = newKeys.chainKey;
    session.rootKey = newKeys.rootKey;

    saveKeySession(peerId, session);

    return bytesToString(decrypted);
  } catch (err) {
    console.warn('[CryptoService] decryptMessage error:', err);
    throw err;
  }
}

// ============================================================
// MeshPacket encryption/decryption
// ============================================================

export async function encryptPacket(packet: MeshPacket): Promise<MeshPacket> {
  try {
    if (
      packet.type === MessageType.KEY_EXCHANGE ||
      packet.type === MessageType.PING ||
      packet.type === MessageType.PONG ||
      packet.type === MessageType.DELIVERY_ACK ||
      packet.type === MessageType.INTERCOM_AUDIO
    ) {
      return packet;
    }

    if (packet.isBroadcast || packet.targetId === 'broadcast') {
      return packet;
    }

    const encryptedPayload = await encryptMessage(packet.payload, packet.targetId);
    return { ...packet, payload: encryptedPayload };
  } catch (err) {
    console.warn('[CryptoService] encryptPacket error, sending in clear:', err);
    return packet;
  }
}

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
      packet.type === MessageType.INTERCOM_AUDIO
    ) {
      return packet;
    }

    if (packet.isBroadcast || packet.targetId === 'broadcast') {
      return packet;
    }

    if (packet.targetId !== myNodeId && !packet.isBroadcast) {
      return packet;
    }

    const decrypted = await decryptMessage(packet.payload, packet.sourceId);
    return { ...packet, payload: decrypted };
  } catch (err) {
    console.warn('[CryptoService] decryptPacket error:', err);
    return packet;
  }
}

// ============================================================
// Cryptographic helpers
// ============================================================

function hmacSign(key: ArrayBuffer, data: ArrayBuffer): ArrayBuffer {
  const result = hmac(sha256, new Uint8Array(key), new Uint8Array(data));
  return result.buffer;
}

function verifyHmac(key: ArrayBuffer, data: ArrayBuffer, expectedSig: ArrayBuffer): boolean {
  const computed = hmac(sha256, new Uint8Array(key), new Uint8Array(data));
  const exp = new Uint8Array(expectedSig);
  if (computed.length !== exp.length) return false;
  for (let i = 0; i < computed.length; i++) {
    if (computed[i] !== exp[i]) return false;
  }
  return true;
}

function ecdh(
  privateKey: ArrayBuffer,
  publicKey: ArrayBuffer,
): ArrayBuffer {
  const priv = new Uint8Array(privateKey);
  const pub = new Uint8Array(publicKey);
  const shared = x25519.getSharedSecret(priv, pub);
  return shared.buffer.slice(0, KEY_LENGTH);
}

function ratchetStep(
  currentChainKey: string,
  currentRootKey: string,
): { chainKey: string; rootKey: string } {
  const ckBytes = base64ToBytes(currentChainKey);
  const rkBytes = base64ToBytes(currentRootKey);

  const derived = hkdf(
    sha256,
    new Uint8Array(ckBytes),
    new Uint8Array(rkBytes),
    new TextEncoder().encode('KAmeshRatchet'),
    KEY_LENGTH * 2,
  );

  return {
    chainKey: bytesToBase64(derived.slice(0, KEY_LENGTH).buffer),
    rootKey: bytesToBase64(derived.slice(KEY_LENGTH).buffer),
  };
}

// ============================================================
// Base64 helpers (Hermes-compatible, no btoa/atob)
// ============================================================

const BASE64_CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: ArrayBuffer): string {
  const uint8 = new Uint8Array(bytes);
  let result = '';
  for (let i = 0; i < uint8.length; i += 3) {
    const a = uint8[i];
    const b = i + 1 < uint8.length ? uint8[i + 1] : 0;
    const c = i + 2 < uint8.length ? uint8[i + 2] : 0;
    result += BASE64_CODE[a >> 2];
    result += BASE64_CODE[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < uint8.length) {
      result += BASE64_CODE[((b & 15) << 2) | (c >> 6)];
    } else {
      result += '=';
    }
    if (i + 2 < uint8.length) {
      result += BASE64_CODE[c & 63];
    } else {
      result += '=';
    }
  }
  return result;
}

function base64ToBytes(b64: string): ArrayBuffer {
  const sanitized = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = (sanitized.length * 3) / 4;
  const uint8 = new Uint8Array(len);
  let j = 0;
  for (let i = 0; i < sanitized.length; i += 4) {
    const a = BASE64_CODE.indexOf(sanitized[i]);
    const b = BASE64_CODE.indexOf(sanitized[i + 1]);
    const c = BASE64_CODE.indexOf(sanitized[i + 2]);
    const d = BASE64_CODE.indexOf(sanitized[i + 3]);
    uint8[j++] = (a << 2) | (b >> 4);
    if (c !== -1) uint8[j++] = ((b & 15) << 4) | (c >> 2);
    if (d !== -1) uint8[j++] = ((c & 3) << 6) | d;
  }
  return uint8.buffer.slice(0, j);
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
