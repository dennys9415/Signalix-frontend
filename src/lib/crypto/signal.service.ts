// Signalix v0.9.1 — Signal-Protocol-style E2EE beta for direct text messages.
//
// Real cryptography. Not production-grade. Specifically:
//   • X25519 ECDH between sender's ephemeral keypair and recipient's signed
//     pre-key + (optionally) one-time pre-key. AES-256-GCM under HKDF-SHA256.
//   • Ed25519 signs each signed pre-key on publish, and **the recipient
//     bundle's Ed25519 signature is now verified before any ECDH happens**
//     (v0.9.1 hardening). A bundle that fails verification is rejected
//     and `encryptForRecipient` throws — no fallback.
//   • Single-device assumption: when a recipient has multiple devices the
//     bundle picks the first one returned. Multi-device fan-out is v0.10.0.
//   • No Double Ratchet — one ephemeral keypair per message, no chain
//     keys. Forward secrecy is bounded by signed-pre-key rotation cadence.
//   • One-time pre-keys ARE consumed locally in v0.9.1: after a successful
//     decrypt that used `preKeyId`, the row is marked consumed and the
//     pool auto-tops back to ~100 when it dips below the watermark.
//
// Sender-side history is supported by `plaintext-cache.ts`: we cache the
// plaintext after each successful encrypt, keyed by messageId once the
// server confirms via MESSAGE_SENT. chat.store wires this up.

import { getKeyBundle, registerDeviceKeys, uploadPreKeys } from '../api-client';
import {
  STORE_FINGERPRINTS,
  STORE_IDENTITY,
  STORE_PLAINTEXT_CACHE,
  STORE_PRE_KEYS,
  STORE_SIGNED_PRE_KEYS,
  idbClearStore,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
  idbPutMany,
  type IdentityRecord,
  type PreKeyRecord,
  type SignedPreKeyRecord,
} from './db';
import type { CryptoService, DeviceKeyBundleDTO, EncryptedEnvelope } from './crypto.types';
import {
  cacheSafetyNumber,
  computeSafetyNumber,
  lookupSafetyNumber,
} from './fingerprints';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  concatBytes,
  hkdfAesKey,
  importX25519Public,
  randomRegistrationId,
  verifyEd25519Signature,
} from './utils';

// Tunables — kept conservative for the v0.9.x beta.
const INITIAL_PRE_KEY_COUNT = 100;
const PRE_KEY_TARGET_COUNT = 100;
const PRE_KEY_LOW_WATERMARK = 20;
const PRE_KEY_TOPUP_FLOOR = 80;
const HKDF_INFO = 'signalix-v1-direct-text';

// Wire-format byte sizes for X25519 (raw) and Ed25519 (raw / signature).
const X25519_RAW_BYTES = 32;
const ED25519_RAW_BYTES = 32;
const ED25519_SIG_BYTES = 64;

/** Sentinel ciphertext rendered when decryption can't recover the plaintext. */
export const DECRYPT_FAILED_PLACEHOLDER = '[Unable to decrypt message]';

interface EnvelopeBlob {
  v: 1;
  /** Ciphertext + auth tag (AES-GCM). base64url. */
  c: string;
  /** 12-byte IV. base64url. */
  iv: string;
  /** Sender's ephemeral X25519 public key (32 bytes). base64url. */
  eph: string;
}

