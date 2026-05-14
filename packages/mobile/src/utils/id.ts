/**
 * Lightweight ID generation. Uses crypto.getRandomValues when available,
 * falls back to Math.random for non-secure contexts. IDs are device-local
 * until reconciled by the backend.
 */

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' && 'crypto' in globalThis
      ? (globalThis as { crypto?: Crypto }).crypto
      : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(buf);
  } else {
    for (let i = 0; i < bytes; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < bytes; i++) {
    const b = buf[i] ?? 0;
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

/** Returns an RFC4122-shaped UUIDv4-like string (not cryptographically guaranteed v4). */
export function generateId(): string {
  const h = randomHex(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${
    ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)
  }${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
