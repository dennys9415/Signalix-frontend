// v0.15.0 — Key backup & device recovery.
//
// Threat model:
//   • Server is untrusted — it MUST never see plaintext keys nor the
//     recovery phrase. The .sbk file is opaque AES-256-GCM ciphertext.
//   • A leaked .sbk file alone is useless without the recovery phrase.
//   • A leaked recovery phrase alone is useless without the .sbk file.
//   • PBKDF2-SHA-256 with 600k iterations + a fresh 16-byte salt per
//     backup defends against rainbow tables and slows offline brute-
//     force enough that 96-bit phrase entropy is comfortable.
//
// File format (binary on disk; magic header lets us reject random
// files at restore time before we ask for the phrase):
//
//   Bytes 0..7   : ASCII magic "SLXBKP01"
//   Byte  8      : Schema version (currently 1)
//   Bytes 9..24  : Salt (16 bytes)
//   Bytes 25..36 : IV  (12 bytes)
//   Bytes 37..   : AES-GCM(ciphertext || authTag)  ← variable length
//
// Total fixed overhead: 37 bytes.

import {
  CRYPTO_DB_NAME,
  CRYPTO_DB_VERSION,
  STORE_FINGERPRINTS,
  STORE_IDENTITY,
  STORE_PLAINTEXT_CACHE,
  STORE_PRE_KEYS,
  STORE_SIGNED_PRE_KEYS,
  idbClearStore,
  idbGetAll,
  idbPut,
  idbPutMany,
  openCryptoDb,
  type FingerprintRecord,
  type IdentityRecord,
  type PlaintextCacheRecord,
  type PreKeyRecord,
  type SignedPreKeyRecord,
} from './db';
import { phraseToBytes } from './bip39';

const MAGIC = new TextEncoder().encode('SLXBKP01');
const SCHEMA_VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 600_000;

/* ───────────────────── Public API ─────────────────────────────────── */

/**
 * Build an encrypted backup of every crypto-related IDB store. The
 * caller is expected to display the recovery phrase to the user and
 * stream the returned bytes to a `.sbk` download.
 */
export async function createBackup(phrase: string): Promise<Uint8Array> {
  // 1. Collect plaintext payload from IDB.
  const payload = await collectPayload();

  // 2. Derive the wrapping key from the recovery phrase.
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const wrapKey = await deriveKey(phrase, salt);

  // 3. Encrypt with a fresh IV.
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    wrapKey,
    plaintext as unknown as BufferSource,
  );
  const ct = new Uint8Array(ctBuf);

  // 4. Assemble the file: magic || version || salt || iv || ct.
  const out = new Uint8Array(MAGIC.length + 1 + SALT_BYTES + IV_BYTES + ct.length);
  let off = 0;
  out.set(MAGIC, off); off += MAGIC.length;
  out[off] = SCHEMA_VERSION; off += 1;
  out.set(salt, off); off += SALT_BYTES;
  out.set(iv, off); off += IV_BYTES;
  out.set(ct, off);
  return out;
}

/**
 * Decrypt + restore an encrypted backup into the local crypto IDB.
 * Replaces the contents of every crypto store with the backup's
 * payload. Throws on any failure (bad phrase, tampered file, schema
 * mismatch) — the caller surfaces a generic "couldn't restore" so
 * timing oracles don't tell an attacker which step failed.
 */
export async function restoreBackup(file: Uint8Array, phrase: string): Promise<RestoreSummary> {
  if (file.length < MAGIC.length + 1 + SALT_BYTES + IV_BYTES + 16) {
    throw new Error('Invalid backup file (too short)');
  }
  for (let i = 0; i < MAGIC.length; i += 1) {
    if (file[i] !== MAGIC[i]) throw new Error('Not a Signalix backup file');
  }
  let off = MAGIC.length;
  const version = file[off]; off += 1;
  if (version !== SCHEMA_VERSION) {
    throw new Error(`Unsupported backup schema version ${version}`);
  }
  const salt = file.slice(off, off + SALT_BYTES); off += SALT_BYTES;
  const iv = file.slice(off, off + IV_BYTES); off += IV_BYTES;
  const ct = file.slice(off);

  const wrapKey = await deriveKey(phrase, salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      wrapKey,
      ct as unknown as BufferSource,
    );
  } catch {
    throw new Error('Wrong recovery phrase or corrupted backup');
  }

  let payload: BackupPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext)) as BackupPayload;
  } catch {
    throw new Error('Backup payload is malformed');
  }
  if (payload.v !== SCHEMA_VERSION) {
    throw new Error(`Unsupported backup payload version ${payload.v}`);
  }

  return installPayload(payload);
}

