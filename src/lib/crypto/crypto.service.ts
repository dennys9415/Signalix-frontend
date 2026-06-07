// Public entry point for the crypto layer.
//
// Exposes a singleton `cryptoService` (currently a MockCryptoService)
// plus a `getCryptoStatus()` helper used by settings / debug UI. Swap
// the implementation here — not at every call site — when v0.9.0 ships
// a real Signal-Protocol backend.

import { MockCryptoService, describeMock } from './crypto.mock';
import type { CryptoService, CryptoStatus } from './crypto.types';

// Exported as a `CryptoService` so consumers can't accidentally rely on
// MockCryptoService specifics.
export const cryptoService: CryptoService = new MockCryptoService();

export function getCryptoStatus(): CryptoStatus {
  // The mock is always the implementation in v0.8.0. The real one will
  // pick its own descriptor.
  return describeMock();
}

export type { CryptoService, CryptoStatus, EncryptedEnvelope } from './crypto.types';
