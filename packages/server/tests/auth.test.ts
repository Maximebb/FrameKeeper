import { beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, createToken, extractCookie, loginAsAdmin, type TestApp } from './helpers';

let t: TestApp;

beforeEach(async () => {
  t = await buildTestApp();
});

describe('unauthenticated access', () => {
  it('rejects every /api endpoint except login', async () => {
    for (const [method, url] of [
      ['GET', '/api/status'],
      ['GET', '/api/files'],
      ['GET', '/api/sessions'],
      ['GET', '/api/config'],
      ['GET', '/api/tokens'],
      ['POST', '/api/cards/announce'],
      ['GET', '/api/digests/' + 'a'.repeat(64)],
      ['POST', '/api/files'],
      ['GET', '/api/auth/me'],
    ] as const) {
      const res = await t.app.inject({ method, url });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('rejects login with wrong credentials', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'nope' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects login for unknown users', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'ghost', password: 'whatever' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('first login flow', () => {
  it('seeds admin:admin and demands a password change', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'admin' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ username: 'admin', mustChangePassword: true });
  });

  it('locks all endpoints except auth ones until the password is changed', async () => {
    const login = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'admin' },
    });
    const cookie = extractCookie(login.headers['set-cookie']);

    const blocked = await t.app.inject({ method: 'GET', url: '/api/status', headers: { cookie } });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ error: 'password_change_required' });

    const me = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
  });

  it('refuses weak or short new passwords', async () => {
    const login = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'admin' },
    });
    const cookie = extractCookie(login.headers['set-cookie']);

    for (const [newPassword, error] of [
      ['short', 'password_too_short'],
      ['admin', 'password_too_short'],
    ] as const) {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: { cookie },
        payload: { currentPassword: 'admin', newPassword },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error });
    }
  });

  it('unlocks the API after the password change and invalidates the old password', async () => {
    const cookie = await loginAsAdmin(t.app);

    const status = await t.app.inject({ method: 'GET', url: '/api/status', headers: { cookie } });
    expect(status.statusCode).toBe(200);

    const oldLogin = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'admin' },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'test-password-1' },
    });
    expect(newLogin.statusCode).toBe(200);
    expect(newLogin.json()).toMatchObject({ mustChangePassword: false });
  });
});

describe('logout', () => {
  it('invalidates the session cookie', async () => {
    const cookie = await loginAsAdmin(t.app);
    await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    const res = await t.app.inject({ method: 'GET', url: '/api/status', headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });
});

describe('API tokens', () => {
  it('creates a token usable as a bearer credential', async () => {
    const cookie = await loginAsAdmin(t.app);
    const token = await createToken(t.app, cookie);
    expect(token).toMatch(/^fk_[a-f0-9]{16}_[A-Za-z0-9_-]+$/);

    const res = await t.app.inject({
      method: 'GET',
      url: '/api/digests/' + 'a'.repeat(64),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('never returns the secret again after creation', async () => {
    const cookie = await loginAsAdmin(t.app);
    const token = await createToken(t.app, cookie);
    const secret = token.split('_')[2];

    const list = await t.app.inject({ method: 'GET', url: '/api/tokens', headers: { cookie } });
    expect(list.body).not.toContain(secret);
    expect(list.json().tokens[0]).not.toHaveProperty('secret_hash');
  });

  it('rejects tampered and unknown tokens', async () => {
    const cookie = await loginAsAdmin(t.app);
    const token = await createToken(t.app, cookie);
    const tampered = token.slice(0, -4) + 'AAAA';

    for (const bearer of [tampered, 'fk_0000000000000000_bogus', 'not-even-a-token']) {
      const res = await t.app.inject({
        method: 'GET',
        url: '/api/digests/' + 'a'.repeat(64),
        headers: { authorization: `Bearer ${bearer}` },
      });
      expect(res.statusCode, bearer).toBe(401);
    }
  });

  it('rejects revoked tokens', async () => {
    const cookie = await loginAsAdmin(t.app);
    const token = await createToken(t.app, cookie);
    const tokenId = token.split('_')[1];

    await t.app.inject({ method: 'DELETE', url: `/api/tokens/${tokenId}`, headers: { cookie } });

    const res = await t.app.inject({
      method: 'GET',
      url: '/api/digests/' + 'a'.repeat(64),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('blocks bearer tokens from browser-only management routes', async () => {
    const cookie = await loginAsAdmin(t.app);
    const token = await createToken(t.app, cookie);

    for (const [method, url] of [
      ['GET', '/api/config'],
      ['GET', '/api/tokens'],
      ['POST', '/api/tokens'],
    ] as const) {
      const res = await t.app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: method === 'POST' ? { name: 'x' } : undefined,
      });
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
  });
});