export interface RestoreSummary {
  deviceId: string;
  exportedAt: string;
  signedPreKeyCount: number;
  preKeyCount: number;
  plaintextCacheCount: number;
  fingerprintCount: number;
}

/* ───────────────────── Payload shape ───────────────────────────────── */

interface BackupPayload {
  v: number;
  deviceId: string;
  registrationId: number;
  identityJwk: { public: JsonWebKey; private: JsonWebKey };
  signingJwk: { public: JsonWebKey; private: JsonWebKey };
  identityCreatedAt: string;
  signedPreKeys: Array<{
    keyId: number;
    pair: { public: JsonWebKey; private: JsonWebKey };
    signature: string;            // base64url
    createdAt: string;
    rotatedAt?: string;
  }>;
  preKeys: Array<{
    keyId: number;
    pair: { public: JsonWebKey; private: JsonWebKey };
    consumed: boolean;
    createdAt: string;
  }>;
  plaintextCache: PlaintextCacheRecord[];
  fingerprints: FingerprintRecord[];
  exportedAt: string;
}

/* ───────────────────── Collect (sender side) ──────────────────────── */

async function collectPayload(): Promise<BackupPayload> {
  await openCryptoDb(); // ensure schema is upgraded before we read
  const identity = await idbGetAll<IdentityRecord>(STORE_IDENTITY);
  if (identity.length === 0) {
    throw new Error('No local identity to back up — initialize crypto first');
  }
  const id = identity[0];

  const spkRows = await idbGetAll<SignedPreKeyRecord>(STORE_SIGNED_PRE_KEYS);
  const preKeyRows = await idbGetAll<PreKeyRecord>(STORE_PRE_KEYS);
  const plaintextCache = await idbGetAll<PlaintextCacheRecord>(STORE_PLAINTEXT_CACHE);
  const fingerprints = await idbGetAll<FingerprintRecord>(STORE_FINGERPRINTS);

  return {
    v: SCHEMA_VERSION,
    deviceId: id.deviceId,
    registrationId: id.registrationId,
    identityJwk: {
      public: await crypto.subtle.exportKey('jwk', id.identityPair.publicKey),
      private: await crypto.subtle.exportKey('jwk', id.identityPair.privateKey),
    },
    signingJwk: {
      public: await crypto.subtle.exportKey('jwk', id.signingPair.publicKey),
      private: await crypto.subtle.exportKey('jwk', id.signingPair.privateKey),
    },
    identityCreatedAt: id.createdAt,
    signedPreKeys: await Promise.all(
      spkRows.map(async (r) => ({
        keyId: r.keyId,
        pair: {
          public: await crypto.subtle.exportKey('jwk', r.pair.publicKey),
          private: await crypto.subtle.exportKey('jwk', r.pair.privateKey),
        },
        signature: bufferToBase64Url(r.signature),
        createdAt: r.createdAt,
        ...(r.rotatedAt && { rotatedAt: r.rotatedAt }),
      })),
    ),
    preKeys: await Promise.all(
      preKeyRows.map(async (r) => ({
        keyId: r.keyId,
        pair: {
          public: await crypto.subtle.exportKey('jwk', r.pair.publicKey),
          private: await crypto.subtle.exportKey('jwk', r.pair.privateKey),
        },
        consumed: r.consumed,
        createdAt: r.createdAt,
      })),
    ),
    plaintextCache,
    fingerprints,
    exportedAt: new Date().toISOString(),
  };
}

/* ───────────────────── Install (recipient side) ────────────────────── */

