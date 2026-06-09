import { describe, expect, it } from 'vitest';
import {
  RECOVERY_PHRASE_WORD_COUNT,
  generateRecoveryPhrase,
  normalizeRecoveryPhrase,
  phraseToBytes,
  __TESTING__,
} from './bip39';

describe('Signalix recovery phrase', () => {
  it('generates 12 space-separated words from the wordlist', () => {
    const phrase = generateRecoveryPhrase();
    const words = phrase.split(' ');
    expect(words).toHaveLength(RECOVERY_PHRASE_WORD_COUNT);
    for (const w of words) {
      expect(__TESTING__.WORDLIST).toContain(w);
    }
  });

  it('produces uniformly random output (low collision in a small sample)', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i += 1) set.add(generateRecoveryPhrase());
    expect(set.size).toBe(100);
  });

  it('normalizes whitespace + dashes + casing', () => {
    const phrase = generateRecoveryPhrase();
    const mangled = phrase.toUpperCase().split(' ').join('-');
    expect(normalizeRecoveryPhrase(mangled)).toBe(phrase);
  });

  it('rejects a phrase with the wrong length', () => {
    expect(normalizeRecoveryPhrase('ocean lamp river')).toBeNull();
  });

  it('rejects a phrase with an unknown word', () => {
    const words = generateRecoveryPhrase().split(' ');
    words[3] = 'banana42';
    expect(normalizeRecoveryPhrase(words.join(' '))).toBeNull();
  });

  it('phraseToBytes emits 12 bytes with each value in 0..255', () => {
    const phrase = generateRecoveryPhrase();
    const bytes = phraseToBytes(phrase);
    expect(bytes).toHaveLength(12);
    for (const b of bytes) {
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(256);
    }
  });

  it('phraseToBytes is deterministic across normalized forms', () => {
    const phrase = generateRecoveryPhrase();
    const a = phraseToBytes(phrase);
    const b = phraseToBytes(phrase.toUpperCase().split(' ').join('-'));
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
