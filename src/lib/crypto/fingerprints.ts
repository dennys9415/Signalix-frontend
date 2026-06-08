// Safety-number foundation (v0.9.1) + verification state (v0.12.0).
//
// Computes the displayable "12 groups of 5 digits" fingerprint over a
// pair of identity public keys, caches the result per peer in
// IndexedDB, and tracks per-peer verification state. The UI lives in
// ContactProfileModal (v0.12.0+).
//
// Algorithm (Signal-style simplification):
//   1. Concatenate the two raw identity keys in lexicographic order so
//      both endpoints derive the same number regardless of orientation.
//   2. Iterate SHA-256 5200 times over the result, then truncate to the
//      first 30 bytes. (5200 is Signal's published iteration count.)
//   3. Encode the 30 bytes as 12 groups of 5 decimal digits, MSB-first,
//      with each group derived from 5 bytes via (val % 10^5).

import {
  STORE_FINGERPRINTS,
  idbGet,
  idbPut,
  type FingerprintRecord,
} from './db';

const FINGERPRINT_ITERATIONS = 5200;
const FINGERPRINT_GROUPS = 12;
const FINGERPRINT_BYTES_PER_GROUP = 5;

export async function computeSafetyNumber(
  localIdentityRaw: Uint8Array,
  peerIdentityRaw: Uint8Array,
): Promise<string> {
  const ordered = lexCompare(localIdentityRaw, peerIdentityRaw) <= 0
    ? concat(localIdentityRaw, peerIdentityRaw)
    : concat(peerIdentityRaw, localIdentityRaw);

  let digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', toBuffer(ordered));
  for (let i = 1; i < FINGERPRINT_ITERATIONS; i += 1) {
    digest = await crypto.subtle.digest('SHA-256', digest);
  }
  // SHA-256 emits 32 bytes; we need 60 bytes worth of material to render
  // 12 groups of 5 bytes each. Extend deterministically by hashing the
  // first digest one more time and concatenating, then truncate.
  const tail = await crypto.subtle.digest('SHA-256', digest);
  const expanded = new Uint8Array(64);
  expanded.set(new Uint8Array(digest), 0);
  expanded.set(new Uint8Array(tail), 32);
  const bytes = expanded.slice(0, FINGERPRINT_GROUPS * FINGERPRINT_BYTES_PER_GROUP);

  // Each group reads 5 bytes (40 bits). 2^40 fits comfortably inside
  // Number.MAX_SAFE_INTEGER (2^53-1), so plain arithmetic is exact and
  // we avoid pulling in BigInt support just for this.
  const groups: string[] = [];
  for (let g = 0; g < FINGERPRINT_GROUPS; g += 1) {
    let acc = 0;
    for (let b = 0; b < FINGERPRINT_BYTES_PER_GROUP; b += 1) {
      acc = acc * 256 + bytes[g * FINGERPRINT_BYTES_PER_GROUP + b];
    }
    const five = (acc % 100000).toString().padStart(5, '0');
    groups.push(five);
  }
  return groups.join('-');
}

export async function cacheSafetyNumber(record: Omit<FingerprintRecord, 'computedAt'>): Promise<void> {
  try {
    // v0.12.0 — read the existing row first so we don't clobber the
    // verification snapshot (`verifiedAt`, `verifiedLocalIdentityKey`,
    // …) when refreshing the *current* identity-key view. The verified
    // snapshot is intentionally frozen at the moment of the "Mark as
    // verified" click and must outlive ordinary cache refreshes.
    const existing = await idbGet<FingerprintRecord>(STORE_FINGERPRINTS, record.peerUserId);
    await idbPut<FingerprintRecord>(STORE_FINGERPRINTS, {
      ...(existing ?? {}),
      ...record,
      computedAt: new Date().toISOString(),
    });
  } catch {
    // Cache is best-effort.
  }
}

export async function lookupSafetyNumber(
  peerUserId: string,
): Promise<FingerprintRecord | undefined> {
  try {
    return await idbGet<FingerprintRecord>(STORE_FINGERPRINTS, peerUserId);
  } catch {
    return undefined;
  }
}

/**
 * v0.12.0 — verification status semantics:
 *
 *   • `'unknown'`  — we've never computed a safety number for this peer
 *     (the user hasn't opened the encryption section yet, or they haven't
 *     exchanged messages so we never fetched a bundle).
 *   • `'unverified'` — fingerprint computed but the user hasn't marked
 *     it verified. Current and verified snapshot match (or no snapshot
 *     exists yet).
 *   • `'verified'` — user clicked "Mark as verified" and both identity
 *     keys still match the snapshot taken at that moment.
 *   • `'changed'` — verified once, but at least one identity key has
 *     since rotated/regenerated. Renders the "Security number changed"
 *     warning and the verified badge is removed until the user
 *     explicitly re-verifies.
 */
export type VerificationStatus = 'unknown' | 'unverified' | 'verified' | 'changed';

/**
 * Read the current verification status for a peer given the live
 * identity keys (typically just fetched from `GET /crypto/users/:id/
 * key-bundle` on the sender side). Pure function — does not mutate IDB.
 */
export function deriveVerificationStatus(
  record: FingerprintRecord | undefined,
  currentLocalIdentityKey: string,
  currentPeerIdentityKey: string,
): VerificationStatus {
  if (!record) return 'unknown';
  if (!record.verifiedAt) return 'unverified';
  if (
    record.verifiedLocalIdentityKey === currentLocalIdentityKey
    && record.verifiedPeerIdentityKey === currentPeerIdentityKey
  ) {
    return 'verified';
  }
  return 'changed';
}

/**
 * Persist a "mark as verified" click for `peerUserId`. The current
 * fingerprint record is required so we know which identity keys the
 * user is endorsing — otherwise a later silent identity rotation would
 * leave the snapshot pointing at the wrong material and we'd
 * mis-classify a real key change as "still verified".
 */
export async function markPeerVerified(peerUserId: string): Promise<FingerprintRecord | undefined> {
  const existing = await lookupSafetyNumber(peerUserId);
  if (!existing) return undefined;
  const updated: FingerprintRecord = {
    ...existing,
    verifiedAt: new Date().toISOString(),
    verifiedLocalIdentityKey: existing.localIdentityKey,
    verifiedPeerIdentityKey: existing.peerIdentityKey,
    verifiedSafetyNumber: existing.safetyNumber,
  };
  try {
    await idbPut<FingerprintRecord>(STORE_FINGERPRINTS, updated);
  } catch {
    // best-effort
  }
  return updated;
}

/**
 * Clear the verification snapshot. The fingerprint itself stays cached
 * (still useful for the displayable number); only the verified flag
 * goes back to unset.
 */
export async function unmarkPeerVerified(peerUserId: string): Promise<FingerprintRecord | undefined> {
  const existing = await lookupSafetyNumber(peerUserId);
  if (!existing) return undefined;
  const { verifiedAt: _a, verifiedLocalIdentityKey: _b, verifiedPeerIdentityKey: _c, verifiedSafetyNumber: _d, ...rest } = existing;
  void _a; void _b; void _c; void _d;
  try {
    await idbPut<FingerprintRecord>(STORE_FINGERPRINTS, rest as FingerprintRecord);
  } catch {
    // best-effort
  }
  return rest as FingerprintRecord;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function lexCompare(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function toBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.length);
  new Uint8Array(buf).set(u8);
  return buf;
}
