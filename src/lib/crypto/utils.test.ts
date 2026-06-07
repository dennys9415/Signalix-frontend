import { describe, expect, it } from 'vitest';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToHex,
  concatBytes,
  verifyEd25519Signature,
} from './utils';

describe('base64url helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const original = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255, 0x10, 0x20, 0x7f]);
    const encoded = bytesToBase64Url(original);
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = base64UrlToBytes(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('handles empty buffers', () => {
    expect(bytesToBase64Url(new Uint8Array())).toBe('');
    expect(base64UrlToBytes('').length).toBe(0);
  });
});

describe('concatBytes', () => {
  it('concatenates in order with correct total length', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const c = new Uint8Array([6]);
    const out = concatBytes(a, b, c);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('bytesToHex', () => {
  it('pads single-digit bytes with a leading zero', () => {
    expect(bytesToHex(new Uint8Array([0x00, 0x0f, 0xff]))).toBe('000fff');
  });
});

describe('verifyEd25519Signature', () => {
  it('verifies a freshly generated Ed25519 signature', async () => {
    const { publicKey, privateKey } = (await crypto.subtle.generateKey(
      { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
    const message = new TextEncoder().encode('signalix-test-vector');
    const sigBuf = await crypto.subtle.sign('Ed25519', privateKey, message);
    const ok = await verifyEd25519Signature(pubRaw, new Uint8Array(sigBuf), message);
    expect(ok).toBe(true);
  });

  it('rejects a signature when the message has been tampered with', async () => {
    const { publicKey, privateKey } = (await crypto.subtle.generateKey(
      { name: 'Ed25519' } as unknown as AlgorithmIdentifier,
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
    const message = new TextEncoder().encode('original');
    const sigBuf = await crypto.subtle.sign('Ed25519', privateKey, message);
    const tampered = new TextEncoder().encode('tampered');
    const ok = await verifyEd25519Signature(pubRaw, new Uint8Array(sigBuf), tampered);
    expect(ok).toBe(false);
  });

  it('returns false (not throw) on a malformed public key', async () => {
    const badKey = new Uint8Array(8); // wrong length for Ed25519
    const msg = new TextEncoder().encode('x');
    const sig = new Uint8Array(64);
    const ok = await verifyEd25519Signature(badKey, sig, msg);
    expect(ok).toBe(false);
  });
});
