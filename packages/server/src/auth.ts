import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Repositories } from './repositories';
import { hashPassword, hashToken, randomId, randomToken, verifyPassword, verifyToken } from './crypto';

const SESSION_COOKIE = 'fk_session';
const SESSION_TTL_HOURS = 24 * 7;

const COMMON_PASSWORDS = new Set([
  'admin',
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'letmein1',
  'welcome1',
  'changeme',
  'framekeeper',
]);

export interface AuthContext {
  kind: 'user' | 'token';
  userId?: number;
  mustChangePassword?: boolean;
  tokenId?: string;
}

export interface AuthOptions {
  secureCookies?: boolean;
  adminInitialPassword?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

/** Validates a new password against length, complexity, and a common-password denylist. */
export function validateNewPassword(password: string): 'password_too_short' | 'password_too_weak' | null {
  if (password.length < 8) return 'password_too_short';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'password_too_weak';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'password_too_weak';
  return null;
}

export function seedAdmin(repos: Repositories, initialPassword = 'admin'): void {
  if (repos.countUsers() === 0) {
    const isDefault = initialPassword === 'admin';
    repos.createUser('admin', hashPassword(initialPassword), isDefault);
  }
}

function expiryFromNow(): string {
  const d = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function authenticateRequest(repos: Repositories, request: FastifyRequest): AuthContext | null {
  // Bearer API token (client machines).
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    // Format: fk_<tokenId>_<secret>
    const match = /^fk_([a-f0-9]+)_([A-Za-z0-9_-]+)$/.exec(token);
    if (!match) return null;
    const [, tokenId, secret] = match;
    const row = repos.getApiToken(tokenId);
    if (!row || row.revoked_at) return null;
    if (!verifyToken(secret, row.secret_hash)) return null;
    repos.touchApiToken(tokenId);
    return { kind: 'token', tokenId };
  }

  // Session cookie (browser).
  const cookie = request.cookies?.[SESSION_COOKIE];
  if (cookie) {
    const sep = cookie.indexOf('.');
    if (sep <= 0) return null;
    const sessionId = cookie.slice(0, sep);
    const secret = cookie.slice(sep + 1);
    const session = repos.getWebSession(sessionId);
    if (!session) return null;
    if (new Date(session.expires_at.replace(' ', 'T') + 'Z').getTime() < Date.now()) {
      repos.deleteWebSession(sessionId);
      return null;
    }
    if (!verifyToken(secret, session.token_hash)) return null;
    const user = repos.getUserById(session.user_id);
    if (!user) return null;
    return { kind: 'user', userId: user.id, mustChangePassword: user.must_change_password === 1 };
  }

  return null;
}

/**
 * Registers the global auth hook and the /api/auth/* routes.
 * Everything under /api requires auth except POST /api/auth/login.
 * Static frontend assets are served unauthenticated; the SPA enforces login.
 */
export function registerAuth(app: FastifyInstance, repos: Repositories, options: AuthOptions = {}): void {
  const secureCookies = options.secureCookies ?? false;

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url.split('?')[0];
    if (!url.startsWith('/api/')) return; // static assets
    if (url === '/api/auth/login') return;

    const auth = authenticateRequest(repos, request);
    if (!auth) {
      return reply.code(401).send({ error: 'unauthorized' });
    }

    // A user who must change their password can only call change-password / logout / me.
    const allowedDuringForcedChange = ['/api/auth/change-password', '/api/auth/logout', '/api/auth/me'];
    if (auth.kind === 'user' && auth.mustChangePassword && !allowedDuringForcedChange.includes(url)) {
      return reply.code(403).send({ error: 'password_change_required' });
    }

    request.auth = auth;
  });

  app.post('/api/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const { username, password } = (request.body ?? {}) as { username?: string; password?: string };
    if (!username || !password) return reply.code(400).send({ error: 'missing_credentials' });

    const user = repos.getUserByUsername(username);
    // Always run a verification to keep timing uniform for unknown users.
    const ok = user
      ? verifyPassword(password, user.password_hash)
      : (verifyPassword(password, hashPassword('invalid')), false);
    if (!user || !ok) return reply.code(401).send({ error: 'invalid_credentials' });

    repos.purgeExpiredWebSessions();
    const sessionId = randomId(16);
    const secret = randomToken(32);
    repos.createWebSession(sessionId, user.id, hashToken(secret), expiryFromNow());

    reply.setCookie('fk_session', `${sessionId}.${secret}`, {
      httpOnly: true,
      sameSite: 'strict',
      secure: secureCookies,
      path: '/',
      maxAge: SESSION_TTL_HOURS * 3600,
    });
    return { username: user.username, mustChangePassword: user.must_change_password === 1 };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const cookie = request.cookies?.[SESSION_COOKIE];
    if (cookie) {
      const sessionId = cookie.slice(0, cookie.indexOf('.'));
      repos.deleteWebSession(sessionId);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/', secure: secureCookies });
    return { ok: true };
  });

  app.get('/api/auth/me', async (request, reply) => {
    const auth = request.auth ?? authenticateRequest(repos, request);
    if (!auth || auth.kind !== 'user' || auth.userId === undefined) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const user = repos.getUserById(auth.userId)!;
    return { username: user.username, mustChangePassword: user.must_change_password === 1 };
  });

  app.post('/api/auth/change-password', async (request, reply) => {
    const auth = request.auth ?? authenticateRequest(repos, request);
    if (!auth || auth.kind !== 'user' || auth.userId === undefined) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const { currentPassword, newPassword } = (request.body ?? {}) as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword) return reply.code(400).send({ error: 'missing_fields' });
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) return reply.code(400).send({ error: passwordError });

    const user = repos.getUserById(auth.userId)!;
    if (!verifyPassword(currentPassword, user.password_hash)) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    repos.updatePassword(user.id, hashPassword(newPassword));
    return { ok: true };
  });
}

/** Guard for browser-only management routes (config, tokens, history). */
export function requireUser(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.auth?.kind !== 'user') {
    reply.code(403).send({ error: 'user_session_required' });
    return false;
  }
  return true;
}
