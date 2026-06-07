import { describe, expect, it } from 'vitest';
import { computeSafetyNumber } from './fingerprints';

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
