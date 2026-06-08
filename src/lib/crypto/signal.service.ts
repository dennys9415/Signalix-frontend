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
import { clearDecryptFailureCache } from './plaintext-cache';
import type { CryptoService, DeviceKeyBundleDTO, EncryptedEnvelope } from './crypto.types';
import {
  cacheSafetyNumber,
  computeSafetyNumber,
  deriveVerificationStatus,
  lookupSafetyNumber,
  markPeerVerified,
  unmarkPeerVerified,
  type VerificationStatus,
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

// [signalix-crypto] diagnostic logs are dev-only. We route through this
// runtime constant rather than a raw `process.env.NODE_ENV !== 'production'`
// check at each call site so the gate can be temporarily flipped to
// `true` from a single location when debugging a prod-only issue —
// without that indirection, Next.js inlines `process.env.NODE_ENV` and
// DCEs every branch, leaving no way to surface the logs without a code
// edit at every site.
const CRYPTO_DEBUG_LOGS = process.env.NODE_ENV !== 'production';

/** Sentinel ciphertext rendered when decryption can't recover the plaintext. */
export const DECRYPT_FAILED_PLACEHOLDER = '[Unable to decrypt message]';

/**
 * v0.11.0 — sentinel for failed media decryption. Replaces the metadata
 * JSON in `ciphertext` when an IMAGE / FILE / AUDIO message can't be
 * decrypted. MessageView's attachment renderers check for this exact
 * string and fall back to a "broken attachment" tile instead of trying
 * to parse it as JSON.
 */
export const DECRYPT_FAILED_ATTACHMENT_PLACEHOLDER = '[Unable to decrypt attachment]';

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

    // Brave / private-mode / Shields diagnostics. We don't refuse to run if
    // anything looks fishy — the symptoms surface naturally via the regular
    // error paths — but the dev console gets a clear breadcrumb.
    if (CRYPTO_DEBUG_LOGS) {
      const cryptoOk = typeof crypto !== 'undefined' && !!crypto.subtle;
      const idbOk = typeof indexedDB !== 'undefined';
      const isBrave = typeof navigator !== 'undefined'
        && typeof (navigator as { brave?: { isBrave?: () => Promise<boolean> } }).brave?.isBrave === 'function';
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] env probe', {
        deviceId,
        cryptoSubtleAvailable: cryptoOk,
        indexedDbAvailable: idbOk,
        isBraveDetected: isBrave,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '(no navigator)',
      });
    }

    // v0.10.1 hotfix — force a one-time wipe + re-register per device after
    // deploy so the server-side reset-wipe path (in registerDeviceKeys)
    // actually fires. Without this, a device whose IDB was wiped under
    // v0.9.1 but never re-wiped since the v0.10.0 API fix landed will
    // keep its orphaned server-side pre-keys, and `getKeyBundle` will
    // keep handing them out → recipients see "Local one-time pre-key X
    // not found". Plaintext-cache is preserved so sender history isn't
    // lost; identity / SPKs / one-time pre-keys / fingerprints reset.
    const NEEDS_FORCED_CLEANUP_FLAG = 'signalix-stale-prekey-cleanup-v1';
    const alreadyCleanedUp = typeof localStorage !== 'undefined'
      && localStorage.getItem(NEEDS_FORCED_CLEANUP_FLAG) === 'done';

    let existing = await idbGet<IdentityRecord>(STORE_IDENTITY, 'default');
    let spkRows = await idbGetAll<SignedPreKeyRecord>(STORE_SIGNED_PRE_KEYS);
    let preKeyRows = await idbGetAll<PreKeyRecord>(STORE_PRE_KEYS);

    if (existing && !alreadyCleanedUp) {
      if (CRYPTO_DEBUG_LOGS) {
        // eslint-disable-next-line no-console
        console.warn(
          '[signalix-crypto] one-time stale pre-key cleanup — wiping local identity/SPKs/pre-keys and re-registering so the server drops orphaned rows from prior resets',
          {
            deviceId,
            priorIdentityCreatedAt: existing.createdAt,
            priorSpkCount: spkRows.length,
            priorPreKeyCount: preKeyRows.length,
          },
        );
      }
      await this.wipeStaleCryptoState();
      this.wasReset = true;
      existing = undefined;
      spkRows = [];
      preKeyRows = [];
    }

    const sameDevice = existing && existing.deviceId === deviceId;
    // v0.9.1: detect a torn-down or partially-populated IDB. If we have
    // an identity record but no signed pre-key (or zero unconsumed pre-keys
    // *and* zero archived pre-keys), the local state can't decrypt or
    // encrypt — regenerate from scratch and mark `wasReset` so the UI
    // can surface a one-time banner.
    const partial = sameDevice && (spkRows.length === 0 || preKeyRows.length === 0);

    if (!existing || !sameDevice || partial) {
      if (existing && (!sameDevice || partial)) {
        if (CRYPTO_DEBUG_LOGS) {
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

    // Mark the cleanup as completed *after* generateAndPublish succeeded.
    // If publish fails the flag stays unset → next page load retries.
    if (!alreadyCleanedUp && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(NEEDS_FORCED_CLEANUP_FLAG, 'done');
      } catch {
        // Private mode / quota — best-effort. Worst case is another
        // cleanup on the next load, which is idempotent.
      }
    }

    // Clear any cached decrypt failures from past sessions. Init success
    // means the local crypto state is consistent now; messages that
    // failed during an earlier transient condition (init race, the
    // v0.9.0 envelope-drop bug, a key-reset wipe) deserve one retry per
    // session. A genuinely broken message will be re-cached this session
    // and short-circuit subsequent renders until the next page load.
    try {
      const cleared = await clearDecryptFailureCache();
      if (cleared > 0 && CRYPTO_DEBUG_LOGS) {
        // eslint-disable-next-line no-console
        console.info(`[signalix-crypto] cleared ${cleared} stale decrypt-failure cache entries`);
      }
    } catch {
      // best-effort
    }

    this.ready = true;
    if (CRYPTO_DEBUG_LOGS) {
      // eslint-disable-next-line no-console
      console.info(
        '[signalix-crypto] Signal service ready (v0.10.0 group beta — direct + group text E2EE)',
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

  /**
   * v0.10.1 forced-cleanup variant of `wipeLocalState`. Same as the
   * regular wipe but **keeps the plaintext cache** — the sender's view
   * of their own past messages survives the cleanup. Used only for the
   * one-time deploy-triggered cleanup that purges orphan server-side
   * pre-keys; ordinary reset detection still uses `wipeLocalState`.
   */
  private async wipeStaleCryptoState(): Promise<void> {
    await Promise.all([
      idbDelete(STORE_IDENTITY, 'default'),
      idbClearStore(STORE_SIGNED_PRE_KEYS),
      idbClearStore(STORE_PRE_KEYS),
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

    if (CRYPTO_DEBUG_LOGS) {
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] registering device keys', {
        deviceId,
        signedPreKeyId: spkKeyId,
        preKeyIds: preKeysPublic.map((p) => p.keyId),
        preKeyCount: preKeysPublic.length,
      });
    }
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
    if (CRYPTO_DEBUG_LOGS) {
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] uploading pre-keys (top-up)', {
        deviceId: this.deviceId,
        addedKeyIds: dto.map((p) => p.keyId),
        addedCount: dto.length,
        priorUnconsumed: currentUnconsumed,
      });
    }
    try {
      await uploadPreKeys({ preKeys: dto, algorithm: 'x25519' });
    } catch (err) {
      if (CRYPTO_DEBUG_LOGS) {
        // eslint-disable-next-line no-console
        console.warn('[signalix-crypto] pre-key upload failed (local copy retained for retry)', err);
      }
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
      throw new Error('recipientUserId is required for E2EE encryption');
    }

    const bundleResponse = await getKeyBundle(recipient.recipientUserId);
    const bundle = bundleResponse.bundles[0] as DeviceKeyBundleDTO | undefined;
    if (!bundle) {
      throw new Error('Recipient has no published key bundle');
    }
    if (CRYPTO_DEBUG_LOGS) {
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] encryptForRecipient (single-device legacy path)', {
        recipientUserId: recipient.recipientUserId,
        totalBundles: bundleResponse.bundles.length,
        selectedDeviceId: bundle.deviceId,
        allDeviceIds: bundleResponse.bundles.map((b) => b.deviceId),
      });
    }
    void this.maybeCacheSafetyNumber(recipient.recipientUserId, bundle.identityKey);
    return this.encryptToBundle(plaintext, bundle);
  }

  /**
   * v0.10.0 fix — encrypt the same plaintext separately for every device
   * the recipient has published a bundle for. Direct messages that
   * previously picked `bundles[0]` only reached one of the recipient's
   * devices; logging in on a second browser (Brave + Chrome, mobile +
   * desktop) used to leave one device permanently undecryptable. This
   * helper returns N envelopes, one per device. Caller ships them as
   * `recipients[]` on the WS frame.
   */
  async encryptForUserAllDevices(
    plaintext: string,
    recipientUserId: string,
  ): Promise<EncryptedEnvelope[]> {
    if (!this.ready) {
      throw new Error('Crypto service not initialized');
    }
    const bundleResponse = await getKeyBundle(recipientUserId);
    if (bundleResponse.bundles.length === 0) {
      throw new Error('Recipient has no published key bundle');
    }
    if (CRYPTO_DEBUG_LOGS) {
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] encryptForUserAllDevices', {
        recipientUserId,
        totalBundles: bundleResponse.bundles.length,
        allDeviceIds: bundleResponse.bundles.map((b) => b.deviceId),
      });
    }
    // Cache safety number against the identity from the first bundle —
    // identity is per-user and stable across that user's devices in v0.10.0
    // (each device generates its own identity, but we only display one
    // fingerprint per peer for now). v0.11.0+ will revisit this.
    void this.maybeCacheSafetyNumber(recipientUserId, bundleResponse.bundles[0].identityKey);

    const out: EncryptedEnvelope[] = [];
    for (const bundle of bundleResponse.bundles) {
      out.push(await this.encryptToBundle(plaintext, bundle));
    }
    return out;
  }

  /**
   * Encrypt `plaintext` to a single recipient device bundle. Validates
   * the bundle (signature + sizes) before any ECDH derivation; throws on
   * malformed input. Shared between the legacy single-device path
   * (`encryptForRecipient`) and the multi-device fan-out
   * (`encryptForUserAllDevices`).
   */
  private async encryptToBundle(
    plaintext: string,
    bundle: DeviceKeyBundleDTO,
  ): Promise<EncryptedEnvelope> {
    await assertBundleIsValid(bundle);

    if (CRYPTO_DEBUG_LOGS) {
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] preKey selected by sender', {
        recipientDeviceId: bundle.deviceId,
        signedPreKeyId: bundle.signedPreKey.keyId,
        preKeyId: bundle.preKey?.keyId ?? null,
      });
    }

    const recipSpkPub = await importX25519Public(base64UrlToBytes(bundle.signedPreKey.publicKey));
    const recipPreKeyPub = bundle.preKey
      ? await importX25519Public(base64UrlToBytes(bundle.preKey.publicKey))
      : null;

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
    recipientDeviceId?: string;
    preKeyId?: number;
    signedPreKeyId?: number;
    /** Optional — included in the consolidated diagnostic log if provided. */
    messageId?: string;
  }): Promise<string> {
    if (!envelope.encryptionVersion || envelope.encryptionVersion === 0) {
      return envelope.ciphertext;
    }

    // One diagnostic log line per attempt — success OR failure. Captures
    // exactly the fields needed to compare a working message against a
    // failing one side-by-side. Filled in incrementally as we walk
    // through the decrypt steps; emitted in the finally block.
    const diag: {
      messageId?: string;
      encryptionVersion?: number;
      senderDeviceId?: string;
      recipientDeviceId?: string;
      localDeviceId: string | null;
      signedPreKeyId?: number;
      preKeyId?: number;
      spkLookup: 'hit' | 'miss' | 'skipped';
      preKeyLookup: 'hit' | 'miss' | 'skipped' | 'none';
      preKeyAlreadyConsumed?: boolean;
      localSignedPreKeyIds: number[];
      localUnconsumedPreKeyIds: number[];
      localTotalPreKeyCount: number;
      ciphertextLen: number;
      result: 'success' | 'failure';
      reason?: string;
    } = {
      messageId: envelope.messageId,
      encryptionVersion: envelope.encryptionVersion,
      senderDeviceId: envelope.senderDeviceId,
      recipientDeviceId: envelope.recipientDeviceId,
      localDeviceId: this.deviceId,
      signedPreKeyId: envelope.signedPreKeyId,
      preKeyId: envelope.preKeyId,
      spkLookup: 'skipped',
      preKeyLookup: envelope.preKeyId === undefined ? 'none' : 'skipped',
      localSignedPreKeyIds: [],
      localUnconsumedPreKeyIds: [],
      localTotalPreKeyCount: 0,
      ciphertextLen: envelope.ciphertext.length,
      result: 'failure',
    };

    const emit = () => {
      if (!CRYPTO_DEBUG_LOGS) return;
      const tag = diag.result === 'success'
        ? '[signalix-crypto] decrypt success'
        : '[signalix-crypto] decrypt failed';
      // eslint-disable-next-line no-console
      (diag.result === 'success' ? console.info : console.warn)(tag, diag);
    };

    // Early "I got here" line — fires even if something throws synchronously
    // below before the consolidated emit. Helps confirm the decrypt path
    // is reached at all (vs. the cache short-circuit upstream).
    if (CRYPTO_DEBUG_LOGS) {
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] decrypt attempt', {
        messageId: envelope.messageId,
        encryptionVersion: envelope.encryptionVersion,
        senderDeviceId: envelope.senderDeviceId,
        recipientDeviceId: envelope.recipientDeviceId,
        localDeviceId: this.deviceId,
        signedPreKeyId: envelope.signedPreKeyId,
        preKeyId: envelope.preKeyId,
        ciphertextLen: envelope.ciphertext.length,
      });
    }

    try {
      if (envelope.encryptionVersion !== 1) {
        throw new Error(`Unsupported encryption version ${envelope.encryptionVersion}`);
      }
      if (envelope.signedPreKeyId === undefined) {
        throw new Error('Missing signedPreKeyId on envelope');
      }

      // If a fresh login is still publishing keys, MESSAGE_NEW can arrive
      // before IndexedDB has them. Wait on the in-flight init promise so
      // the lookups below find what they need.
      if (this.initPromise) {
        try { await this.initPromise; } catch { /* fall through; lookups will fail loudly */ }
      }

      // Snapshot the local key inventory at decrypt time. Captured here
      // (before the lookups) so the log always reflects the state we
      // actually queried against, even on the success path.
      const localSpkRows = await idbGetAll<SignedPreKeyRecord>(STORE_SIGNED_PRE_KEYS);
      const localPreKeyRows = await idbGetAll<PreKeyRecord>(STORE_PRE_KEYS);
      diag.localSignedPreKeyIds = localSpkRows.map((s) => s.keyId);
      diag.localTotalPreKeyCount = localPreKeyRows.length;
      diag.localUnconsumedPreKeyIds = localPreKeyRows.filter((p) => !p.consumed).map((p) => p.keyId);

      let parsed: EnvelopeBlob;
      try {
        parsed = JSON.parse(envelope.ciphertext) as EnvelopeBlob;
      } catch {
        throw new Error('Malformed E2EE envelope (JSON.parse failed)');
      }
      if (parsed.v !== 1) throw new Error(`Unsupported envelope version ${parsed.v}`);

      const spk = await idbGet<SignedPreKeyRecord>(STORE_SIGNED_PRE_KEYS, envelope.signedPreKeyId);
      if (!spk) {
        diag.spkLookup = 'miss';
        throw new Error(
          `Local signed pre-key ${envelope.signedPreKeyId} not found (likely targeted a different device of this user)`,
        );
      }
      diag.spkLookup = 'hit';

      let preKey: PreKeyRecord | undefined;
      if (envelope.preKeyId !== undefined) {
        preKey = await idbGet<PreKeyRecord>(STORE_PRE_KEYS, envelope.preKeyId);
        if (!preKey) {
          diag.preKeyLookup = 'miss';
          throw new Error(`Local one-time pre-key ${envelope.preKeyId} not found`);
        }
        diag.preKeyLookup = 'hit';
        diag.preKeyAlreadyConsumed = preKey.consumed;
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
      let ptBuf: ArrayBuffer;
      try {
        ptBuf = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: base64UrlToBytes(parsed.iv) },
          aesKey,
          base64UrlToBytes(parsed.c),
        );
      } catch (cryptoErr) {
        // Web Crypto throws an opaque OperationError on auth-tag mismatch.
        // Rewrap with a descriptive reason so the diagnostic log makes the
        // failure mode unambiguous.
        throw new Error(
          `AES-GCM open failed (auth tag mismatch — IKM derived from local SPK${preKey ? '+preKey' : ''} differs from sender's expectation): ${(cryptoErr as Error).message}`,
        );
      }
      const plaintext = new TextDecoder().decode(ptBuf);

      // v0.9.1: mark the one-time pre-key consumed locally — but **only
      // after AES-GCM decrypt succeeded** (we're past the `crypto.subtle
      // .decrypt` call). The pre-key row is flagged, never deleted, so
      // late-arriving messages that reference the same key still
      // decrypt. v0.10.0 fixes the matching server-side hygiene: the
      // server never hands out a pre-key the local IDB no longer has,
      // because re-register wipes the device's old server-side rows.
      if (preKey && !preKey.consumed) {
        preKey.consumed = true;
        try {
          await idbPut<PreKeyRecord>(STORE_PRE_KEYS, preKey);
          if (CRYPTO_DEBUG_LOGS) {
            // eslint-disable-next-line no-console
            console.info('[signalix-crypto] preKey consumed locally', {
              preKeyId: preKey.keyId,
              messageId: envelope.messageId,
            });
          }
        } catch {
          // Best-effort — the worst case is we re-mark on next decrypt.
        }
        void this.maybeTopUpAfterConsume();
      }

      diag.result = 'success';
      emit();
      return plaintext;
    } catch (err) {
      diag.result = 'failure';
      diag.reason = (err as Error)?.message ?? String(err);
      emit();
      throw err;
    }
  }

  async getSafetyNumber(peerUserId: string): Promise<string | null> {
    const view = await this.getPeerVerification(peerUserId);
    return view?.safetyNumber ?? null;
  }

  /**
   * v0.12.0 — full verification view for the chat-profile UI. Refreshes
   * the cached safety number against the peer's *current* bundle (so a
   * key rotation is detected immediately) and derives the verification
   * status against the snapshot captured at the last "Mark as verified"
   * click. Returns `null` when the peer has no published bundle.
   */
  async getPeerVerification(peerUserId: string): Promise<{
    status: VerificationStatus;
    safetyNumber: string;
    localIdentityKey: string;
    peerIdentityKey: string;
    verifiedAt: string | undefined;
    verifiedSafetyNumber: string | undefined;
  } | null> {
    try {
      const bundleResponse = await getKeyBundle(peerUserId);
      const bundle = bundleResponse.bundles[0];
      if (!bundle) return null;
      await assertBundleIsValid(bundle);
      await this.maybeCacheSafetyNumber(peerUserId, bundle.identityKey);

      const record = await lookupSafetyNumber(peerUserId);
      if (!record) return null;
      const status = deriveVerificationStatus(record, record.localIdentityKey, record.peerIdentityKey);
      return {
        status,
        safetyNumber: record.safetyNumber,
        localIdentityKey: record.localIdentityKey,
        peerIdentityKey: record.peerIdentityKey,
        verifiedAt: record.verifiedAt,
        verifiedSafetyNumber: record.verifiedSafetyNumber,
      };
    } catch {
      return null;
    }
  }

  /** v0.12.0 — user clicked "Mark as verified" in the chat profile. */
  async markPeerVerified(peerUserId: string): Promise<void> {
    await markPeerVerified(peerUserId);
  }

  /** v0.12.0 — user explicitly removed verification. */
  async unmarkPeerVerified(peerUserId: string): Promise<void> {
    await unmarkPeerVerified(peerUserId);
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
    if (CRYPTO_DEBUG_LOGS) {
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
