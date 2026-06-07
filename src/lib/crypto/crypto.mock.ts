// v0.8.0 mock implementation of CryptoService.
//
// Passes plaintext through unchanged, declares `encryptionVersion: 0`,
// and never touches the network. This is the implementation we ship
// today; v0.9.0 will replace it with a real Signal-Protocol-backed one
// behind the same interface so callers don't change.
//
// IMPORTANT: nothing in here provides confidentiality, authenticity,
// or forward secrecy. The backend still receives plaintext bodies in
// `messages.ciphertext`. The class merely satisfies the interface so
// the rest of the app can be wired against it ahead of v0.9.0.

import type { CryptoService, CryptoStatus, EncryptedEnvelope } from './crypto.types';

export class MockCryptoService implements CryptoService {
  private ready = false;
  private deviceId: string | null = null;

  async init(opts: { deviceId: string }): Promise<void> {
    this.deviceId = opts.deviceId;
    this.ready = true;
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info('[signalix-crypto] mock service ready — no E2EE active (v0.8.0 foundation)');
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async encryptForRecipient(
    plaintext: string,
    _recipient: { chatId?: string; recipientUsername?: string; recipientUserId?: string },
  ): Promise<EncryptedEnvelope> {
    // No transformation. The envelope explicitly carries version 0 so
    // wire consumers know this body is plaintext. Other fields stay
    // unset — they're only meaningful once a real protocol is wired.
    return { ciphertext: plaintext, encryptionVersion: 0 };
  }

  async decryptIncoming(envelope: { ciphertext: string; encryptionVersion?: number }): Promise<string> {
    // The mock can only "decrypt" plaintext. If a future client emits
    // a non-zero version while the recipient still runs the mock, we
    // surface a placeholder rather than crash the message list.
    if (envelope.encryptionVersion && envelope.encryptionVersion > 0) {
      return '[encrypted message — upgrade to view]';
    }
    return envelope.ciphertext;
  }
}

export function describeMock(): CryptoStatus {
  return {
    e2eeActive: false,
    implementation: 'mock (plaintext passthrough — v0.8.0 foundation)',
  };
}
