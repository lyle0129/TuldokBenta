// utils/generatePassword.js
// A password nobody chose, for an account somebody else is about to use.

/** No l/I/1/O/0 — this string gets read aloud and copied off a screen by hand. */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_LENGTH = 14;

/**
 * crypto.getRandomValues, never Math.random.
 *
 * This value is the sole credential on a real account until its owner changes
 * it. Math.random is a seeded PRNG whose output is predictable from other draws
 * in the same page, which is fine for shuffling a list and not for this.
 *
 * The modulo bias would be negligible — 256 % 56 leaves a 4/256 lean on the
 * first eight letters — but rejection sampling costs one line, so there is no
 * reason to have to reason about it at all.
 */
export const generatePassword = (length = DEFAULT_LENGTH) => {
  const limit = 256 - (256 % ALPHABET.length);
  const out = [];

  while (out.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out.push(ALPHABET[byte % ALPHABET.length]);
      if (out.length === length) break;
    }
  }

  return out.join("");
};
