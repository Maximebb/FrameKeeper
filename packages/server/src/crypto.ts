import { randomBytes, scryptSync, createHash, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

/**
 * Slow, salted hash for low-entropy secrets (user passwords).
 * Format: scrypt$N$r$p$saltB64$hashB64
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

/**
 * Salted SHA-256 for high-entropy random secrets (web session tokens, API token
 * secrets). These are 256-bit random values, so a fast salted hash is
 * appropriate and keeps per-request verification cheap.
 * Format: sha256$saltB64$hashB64
 */
export function hashToken(secret: string): string {
  const salt = randomBytes(16);
  const hash = createHash('sha256').update(salt).update(secret).digest();
  return `sha256$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyToken(secret: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'sha256') return false;
  const salt = Buffer.from(parts[1], 'base64');
  const expected = Buffer.from(parts[2], 'base64');
  const actual = createHash('sha256').update(salt).update(secret).digest();
  return timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomId(bytes = 8): string {
  return randomBytes(bytes).toString('hex');
}
