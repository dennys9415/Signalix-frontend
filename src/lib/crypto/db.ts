// Minimal IndexedDB wrapper for the v0.9.0 crypto layer.
//
// Stores:
//   identity         (keyPath 'id')    — the single 'default' record holds
//                                         this device's X25519 identity keypair
//                                         plus Ed25519 signing keypair plus
//                                         registration_id + deviceId.
//   signed-pre-keys  (keyPath 'keyId') — one row per signed pre-key. Old
//                                         rows are kept (with rotatedAt set)
//                                         so late handshakes referencing
//                                         them still decrypt.
//   pre-keys         (keyPath 'keyId') — one row per one-time pre-key.
//                                         v0.9.0 keeps them around after
//                                         decryption — proper deletion lands
//                                         with the Double Ratchet in v0.10.
//   plaintext-cache  (keyPath 'messageId') — locally-cached plaintext for
//                                            every direct text message we've
//                                            encrypted (as sender) or
//                                            successfully decrypted (as
//                                            recipient). The displayed text
//                                            is always sourced from this
//                                            cache on history reload.
//
// CryptoKey instances are storable via structured clone in modern browsers,
// so we keep private keys as live CryptoKey objects rather than re-importing
// raw bytes on every operation. This requires that callers preserve the
// `pair` object reference (KeyPair).

export const CRYPTO_DB_NAME = 'signalix-crypto-v1';
export const CRYPTO_DB_VERSION = 1;

export const STORE_IDENTITY = 'identity';
export const STORE_SIGNED_PRE_KEYS = 'signed-pre-keys';
export const STORE_PRE_KEYS = 'pre-keys';
export const STORE_PLAINTEXT_CACHE = 'plaintext-cache';

export interface IdentityRecord {
  id: 'default';
  deviceId: string;
  registrationId: number;
  identityPair: CryptoKeyPair;
  signingPair: CryptoKeyPair;
  createdAt: string;
}

export interface SignedPreKeyRecord {
  keyId: number;
  pair: CryptoKeyPair;
  signature: ArrayBuffer;
  createdAt: string;
  rotatedAt?: string;
}

export interface PreKeyRecord {
  keyId: number;
  pair: CryptoKeyPair;
  consumed: boolean;
  createdAt: string;
}

export interface PlaintextCacheRecord {
  messageId: string;
  chatId: string;
  plaintext: string;
  cachedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openCryptoDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(CRYPTO_DB_NAME, CRYPTO_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_IDENTITY)) {
          db.createObjectStore(STORE_IDENTITY, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SIGNED_PRE_KEYS)) {
          db.createObjectStore(STORE_SIGNED_PRE_KEYS, { keyPath: 'keyId' });
        }
        if (!db.objectStoreNames.contains(STORE_PRE_KEYS)) {
          db.createObjectStore(STORE_PRE_KEYS, { keyPath: 'keyId' });
        }
        if (!db.objectStoreNames.contains(STORE_PLAINTEXT_CACHE)) {
          db.createObjectStore(STORE_PLAINTEXT_CACHE, { keyPath: 'messageId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openCryptoDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPut<T>(store: string, value: T): Promise<void> {
  const db = await openCryptoDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbPutMany<T>(store: string, values: T[]): Promise<void> {
  const db = await openCryptoDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const v of values) os.put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbCount(store: string): Promise<number> {
  const db = await openCryptoDb();
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** All records in `store`. Useful for debug / top-up math. */
export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openCryptoDb();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}
