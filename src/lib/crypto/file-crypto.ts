// v0.11.0 — per-attachment AES-256-GCM file encryption.
//
// Used for image / file / voice attachments. The sender generates a
// fresh 32-byte AES-GCM key + 12-byte IV per attachment, encrypts the
// file bytes once, uploads the ciphertext as an opaque blob, and ships
// `{ key, iv }` to every recipient via the existing per-recipient
// message envelope (so the server never sees the media key in the
// clear). Recipients download the ciphertext blob and decrypt with the
// key from their envelope.
//
// Distinct media key per attachment (not per chat) — the simplest
// design that avoids any cross-message key management. Recovery is
// per-message: lose the message envelope, lose access to that one
// attachment.

import { base64UrlToBytes, bytesToBase64Url } from './utils';

const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface MediaCipherMaterial {
  /** AES-256-GCM ciphertext + 16-byte auth tag appended. */
  ciphertext: Uint8Array;
  /** Raw 32-byte AES key. base64url it before stuffing in the envelope. */
  key: Uint8Array;
  /** 12-byte GCM IV. base64url it before stuffing in the envelope. */
  iv: Uint8Array;
}

/**
 * Encrypt a Blob (or any byte buffer) with a freshly generated
 * AES-256-GCM key + IV. Returns the ciphertext + the key/iv pair the
 * caller needs to hand to recipients via the message envelope.
 */
export async function encryptFile(input: Blob | ArrayBuffer | Uint8Array): Promise<MediaCipherMaterial> {
  const plain = await toUint8(input);
  const key = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    cryptoKey,
    plain as unknown as BufferSource,
  );
  return { ciphertext: new Uint8Array(ctBuf), key, iv };
}

/**
 * Decrypt a previously-encrypted attachment given the key+iv carried
 * in the message envelope. Throws if the auth tag doesn't verify (the
 * caller is expected to render the `[Unable to decrypt attachment]`
 * placeholder in that case).
 */
export async function decryptFile(
  ciphertext: Uint8Array | ArrayBuffer,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Invalid media key length ${key.length} (expected ${KEY_BYTES})`);
  }
  if (iv.length !== IV_BYTES) {
    throw new Error(`Invalid media IV length ${iv.length} (expected ${IV_BYTES})`);
  }
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    cryptoKey,
    ciphertext as unknown as BufferSource,
  );
  return new Uint8Array(ptBuf);
}

/**
 * Wire-format metadata stored inside a per-recipient envelope for an
 * encrypted attachment message. The envelope ciphertext IS the
 * stringified version of this object, encrypted via the same X25519 +
 * AES-GCM pipeline used for text messages. Recipients decrypt the
 * envelope → JSON.parse to recover this metadata → fetch the blob at
 * `url` → AES-GCM decrypt with `{ k, iv }` → render.
 *
 * `v: 1` is the schema version; future bumps can carry additional
 * fields (e.g. content-addressed hashes for integrity checks beyond
 * what AES-GCM already provides).
 */
export interface MediaMetadataV1 {
  v: 1;
  /** Public MinIO URL of the encrypted blob. Non-sensitive. */
  url: string;
  /** AES-256-GCM key (32 bytes) base64url-encoded. */
  k: string;
  /** GCM IV (12 bytes) base64url-encoded. */
  iv: string;
  /** Original mime type — used for rendering hints (image/jpeg, audio/webm, etc). */
  mime: string;
  /** Ciphertext byte length. Useful for progress bars on download. */
  size: number;
  /** FILE only: original filename for the download button. */
  filename?: string;
  /** AUDIO only: duration in seconds reported by the recorder. */
  duration?: number;
}

export function encodeKeyForWire(key: Uint8Array): string { return bytesToBase64Url(key); }
export function encodeIvForWire(iv: Uint8Array): string { return bytesToBase64Url(iv); }
export function decodeKeyFromWire(b64: string): Uint8Array { return base64UrlToBytes(b64); }
export function decodeIvFromWire(b64: string): Uint8Array { return base64UrlToBytes(b64); }

async function toUint8(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}
