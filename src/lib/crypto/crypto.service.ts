// Public entry point for the crypto layer.
//
// In v0.9.0 the singleton is the real `SignalCryptoService` by default.
// `NEXT_PUBLIC_E2EE_DEV_FALLBACK=true` opts back into the v0.8.0 mock for
// development — useful when running without a key-bundle-equipped peer
// (e.g. local testing against a freshly-wiped database).
//
// The interface is identical for both implementations; callers don't
// need to branch.

import { MockCryptoService, describeMock } from './crypto.mock';
import { SignalCryptoService } from './signal.service';
import type { CryptoService, CryptoStatus } from './crypto.types';

const USE_DEV_FALLBACK = process.env.NEXT_PUBLIC_E2EE_DEV_FALLBACK === 'true';

export const cryptoService: CryptoService = USE_DEV_FALLBACK
  ? new MockCryptoService()
  : new SignalCryptoService();

export function getCryptoStatus(): CryptoStatus {
  if (USE_DEV_FALLBACK) {
    return describeMock();
  }
  return {
    e2eeActive: cryptoService.isReady(),
    implementation: 'signal-beta-v1 (X25519 + AES-256-GCM, direct text only)',
  };
}

export { DECRYPT_FAILED_PLACEHOLDER } from './signal.service';

export type { CryptoService, CryptoStatus, EncryptedEnvelope } from './crypto.types';
