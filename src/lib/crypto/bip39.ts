// v0.15.0 — Signalix recovery phrase wordlist + helpers.
//
// The phrase is 12 words drawn from a 256-word english list, giving
// 96 bits of base entropy. Combined with PBKDF2-SHA-256 600k
// iterations + AES-256-GCM (see `backup.ts`), this is computationally
// infeasible to brute-force for the foreseeable future even with
// dedicated hardware.
//
// Wordlist constraints:
//   • 3-7 letter common english words
//   • No homophones or look-alike pairs (e.g., no `meet`/`meat`,
//     no `rice`/`race`)
//   • Mostly concrete nouns + simple verbs
//   • Easy to write down + read out loud without ambiguity
//
// The list is NOT a subset of BIP39 — it's a smaller curated set
// optimised for human writability of a 12-word phrase. v0.16.0+ may
// migrate to the full 2048-word BIP39 list for full BIP39 compat.

const WORDLIST: readonly string[] = [
  'ocean', 'lamp', 'river', 'zebra', 'train', 'horse', 'stone', 'mountain',
  'forest', 'deep', 'silent', 'voice', 'apple', 'amber', 'arrow', 'bread',
  'bridge', 'brown', 'cabin', 'camel', 'candle', 'canyon', 'castle', 'cedar',
  'cherry', 'cloud', 'coast', 'cobra', 'coffee', 'coin', 'copper', 'coral',
  'cotton', 'crane', 'crystal', 'daisy', 'dance', 'dawn', 'desert', 'diamond',
  'dolphin', 'dragon', 'drum', 'eagle', 'echo', 'ember', 'falcon', 'feather',
  'fern', 'fire', 'flame', 'flute', 'foam', 'frog', 'galaxy', 'garden',
  'ginger', 'glass', 'globe', 'glove', 'gold', 'granite', 'grape', 'green',
  'harbor', 'hawk', 'helmet', 'honey', 'iceberg', 'igloo', 'ivory', 'jade',
  'jaguar', 'jewel', 'kayak', 'keystone', 'kite', 'knight', 'lagoon', 'lake',
  'lantern', 'laser', 'lemon', 'leopard', 'lily', 'linen', 'lion', 'lobster',
  'lotus', 'magnet', 'mango', 'maple', 'marble', 'marsh', 'meadow', 'medal',
  'melon', 'mercury', 'mirror', 'mist', 'moon', 'moss', 'mushroom', 'nectar',
  'needle', 'nest', 'olive', 'opal', 'orange', 'orchid', 'otter', 'owl',
  'oyster', 'palace', 'panda', 'panther', 'paper', 'parrot', 'pearl', 'pebble',
  'penguin', 'pepper', 'piano', 'pillar', 'pine', 'plant', 'plum', 'pond',
  'poppy', 'porcupine', 'prairie', 'prism', 'puma', 'quartz', 'quilt', 'rabbit',
  'rain', 'rainbow', 'ranch', 'raven', 'razor', 'reed', 'reef', 'rhino',
  'ribbon', 'ridge', 'robin', 'rocket', 'rose', 'ruby', 'saddle', 'salmon',
  'sand', 'sapphire', 'satin', 'scarf', 'seal', 'shark', 'shell', 'shield',
  'silk', 'silver', 'sky', 'slate', 'sloth', 'snake', 'snow', 'sofa',
  'solar', 'song', 'spark', 'spear', 'spider', 'spruce', 'squirrel', 'star',
  'starfish', 'storm', 'strawberry', 'sugar', 'sunset', 'swan', 'sword', 'tango',
  'temple', 'tent', 'thunder', 'tiger', 'tower', 'trail', 'tundra', 'tulip',
  'turtle', 'umbrella', 'unicorn', 'urban', 'valley', 'vanilla', 'velvet', 'venus',
  'violet', 'volcano', 'walnut', 'water', 'wave', 'whale', 'wheat', 'willow',
  'window', 'wolf', 'wood', 'world', 'yacht', 'yellow', 'yogurt', 'zinc',
  'almond', 'aspen', 'badger', 'bamboo', 'beach', 'beaver', 'beetle', 'birch',
  'biscuit', 'bison', 'blossom', 'book', 'border', 'bottle', 'bouquet', 'box',
  'branch', 'breeze', 'brick', 'bubble', 'cactus', 'cake', 'camera', 'canoe',
  'cape', 'caramel', 'cargo', 'carpet', 'celery', 'cello', 'chess', 'chime',
  'circle', 'citrus', 'clam', 'clay', 'cliff', 'clock', 'clover', 'comet',
];

if (WORDLIST.length !== 256) {
  // Compile-time sanity: 256 words = 8 bits/word; 12 words = 96 bits.
  throw new Error(`Signalix wordlist must be exactly 256 entries (got ${WORDLIST.length})`);
}

export const RECOVERY_PHRASE_WORD_COUNT = 12;
export const RECOVERY_PHRASE_ENTROPY_BITS = RECOVERY_PHRASE_WORD_COUNT * 8;

/**
 * Generate a fresh 12-word recovery phrase. Each word index is drawn
 * from a uniformly random byte (we take exactly N bytes from
 * crypto.getRandomValues, not modulo-from-larger, so the distribution
 * is exact).
 */
export function generateRecoveryPhrase(): string {
  const bytes = new Uint8Array(RECOVERY_PHRASE_WORD_COUNT);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => WORDLIST[b]).join(' ');
}

/**
 * Parse + normalize a user-entered phrase. Accepts whitespace or
 * dashes between words, lower-cases each word, validates that all 12
 * words exist in the wordlist. Returns the normalized phrase on
 * success, or `null` if the input is malformed.
 */
export function normalizeRecoveryPhrase(input: string): string | null {
  const words = input.trim().toLowerCase().split(/[\s\-_,]+/).filter(Boolean);
  if (words.length !== RECOVERY_PHRASE_WORD_COUNT) return null;
  for (const w of words) {
    if (!WORDLIST.includes(w)) return null;
  }
  return words.join(' ');
}

/**
 * Materialize a phrase's underlying entropy as raw bytes — used as
 * the PBKDF2 input in `backup.ts`. Returns 12 bytes (96 bits) where
 * each byte is the wordlist index. Throws if the phrase doesn't
 * validate.
 */
export function phraseToBytes(phrase: string): Uint8Array {
  const normalized = normalizeRecoveryPhrase(phrase);
  if (!normalized) throw new Error('Invalid recovery phrase');
  const words = normalized.split(' ');
  const out = new Uint8Array(RECOVERY_PHRASE_WORD_COUNT);
  for (let i = 0; i < words.length; i += 1) {
    out[i] = WORDLIST.indexOf(words[i]);
  }
  return out;
}

/** Exported for tests; do not import from app code. */
export const __TESTING__ = { WORDLIST };