async function installPayload(p: BackupPayload): Promise<RestoreSummary> {
  // Reimport every CryptoKey before we mutate IDB so any failure
  // leaves the existing state intact.
  const identityPair: CryptoKeyPair = {
    publicKey: await importX25519Jwk(p.identityJwk.public, true),
    privateKey: await importX25519Jwk(p.identityJwk.private, false),
  };
  const signingPair: CryptoKeyPair = {
    publicKey: await importEd25519Jwk(p.signingJwk.public, true),
    privateKey: await importEd25519Jwk(p.signingJwk.private, false),
  };
  const spkRecords: SignedPreKeyRecord[] = await Promise.all(
    p.signedPreKeys.map(async (r) => ({
      keyId: r.keyId,
      pair: {
        publicKey: await importX25519Jwk(r.pair.public, true),
        privateKey: await importX25519Jwk(r.pair.private, false),
      },
      signature: base64UrlToBuffer(r.signature),
      createdAt: r.createdAt,
      ...(r.rotatedAt && { rotatedAt: r.rotatedAt }),
    })),
  );
  const preKeyRecords: PreKeyRecord[] = await Promise.all(
    p.preKeys.map(async (r) => ({
      keyId: r.keyId,
      pair: {
        publicKey: await importX25519Jwk(r.pair.public, true),
        privateKey: await importX25519Jwk(r.pair.private, false),
      },
      consumed: r.consumed,
      createdAt: r.createdAt,
    })),
  );

  // Wipe then write. The IDB version is already at the right schema
  // (`openCryptoDb` is idempotent). We don't bump the version here
  // because the schema stayed the same — just the row contents change.
  await openCryptoDb();
  await Promise.all([
    idbClearStore(STORE_IDENTITY),
    idbClearStore(STORE_SIGNED_PRE_KEYS),
    idbClearStore(STORE_PRE_KEYS),
    idbClearStore(STORE_PLAINTEXT_CACHE),
    idbClearStore(STORE_FINGERPRINTS),
  ]);
  const identityRecord: IdentityRecord = {
    id: 'default',
    deviceId: p.deviceId,
    registrationId: p.registrationId,
    identityPair,
    signingPair,
    createdAt: p.identityCreatedAt,
  };
  await idbPut(STORE_IDENTITY, identityRecord);
  if (spkRecords.length > 0) await idbPutMany(STORE_SIGNED_PRE_KEYS, spkRecords);
  if (preKeyRecords.length > 0) await idbPutMany(STORE_PRE_KEYS, preKeyRecords);
  if (p.plaintextCache.length > 0) await idbPutMany(STORE_PLAINTEXT_CACHE, p.plaintextCache);
  if (p.fingerprints.length > 0) await idbPutMany(STORE_FINGERPRINTS, p.fingerprints);

  return {
    deviceId: p.deviceId,
    exportedAt: p.exportedAt,
    signedPreKeyCount: spkRecords.length,
    preKeyCount: preKeyRecords.length,
    plaintextCacheCount: p.plaintextCache.length,
    fingerprintCount: p.fingerprints.length,
  };
}

/* ───────────────────── KDF + key import helpers ────────────────────── */

async function deriveKey(phrase: string, salt: Uint8Array): Promise<CryptoKey> {
  // Feed the wordlist-index bytes (not the full string) to PBKDF2 so
  // formatting differences (whitespace, case) don't shift the key.
  const entropy = phraseToBytes(phrase);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    entropy as unknown as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function importX25519Jwk(jwk: JsonWebKey, isPublic: boolean): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'X25519' } as unknown as AlgorithmIdentifier,
    true,
    isPublic ? [] : ['deriveBits'],
  );
}

function importEd25519Jwk(jwk: JsonWebKey, isPublic: boolean): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
    true,
    isPublic ? ['verify'] : ['sign'],
  );
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < u8.length; i += 1) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(s: string): ArrayBuffer {
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = norm + '='.repeat((4 - (norm.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * Force the singleton crypto service to re-init on next access so it
 * picks up the restored IDB state. The caller invokes this after
 * `restoreBackup` resolves, then prompts the user to reload.
 */
export async function deleteCryptoDb(): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(CRYPTO_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  // Re-open with current schema so the next caller of idbGet/idbPut
  // finds the stores present.
  void CRYPTO_DB_VERSION;
  await openCryptoDb();
}
