import { describe, expect, it } from 'vitest';
import {
  decodeIvFromWire,
  decodeKeyFromWire,
  decryptFile,
  encodeIvForWire,
  encodeKeyForWire,
  encryptFile,
} from './file-crypto';

describe('encryptFile / decryptFile roundtrip', () => {
  it('recovers exact plaintext bytes', async () => {
    const original = new Uint8Array(2048);
    crypto.getRandomValues(original);
    const { ciphertext, key, iv } = await encryptFile(original);
    const plain = await decryptFile(ciphertext, key, iv);
    expect(Array.from(plain)).toEqual(Array.from(original));
  });

  it('produces ciphertext that does NOT equal plaintext', async () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const { ciphertext } = await encryptFile(original);
    // AES-GCM ciphertext = encrypted body + 16-byte auth tag.
    expect(ciphertext.length).toBe(original.length + 16);
    expect(Array.from(ciphertext.slice(0, original.length))).not.toEqual(Array.from(original));
  });

  it('emits a fresh random key + iv per call', async () => {
    const buf = new Uint8Array(64);
    const a = await encryptFile(buf);
    const b = await encryptFile(buf);
    expect(Array.from(a.key)).not.toEqual(Array.from(b.key));
    expect(Array.from(a.iv)).not.toEqual(Array.from(b.iv));
  });

  it('rejects a tampered ciphertext (auth tag failure)', async () => {
    const original = new Uint8Array([10, 20, 30, 40, 50]);
    const { ciphertext, key, iv } = await encryptFile(original);
    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 0xff;
    await expect(decryptFile(tampered, key, iv)).rejects.toThrow();
  });

  it('rejects a wrong-length key / iv', async () => {
    const ct = new Uint8Array(32);
    await expect(decryptFile(ct, new Uint8Array(16), new Uint8Array(12))).rejects.toThrow(/Invalid media key length/);
    await expect(decryptFile(ct, new Uint8Array(32), new Uint8Array(8))).rejects.toThrow(/Invalid media IV length/);
  });

  it('survives base64url round-trip of key + iv via the wire encoders', async () => {
    const original = new Uint8Array([99, 98, 97, 96]);
    const { ciphertext, key, iv } = await encryptFile(original);
    const kWire = encodeKeyForWire(key);
    const ivWire = encodeIvForWire(iv);
    expect(kWire).not.toMatch(/[+/=]/);
    expect(ivWire).not.toMatch(/[+/=]/);
    const plain = await decryptFile(ciphertext, decodeKeyFromWire(kWire), decodeIvFromWire(ivWire));
    expect(Array.from(plain)).toEqual(Array.from(original));
  });
});
