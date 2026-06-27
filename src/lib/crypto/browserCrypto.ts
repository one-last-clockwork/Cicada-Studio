import type { PublicEncryptedBlob } from '../../types/project';
import { base64ToBytes, bytesToBase64, bytesToText, textToBytes } from './encoding';
import { normalizeAnswer } from './normalization';

const KEY_USAGE: KeyUsage[] = ['encrypt', 'decrypt'];
const PBKDF2_ITERATIONS = 250_000;

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    bufferSource(textToBytes(normalizeAnswer(secret))),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: bufferSource(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    KEY_USAGE
  );
}

export async function encryptText(secret: string, plaintext: string): Promise<PublicEncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bufferSource(iv) }, key, bufferSource(textToBytes(plaintext)));

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted))
  };
}

export async function decryptText(secret: string, blob: PublicEncryptedBlob): Promise<string> {
  const salt = base64ToBytes(blob.salt);
  const iv = base64ToBytes(blob.iv);
  const ciphertext = base64ToBytes(blob.ciphertext);
  const key = await deriveKey(secret, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bufferSource(iv) }, key, bufferSource(ciphertext));
  return bytesToText(new Uint8Array(decrypted));
}

export async function tryDecryptText(secret: string, blob: PublicEncryptedBlob): Promise<string | null> {
  try {
    return await decryptText(secret, blob);
  } catch {
    return null;
  }
}
