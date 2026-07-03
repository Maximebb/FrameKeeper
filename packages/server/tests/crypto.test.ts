import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  hashToken,
  randomId,
  randomToken,
  verifyPassword,
  verifyToken,
} from '../src/crypto';

describe('password hashing (scrypt)', () => {
  it('round-trips a password', () => {
    const stored = hashPassword('correct-horse');
    expect(verifyPassword('correct-horse', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('correct-horse');
    expect(verifyPassword('wrong-horse', stored)).toBe(false);
  });

  it('produces unique salts for identical passwords', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('stores in the scrypt$N$r$p$salt$hash format, never in clear', () => {
    const stored = hashPassword('hunter22');
    expect(stored).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(stored).not.toContain('hunter22');
  });

  it('rejects malformed stored values without throwing', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(verifyPassword('x', 'scrypt$bad')).toBe(false);
    expect(verifyPassword('x', '')).toBe(false);
  });
});

describe('token hashing (salted sha256)', () => {
  it('round-trips a secret', () => {
    const secret = randomToken();
    const stored = hashToken(secret);
    expect(verifyToken(secret, stored)).toBe(true);
    expect(verifyToken('other', stored)).toBe(false);
  });

  it('salts: same secret hashes differently', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abc'));
  });

  it('never stores the secret in clear', () => {
    const secret = randomToken();
    expect(hashToken(secret)).not.toContain(secret);
  });

  it('rejects malformed stored values', () => {
    expect(verifyToken('x', 'garbage')).toBe(false);
    expect(verifyToken('x', 'sha256$only-two')).toBe(false);
  });
});

describe('random generators', () => {
  it('randomToken is url-safe and long enough', () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
  });

  it('randomId is lowercase hex', () => {
    expect(randomId()).toMatch(/^[a-f0-9]{16}$/);
  });
});
