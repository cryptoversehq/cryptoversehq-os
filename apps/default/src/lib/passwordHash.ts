// passwordHash.ts — PBKDF2-SHA256 password hashing (WebCrypto, zero deps)
//
// Replaces the previous unsalted SHA-256 scheme. Passwords are hashed with
// PBKDF2-SHA256 using a per-user 16-byte random salt and 100,000 iterations.
// Stored format: pbkdf2$<iterations>$<saltHex>$<hashHex>
//
// Legacy 64-hex SHA-256 hashes are still verified for backward compatibility
// and re-hashed to PBKDF2 on next successful login. Plaintext is never accepted.

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;

function toHex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return new Uint8Array(bits);
}

async function legacySha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(new Uint8Array(buf));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const dk = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(dk)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length === 4 && parts[0] === 'pbkdf2') {
    const iterations = parseInt(parts[1], 10);
    const salt = fromHex(parts[2]);
    const dk = await derive(password, salt, iterations);
    return timingSafeEqual(toHex(dk), parts[3]);
  }
  if (/^[0-9a-f]{64}$/.test(stored)) {
    return timingSafeEqual(await legacySha256(password), stored);
  }
  return false;
}

export function isLegacySha256(stored: string): boolean {
  return /^[0-9a-f]{64}$/.test(stored);
}
