// Re-exports + frontend-local crypto types. Centralising the imports
// here means callers in chat.store / MessageView never need to know
// whether a type comes from the shared contracts package or from a
// future signal-protocol-specific module.

export type {
  DeviceIdentityKeyDTO,
  DeviceKeyBundleDTO,
  KeyAlgorithm,
  KeyBundleResponse,
  PreKeyDTO,
  RegisterDeviceKeysRequest,
  RegisterDeviceKeysResponse,
  RotateSignedPreKeyRequest,
  RotateSignedPreKeyResponse,
  SignedPreKeyDTO,
  UploadPreKeysRequest,
  UploadPreKeysResponse,
} from '@signalix/contracts';

/**
 * The envelope returned by `CryptoService.encryptForRecipient`. Holds
 * the ciphertext that goes into the message body plus the metadata
 * fields the server persists alongside the message row.
 *
 * In v0.8.0 the mock implementation always returns
 * `{ ciphertext: plaintext, encryptionVersion: 0 }` — plaintext goes
 * through unchanged. v0.9.0 will fill the rest of the fields with real
 * Signal-Protocol envelope data.
 */
export interface EncryptedEnvelope {
  ciphertext: string;
  encryptionVersion: number;
  senderDeviceId?: string;
  recipientDeviceId?: string;
  preKeyId?: number;
  signedPreKeyId?: number;
}

/**
 * The minimal interface the rest of the app depends on. Swapping in a
 * real Signal-Protocol implementation in v0.9.0 means providing a new
 * class that implements this interface — callers don't change.
 */
export interface CryptoService {
  /**
   * One-time per-session bootstrap. The mock implementation is a no-op;
   * the real implementation will (a) load the local identity key from
   * IndexedDB or generate one, (b) ensure the server has a fresh signed
   * pre-key, (c) top up the one-time pre-key pool when it's running low.
   */
  init(opts: { deviceId: string }): Promise<void>;

  /** Whether `init` has run and the service is ready to encrypt/decrypt. */
  isReady(): boolean;

  /**
   * Returns the envelope to send for `plaintext`. Recipient hint is used
   * by the real implementation to look up the per-recipient session;
   * the mock ignores it. The returned object's `ciphertext` is what
   * the chat send pipeline puts on the wire.
   */
  encryptForRecipient(
    plaintext: string,
    recipient: { chatId?: string; recipientUsername?: string; recipientUserId?: string },
  ): Promise<EncryptedEnvelope>;

  /**
   * v0.10.0 — multi-device fan-out. Returns one envelope per device the
   * recipient has published a bundle for. Callers ship them as
   * `recipients[]` on the WS frame so every device of the recipient can
   * decrypt the message — fixes the v0.9.x single-device-only limitation
   * (sender used to encrypt to whichever bundle was first, leaving
   * Brave/Chrome second-device installs permanently unable to decrypt).
   */
  encryptForUserAllDevices(
    plaintext: string,
    recipientUserId: string,
  ): Promise<EncryptedEnvelope[]>;

  /**
   * Returns the plaintext for an incoming envelope. Mock passthroughs
   * `envelope.ciphertext` as-is.
   */
  decryptIncoming(envelope: {
    ciphertext: string;
    encryptionVersion?: number;
    senderDeviceId?: string;
    recipientDeviceId?: string;
    preKeyId?: number;
    signedPreKeyId?: number;
    /**
     * v0.10.0 — optional message id passed through to the consolidated
     * `[signalix-crypto] decrypt success/failed` diagnostic log so the
     * dev can pair the line with a specific bubble in the UI.
     */
    messageId?: string;
  }): Promise<string>;

  /**
   * v0.9.1 safety-number foundation. Returns the cached or freshly
   * computed safety number for the peer's identity key. The displayable
   * form is "12345-67890-..." (12 groups of 5 decimal digits). Caching
   * is keyed by peerUserId; if either identity key rotates the cached
   * value is replaced. v0.10.0 will surface this in the UI.
   */
  getSafetyNumber?(peerUserId: string): Promise<string | null>;

  /**
   * v0.9.1 reset flag — true when init detected partial/corrupt local
   * crypto state and regenerated identity from scratch. The chat layer
   * surfaces this via a one-time banner.
   */
  wasReset?: boolean;
}

/**
 * v0.8.0-only flag exposed for the chat / settings UI to render an
 * "encryption status" pill. Pre-release: switches to `true` once the
 * service finishes a real-key bootstrap.
 */
export interface CryptoStatus {
  /** True only when the active implementation performs real E2EE. */
  e2eeActive: boolean;
  /** The implementation's friendly name — shown in dev / settings UI. */
  implementation: string;
  /**
   * v0.9.1 — true when this device's crypto state was reset on init
   * (missing/partial IndexedDB, or device id changed). The UI consumes
   * this once to show a "your keys were reset" banner, then ack's it.
   */
  wasReset?: boolean;
}
