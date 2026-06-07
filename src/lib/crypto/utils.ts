// Crypto helpers shared by the Signal service: base64url encoding,
// X25519 public-key import, HKDF→AES-256-GCM key derivation. No state;
// no I/O; all functions are pure given their inputs.

/** RFC 4648 base64url, no padding. */
export function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += 1) bin += String.fromCharCode(u8[i]);
  // btoa → standard base64; convert to base64url.
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  // Allocate a fresh ArrayBuffer (NOT ArrayBufferLike) so the resulting
  // Uint8Array satisfies `Uint8Array<ArrayBuffer>` in stricter TS targets
  // that Web Crypto / structured-clone APIs require.
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Import a raw X25519 public key (32 bytes) as a CryptoKey for ECDH. */
export function importX25519Public(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw as unknown as BufferSource,
    { name: 'X25519' },
    true,
    [],
  );
}

/** Import a raw Ed25519 public key (32 bytes) as a CryptoKey for verify. */
export function importEd25519Public(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw as unknown as BufferSource,
    { name: 'Ed25519' },
    true,
    ['verify'],
  );
}

/**
 * HKDF-SHA256 over the supplied input keying material, deriving a
 * 256-bit AES-GCM key. Salt is zeroed (Signal's X3DH does the same)
 * and the info string namespaces this derivation so the same IKM
 * couldn't accidentally be reused for a different purpose downstream.
 */
export async function hkdfAesKey(
  ikm: Uint8Array,
  info: string,
): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    ikm as unknown as BufferSource,
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(info),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Concatenate any number of byte arrays in order. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const p of parts) total += p.length;
  // Fresh ArrayBuffer (see note in `base64UrlToBytes`).
  const buf = new ArrayBuffer(total);
  const out = new Uint8Array(buf);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Random 16-bit unsigned int — used for Signal-style registration_id. */
export function randomRegistrationId(): number {
  const buf = new Uint16Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/**
 * Verify a raw Ed25519 signature over a message. Returns `false` on any
 * exception (malformed key, bad algorithm support, mismatched length)
 * so callers can branch on the boolean instead of try/catch. v0.9.1
 * uses this to gate bundle acceptance before deriving ECDH material.
 */
export async function verifyEd25519Signature(
  signingKeyRaw: Uint8Array,
  signature: Uint8Array,
  message: Uint8Array,
): Promise<boolean> {
  try {
    const key = await importEd25519Public(signingKeyRaw);
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      signature as unknown as BufferSource,
      message as unknown as BufferSource,
    );
  } catch {
    return false;
  }
}

/** Hex string (lowercase) of arbitrary bytes — used for fingerprint debug. */
export function bytesToHex(u8: Uint8Array): string {
  let out = '';
  for (let i = 0; i < u8.length; i += 1) {
    out += u8[i].toString(16).padStart(2, '0');
  }
  return out;
}
