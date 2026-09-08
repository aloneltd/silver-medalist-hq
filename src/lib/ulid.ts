/**
 * Minimal ULID generator — 48-bit millisecond timestamp + 80 bits of crypto randomness,
 * Crockford base32 encoded. Sortable by creation time, collision-resistant, no dependency.
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford's base32 (no I, L, O, U)
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number, len: number): string {
  let mod: number;
  let str = '';
  let time = now;
  for (let i = len; i > 0; i--) {
    mod = time % ENCODING_LEN;
    str = ENCODING[mod] + str;
    time = (time - mod) / ENCODING_LEN;
  }
  return str;
}

function randomBytes(len: number): Uint8Array {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function encodeRandom(len: number): string {
  const bytes = randomBytes(len);
  let str = '';
  for (let i = 0; i < len; i++) str += ENCODING[bytes[i] % ENCODING_LEN];
  return str;
}

/** Generates a new ULID string, e.g. `01J8X2E6R2F7Q9V6ZC4D8H1N3K`. */
export function ulid(now: number = Date.now()): string {
  return encodeTime(now, TIME_LEN) + encodeRandom(RANDOM_LEN);
}