export class SignalCryptoService implements CryptoService {
  private ready = false;
  private deviceId: string | null = null;
  private initPromise: Promise<void> | null = null;
  /** v0.9.1 — true when init detected a corrupt/partial local state and reset. */
  wasReset = false;

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Idempotent. Generates + publishes keys on first call for this device;
   * subsequent calls just load the existing local identity and top up the
   * one-time pre-key pool if it has dipped below the watermark.
   */
  async init(opts: { deviceId: string }): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.deviceId = opts.deviceId;
    this.initPromise = this.doInit().finally(() => {
      // Leave initPromise in place — subsequent callers just await the same
      // resolved promise without re-running the work.
    });
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      throw new Error('SignalCryptoService requires a browser environment');
    }
    const deviceId = this.deviceId!;

    const existing = await idbGet<IdentityRecord>(STORE_IDENTITY, 'default');
    const spkRows = await idbGetAll<SignedPreKeyRecord>(STORE_SIGNED_PRE_KEYS);
    const preKeyRows = await idbGetAll<PreKeyRecord>(STORE_PRE_KEYS);

    const sameDevice = existing && existing.deviceId === deviceId;
    // v0.9.1: detect a torn-down or partially-populated IDB. If we have
    // an identity record but no signed pre-key (or zero unconsumed pre-keys
    // *and* zero archived pre-keys), the local state can't decrypt or
    // encrypt — regenerate from scratch and mark `wasReset` so the UI
    // can surface a one-time banner.
    const partial = sameDevice && (spkRows.length === 0 || preKeyRows.length === 0);

    if (!existing || !sameDevice || partial) {
      if (existing && (!sameDevice || partial)) {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn(
            '[signalix-crypto] local crypto state reset',
            { sameDevice, hadSpk: spkRows.length > 0, hadPreKeys: preKeyRows.length > 0 },
          );
        }
        await this.wipeLocalState();
        this.wasReset = true;
      }
      await this.generateAndPublish(deviceId);
    } else {
      const unconsumed = preKeyRows.filter((p) => !p.consumed).length;
      if (unconsumed < PRE_KEY_LOW_WATERMARK) {
        await this.topUpPreKeys(unconsumed);
      }
    }

    this.ready = true;
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info(
        '[signalix-crypto] Signal service ready (v0.9.1 hardening — direct-text E2EE)',
        { wasReset: this.wasReset },
      );
    }
  }

  private async wipeLocalState(): Promise<void> {
    // Clear every crypto-only store before regenerating. The plaintext
    // cache is included on purpose: envelopes that referenced the old
    // SPK can no longer be decrypted, so cached rows for them are now
    // unreachable. Fingerprints are also rebuilt since our identity
    // public key just changed.
    await Promise.all([
      idbDelete(STORE_IDENTITY, 'default'),
      idbClearStore(STORE_SIGNED_PRE_KEYS),
      idbClearStore(STORE_PRE_KEYS),
      idbClearStore(STORE_PLAINTEXT_CACHE),
      idbClearStore(STORE_FINGERPRINTS),
    ]);
  }

  private async generateAndPublish(deviceId: string): Promise<void> {
    const registrationId = randomRegistrationId();

    const identityPair = (await crypto.subtle.generateKey(
      { name: 'X25519' } as unknown as AlgorithmIdentifier,
      true,
      ['deriveBits'],
    )) as CryptoKeyPair;
    const signingPair = (await crypto.subtle.generateKey(
      { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;

    // Signed pre-key + signature.
    const spkPair = (await crypto.subtle.generateKey(
      { name: 'X25519' } as unknown as AlgorithmIdentifier,
      true,
      ['deriveBits'],
    )) as CryptoKeyPair;
    const spkPubRaw = await crypto.subtle.exportKey('raw', spkPair.publicKey);
    const spkSig = await crypto.subtle.sign(
      'Ed25519',
      signingPair.privateKey,
      spkPubRaw,
    );
    // 31-bit positive int — safely fits PostgreSQL INTEGER.
    const spkKeyId = randomKeyId();

    const preKeyPairs = await this.generatePreKeyBatch(INITIAL_PRE_KEY_COUNT);

    // Persist locally first — if the API call fails we still want to be
    // able to retry publish on the next init without regenerating.
    const identityRecord: IdentityRecord = {
      id: 'default',
      deviceId,
      registrationId,
      identityPair,
      signingPair,
      createdAt: new Date().toISOString(),
    };
    const spkRecord: SignedPreKeyRecord = {
      keyId: spkKeyId,
      pair: spkPair,
      signature: spkSig,
      createdAt: new Date().toISOString(),
    };
    await idbPut(STORE_IDENTITY, identityRecord);
    await idbPut(STORE_SIGNED_PRE_KEYS, spkRecord);
    await idbPutMany(
      STORE_PRE_KEYS,
      preKeyPairs.map<PreKeyRecord>((p) => ({
        keyId: p.keyId,
        pair: p.pair,
        consumed: false,
        createdAt: new Date().toISOString(),
      })),
    );

    // Now publish public material.
    const identityPubRaw = await crypto.subtle.exportKey('raw', identityPair.publicKey);
    const signingPubRaw = await crypto.subtle.exportKey('raw', signingPair.publicKey);
    const preKeysPublic = await Promise.all(
      preKeyPairs.map(async (p) => ({
        keyId: p.keyId,
        publicKey: bytesToBase64Url(await crypto.subtle.exportKey('raw', p.pair.publicKey)),
        algorithm: 'x25519' as const,
      })),
    );

    await registerDeviceKeys({
      registrationId,
      identityKey: bytesToBase64Url(identityPubRaw),
      signingKey: bytesToBase64Url(signingPubRaw),
      signedPreKey: {
        keyId: spkKeyId,
        publicKey: bytesToBase64Url(spkPubRaw),
        signature: bytesToBase64Url(spkSig),
        algorithm: 'x25519',
      },
      preKeys: preKeysPublic,
      algorithm: 'x25519',
    });
  }

  private async generatePreKeyBatch(
    count: number,
  ): Promise<Array<{ keyId: number; pair: CryptoKeyPair }>> {
    const out: Array<{ keyId: number; pair: CryptoKeyPair }> = [];
    for (let i = 0; i < count; i += 1) {
      const pair = (await crypto.subtle.generateKey(
        { name: 'X25519' } as unknown as AlgorithmIdentifier,
        true,
        ['deriveBits'],
      )) as CryptoKeyPair;
      // Random 31-bit positive — avoids collisions if we ever multi-device.
      out.push({ keyId: randomKeyId(), pair });
    }
    return out;
  }

  private async topUpPreKeys(currentUnconsumed: number): Promise<void> {
    const target = Math.max(PRE_KEY_TARGET_COUNT, PRE_KEY_TOPUP_FLOOR);
    const need = target - currentUnconsumed;
    if (need <= 0) return;
    const fresh = await this.generatePreKeyBatch(need);
    await idbPutMany(
      STORE_PRE_KEYS,
      fresh.map<PreKeyRecord>((p) => ({
        keyId: p.keyId,
        pair: p.pair,
        consumed: false,
        createdAt: new Date().toISOString(),
      })),
    );
    const dto = await Promise.all(
      fresh.map(async (p) => ({
        keyId: p.keyId,
        publicKey: bytesToBase64Url(await crypto.subtle.exportKey('raw', p.pair.publicKey)),
        algorithm: 'x25519' as const,
      })),
    );
    try {
      await uploadPreKeys({ preKeys: dto, algorithm: 'x25519' });
    } catch {
      // Local copy still useful even if server upload failed; retry on next init.
    }
  }

  async encryptForRecipient(
    plaintext: string,
    recipient: { chatId?: string; recipientUsername?: string; recipientUserId?: string },
  ): Promise<EncryptedEnvelope> {
    if (!this.ready) {
      throw new Error('Crypto service not initialized');
    }
    if (!recipient.recipientUserId) {
      throw new Error('recipientUserId is required for v0.9.x E2EE encryption');
    }

    const bundleResponse = await getKeyBundle(recipient.recipientUserId);
    // v0.9.x beta: single-device — pick the first bundle. v0.10.0 will
    // fan out to every bundle.
    const bundle = bundleResponse.bundles[0] as DeviceKeyBundleDTO | undefined;
    if (!bundle) {
      throw new Error('Recipient has no published key bundle');
    }

    // v0.9.1 hardening: validate every byte we're about to derive from
    // *before* touching crypto.subtle. A corrupted or attacker-supplied
    // bundle gets rejected with a clear error rather than producing
    // unreadable ciphertext.
    await assertBundleIsValid(bundle);

    // Compute / cache the per-peer safety number using the freshly
    // validated peer identity. Best-effort: a failure here must not
    // block sending the message.
    void this.maybeCacheSafetyNumber(recipient.recipientUserId, bundle.identityKey);

    const recipSpkPub = await importX25519Public(base64UrlToBytes(bundle.signedPreKey.publicKey));
    const recipPreKeyPub = bundle.preKey
      ? await importX25519Public(base64UrlToBytes(bundle.preKey.publicKey))
      : null;

    // Ephemeral keypair — fresh per message. v0.10.0 will rotate this
    // via the Double Ratchet rather than discarding it after one use.
    const ephPair = (await crypto.subtle.generateKey(
      { name: 'X25519' } as unknown as AlgorithmIdentifier,
      true,
      ['deriveBits'],
    )) as CryptoKeyPair;

    const dh1 = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'X25519', public: recipSpkPub } as unknown as AlgorithmIdentifier,
        ephPair.privateKey,
        256,
      ),
    );
    let ikm = dh1;
    if (recipPreKeyPub) {
      const dh2 = new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: 'X25519', public: recipPreKeyPub } as unknown as AlgorithmIdentifier,
          ephPair.privateKey,
          256,
        ),
      );
      ikm = concatBytes(dh1, dh2);
    }

    const aesKey = await hkdfAesKey(ikm, HKDF_INFO);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ctBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(plaintext),
    );
    const ephPubRaw = await crypto.subtle.exportKey('raw', ephPair.publicKey);

    const envelope: EnvelopeBlob = {
      v: 1,
      c: bytesToBase64Url(new Uint8Array(ctBuf)),
      iv: bytesToBase64Url(iv),
      eph: bytesToBase64Url(new Uint8Array(ephPubRaw)),
    };

    return {
      ciphertext: JSON.stringify(envelope),
      encryptionVersion: 1,
      senderDeviceId: this.deviceId ?? undefined,
      recipientDeviceId: bundle.deviceId,
      ...(bundle.preKey && { preKeyId: bundle.preKey.keyId }),
      signedPreKeyId: bundle.signedPreKey.keyId,
    };
  }

  async decryptIncoming(envelope: {
    ciphertext: string;
    encryptionVersion?: number;
    senderDeviceId?: string;
    preKeyId?: number;
    signedPreKeyId?: number;
  }): Promise<string> {
    if (!envelope.encryptionVersion || envelope.encryptionVersion === 0) {
      return envelope.ciphertext;
    }
    if (envelope.encryptionVersion !== 1) {
      throw new Error(`Unsupported encryption version ${envelope.encryptionVersion}`);
    }
    if (envelope.signedPreKeyId === undefined) {
      throw new Error('Missing signedPreKeyId on envelope');
    }

    // If a fresh login is still publishing keys, MESSAGE_NEW can arrive
    // before IndexedDB has them. Wait on the in-flight init promise so
    // the lookups below find what they need. We don't auto-init here —
    // a caller that never invoked init() should still surface "no keys"
    // rather than silently bootstrap a stranger's device.
    if (this.initPromise) {
      try { await this.initPromise; } catch { /* fall through; lookups will fail loudly */ }
    }

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] decrypt attempt', {
        version: envelope.encryptionVersion,
        signedPreKeyId: envelope.signedPreKeyId,
        preKeyId: envelope.preKeyId,
      });
    }

    let parsed: EnvelopeBlob;
    try {
      parsed = JSON.parse(envelope.ciphertext) as EnvelopeBlob;
    } catch {
      throw new Error('Malformed E2EE envelope');
    }
    if (parsed.v !== 1) throw new Error(`Unsupported envelope version ${parsed.v}`);

    const spk = await idbGet<SignedPreKeyRecord>(STORE_SIGNED_PRE_KEYS, envelope.signedPreKeyId);
    if (!spk) {
      throw new Error(`Local signed pre-key ${envelope.signedPreKeyId} not found`);
    }
    let preKey: PreKeyRecord | undefined;
    if (envelope.preKeyId !== undefined) {
      preKey = await idbGet<PreKeyRecord>(STORE_PRE_KEYS, envelope.preKeyId);
      if (!preKey) {
        throw new Error(`Local one-time pre-key ${envelope.preKeyId} not found`);
      }
    }

    const ephPub = await importX25519Public(base64UrlToBytes(parsed.eph));

    const dh1 = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'X25519', public: ephPub } as unknown as AlgorithmIdentifier,
        spk.pair.privateKey,
        256,
      ),
    );
    let ikm = dh1;
    if (preKey) {
      const dh2 = new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: 'X25519', public: ephPub } as unknown as AlgorithmIdentifier,
          preKey.pair.privateKey,
          256,
        ),
      );
      ikm = concatBytes(dh1, dh2);
    }

    const aesKey = await hkdfAesKey(ikm, HKDF_INFO);
    const ptBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlToBytes(parsed.iv) },
      aesKey,
      base64UrlToBytes(parsed.c),
    );
    const plaintext = new TextDecoder().decode(ptBuf);

    // v0.9.1: mark the one-time pre-key consumed locally (it was already
    // marked consumed server-side at bundle hand-out time, but mirroring
    // here lets the local top-up math stay accurate and prevents future
    // reuse if the same envelope is replayed). Then trigger top-up if
    // the unconsumed pool dipped below the watermark.
    if (preKey && !preKey.consumed) {
      preKey.consumed = true;
      try {
        await idbPut<PreKeyRecord>(STORE_PRE_KEYS, preKey);
      } catch {
        // Best-effort — the worst case is we re-mark on next decrypt.
      }
      void this.maybeTopUpAfterConsume();
    }

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] decrypt success');
    }
    return plaintext;
  }

  async getSafetyNumber(peerUserId: string): Promise<string | null> {
    try {
      const cached = await lookupSafetyNumber(peerUserId);
      if (cached) return cached.safetyNumber;

      // No cache — fetch the peer's bundle, validate it, then compute.
      const bundleResponse = await getKeyBundle(peerUserId);
      const bundle = bundleResponse.bundles[0];
      if (!bundle) return null;
      await assertBundleIsValid(bundle);
      await this.maybeCacheSafetyNumber(peerUserId, bundle.identityKey);
      const stored = await lookupSafetyNumber(peerUserId);
      return stored?.safetyNumber ?? null;
    } catch {
      return null;
    }
  }

  private async maybeCacheSafetyNumber(peerUserId: string, peerIdentityKeyB64: string): Promise<void> {
    try {
      const identity = await idbGet<IdentityRecord>(STORE_IDENTITY, 'default');
      if (!identity) return;
      const localIdentityRaw = new Uint8Array(
        await crypto.subtle.exportKey('raw', identity.identityPair.publicKey),
      );
      const localIdentityB64 = bytesToBase64Url(localIdentityRaw);
      const existing = await lookupSafetyNumber(peerUserId);
      if (
        existing
        && existing.localIdentityKey === localIdentityB64
        && existing.peerIdentityKey === peerIdentityKeyB64
      ) {
        return; // nothing changed
      }
      const peerRaw = base64UrlToBytes(peerIdentityKeyB64);
      const safetyNumber = await computeSafetyNumber(localIdentityRaw, peerRaw);
      await cacheSafetyNumber({
        peerUserId,
        localIdentityKey: localIdentityB64,
        peerIdentityKey: peerIdentityKeyB64,
        safetyNumber,
      });
    } catch {
      // best-effort
    }
  }

  private async maybeTopUpAfterConsume(): Promise<void> {
    try {
      const all = await idbGetAll<PreKeyRecord>(STORE_PRE_KEYS);
      const unconsumed = all.filter((p) => !p.consumed).length;
      if (unconsumed < PRE_KEY_LOW_WATERMARK) {
        await this.topUpPreKeys(unconsumed);
      }
    } catch {
      // best-effort
    }
  }
}

