import { describe, expect, it } from 'vitest';
import { computeSafetyNumber, deriveVerificationStatus } from './fingerprints';
import type { FingerprintRecord } from './db';

const KEY_A = new Uint8Array(32).fill(0xa1);
const KEY_B = new Uint8Array(32).fill(0xb2);

describe('computeSafetyNumber', () => {
  it('produces 12 groups of 5 decimal digits joined by hyphens', async () => {
    const sn = await computeSafetyNumber(KEY_A, KEY_B);
    expect(sn).toMatch(/^\d{5}(-\d{5}){11}$/);
  });

  it('is symmetric — same number regardless of argument order', async () => {
    const ab = await computeSafetyNumber(KEY_A, KEY_B);
    const ba = await computeSafetyNumber(KEY_B, KEY_A);
    expect(ab).toBe(ba);
  });

  it('differs when either identity key changes', async () => {
    const base = await computeSafetyNumber(KEY_A, KEY_B);
    const flipped = new Uint8Array(KEY_A);
    flipped[0] ^= 0xff;
    const changed = await computeSafetyNumber(flipped, KEY_B);
    expect(changed).not.toBe(base);
  });
});

describe('deriveVerificationStatus', () => {
  const baseRecord: FingerprintRecord = {
    peerUserId: 'peer-1',
    localIdentityKey: 'local-A',
    peerIdentityKey: 'peer-A',
    safetyNumber: '11111-22222-33333-44444-55555-66666-77777-88888-99999-00000-12345-67890',
    computedAt: '2026-06-08T00:00:00.000Z',
  };

  it('returns "unknown" when no fingerprint record exists', () => {
    expect(deriveVerificationStatus(undefined, 'local-A', 'peer-A')).toBe('unknown');
  });

  it('returns "unverified" when the record has no verification snapshot', () => {
    expect(deriveVerificationStatus(baseRecord, 'local-A', 'peer-A')).toBe('unverified');
  });

  it('returns "verified" when both identity keys match the snapshot', () => {
    const verified: FingerprintRecord = {
      ...baseRecord,
      verifiedAt: '2026-06-08T01:00:00.000Z',
      verifiedLocalIdentityKey: 'local-A',
      verifiedPeerIdentityKey: 'peer-A',
      verifiedSafetyNumber: baseRecord.safetyNumber,
    };
    expect(deriveVerificationStatus(verified, 'local-A', 'peer-A')).toBe('verified');
  });

  it('returns "changed" when the peer identity key has rotated', () => {
    const verified: FingerprintRecord = {
      ...baseRecord,
      verifiedAt: '2026-06-08T01:00:00.000Z',
      verifiedLocalIdentityKey: 'local-A',
      verifiedPeerIdentityKey: 'peer-A',
      verifiedSafetyNumber: baseRecord.safetyNumber,
    };
    // Peer's identity is now `peer-B` (post key reset) — caller passes the live value.
    expect(deriveVerificationStatus(verified, 'local-A', 'peer-B')).toBe('changed');
  });

  it('returns "changed" when the LOCAL identity key has rotated', () => {
    const verified: FingerprintRecord = {
      ...baseRecord,
      verifiedAt: '2026-06-08T01:00:00.000Z',
      verifiedLocalIdentityKey: 'local-A',
      verifiedPeerIdentityKey: 'peer-A',
      verifiedSafetyNumber: baseRecord.safetyNumber,
    };
    // Our own identity rotated (v0.9.1 reset flow) — verification also voids.
    expect(deriveVerificationStatus(verified, 'local-B', 'peer-A')).toBe('changed');
  });
});
