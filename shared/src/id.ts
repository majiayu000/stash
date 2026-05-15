// Crockford base32 ULID (https://github.com/ulid/spec). 26 chars.
// 48-bit timestamp (10 chars) + 80 bits random (16 chars). Lexicographically sortable.

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;
const MAX_TIME = 0xffffffffffff; // 2^48 - 1

function encodeTime(now: number, len: number): string {
  if (!Number.isFinite(now) || now < 0 || now > MAX_TIME) {
    throw new Error(`ulid: invalid time ${now}`);
  }
  let value = now;
  let out = '';
  for (let i = len - 1; i >= 0; i--) {
    const mod = value % ENCODING_LEN;
    out = ENCODING[mod] + out;
    value = (value - mod) / ENCODING_LEN;
  }
  return out;
}

function encodeRandom(len: number): string {
  let out = '';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) {
    out += ENCODING[buf[i]! % ENCODING_LEN];
  }
  return out;
}

export function ulid(now: number = Date.now()): string {
  return encodeTime(now, TIME_LEN) + encodeRandom(RANDOM_LEN);
}

export function isUlid(value: string): boolean {
  if (value.length !== TIME_LEN + RANDOM_LEN) return false;
  for (const ch of value) {
    if (!ENCODING.includes(ch)) return false;
  }
  return true;
}