/**
 * Validate a recipient bundle structurally and cryptographically. Throws
 * a descriptive Error on the first problem. v0.9.1 hardening — callers
 * MUST run this before deriving any ECDH material from the bundle.
 */
async function assertBundleIsValid(bundle: DeviceKeyBundleDTO): Promise<void> {
  if (!bundle.identityKey || !bundle.signingKey || !bundle.signedPreKey) {
    throw new Error('Recipient bundle is missing required fields');
  }
  if (
    typeof bundle.signedPreKey.keyId !== 'number'
    || bundle.signedPreKey.keyId < 0
    || !Number.isFinite(bundle.signedPreKey.keyId)
  ) {
    throw new Error('Recipient bundle has an invalid signedPreKey.keyId');
  }
  let identityRaw: Uint8Array;
  let signingRaw: Uint8Array;
  let spkRaw: Uint8Array;
  let sigRaw: Uint8Array;
  try {
    identityRaw = base64UrlToBytes(bundle.identityKey);
    signingRaw = base64UrlToBytes(bundle.signingKey);
    spkRaw = base64UrlToBytes(bundle.signedPreKey.publicKey);
    sigRaw = base64UrlToBytes(bundle.signedPreKey.signature);
  } catch {
    throw new Error('Recipient bundle has malformed base64url material');
  }
  if (identityRaw.length !== X25519_RAW_BYTES) {
    throw new Error(`Recipient identityKey has wrong byte length ${identityRaw.length}`);
  }
  if (signingRaw.length !== ED25519_RAW_BYTES) {
    throw new Error(`Recipient signingKey has wrong byte length ${signingRaw.length}`);
  }
  if (spkRaw.length !== X25519_RAW_BYTES) {
    throw new Error(`Recipient signedPreKey.publicKey has wrong byte length ${spkRaw.length}`);
  }
  if (sigRaw.length !== ED25519_SIG_BYTES) {
    throw new Error(`Recipient signedPreKey.signature has wrong byte length ${sigRaw.length}`);
  }
  if (bundle.preKey) {
    let preKeyRaw: Uint8Array;
    try {
      preKeyRaw = base64UrlToBytes(bundle.preKey.publicKey);
    } catch {
      throw new Error('Recipient bundle has malformed preKey.publicKey');
    }
    if (preKeyRaw.length !== X25519_RAW_BYTES) {
      throw new Error(`Recipient preKey.publicKey has wrong byte length ${preKeyRaw.length}`);
    }
    if (typeof bundle.preKey.keyId !== 'number' || bundle.preKey.keyId < 0) {
      throw new Error('Recipient preKey.keyId is invalid');
    }
  }

  const sigOk = await verifyEd25519Signature(signingRaw, sigRaw, spkRaw);
  if (!sigOk) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(
        '[signalix-crypto] signed pre-key signature did NOT verify',
        { deviceId: bundle.deviceId, signedPreKeyId: bundle.signedPreKey.keyId },
      );
    }
    throw new Error('Recipient signed pre-key signature failed verification');
  }
}

/**
 * Random 31-bit unsigned int. Fits PostgreSQL `INTEGER` (signed 32-bit)
 * and is high-entropy enough for our pre-key id namespace (single-device,
 * one user) where collisions are extremely unlikely.
 */
function randomKeyId(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] & 0x7fffffff;
}
