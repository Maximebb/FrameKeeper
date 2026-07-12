import type { FastifyInstance } from 'fastify';
import type { AnnounceRequest, ProgressUpdate, ServerConfig } from '@framekeeper/shared';
import { matchesAnyPattern } from '@framekeeper/shared';
import { Repositories } from './repositories';
import { StorageEngine, DigestMismatchError } from './storage';
import { EventBus } from './events';
import { requireUser } from './auth';
import { hashToken, randomId, randomToken } from './crypto';

export function registerRoutes(
  app: FastifyInstance,
  repos: Repositories,
  storage: StorageEngine,
  events: EventBus
): void {
  // --- live status (browser session only) ---

  app.get('/api/status', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const active = repos.getActiveSession();
    return { session: active ?? null };
  });

  app.get('/api/events', (request, reply) => {
    if (!requireUser(request, reply)) return;
    events.add(reply);
  });

  // --- history (browser session only) ---

  app.get('/api/sessions', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const { limit } = request.query as { limit?: string };
    return { sessions: repos.listSessions(Math.min(Number(limit ?? 50), 200)) };
  });

  app.get('/api/files', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const { search, limit, offset } = request.query as {
      search?: string;
      limit?: string;
      offset?: string;
    };
    return repos.listFiles(
      search || undefined,
      Math.min(Number(limit ?? 50), 200),
      Number(offset ?? 0)
    );
  });

  // --- server config (browser session only) ---

  app.get('/api/config', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return repos.getConfig();
  });

  app.put('/api/config', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const body = request.body as Partial<ServerConfig>;
    const current = repos.getConfig();
    const next: ServerConfig = {
      ignorePatterns: Array.isArray(body.ignorePatterns)
        ? body.ignorePatterns.map(String)
        : current.ignorePatterns,
      autoConfirm: typeof body.autoConfirm === 'boolean' ? body.autoConfirm : current.autoConfirm,
    };
    repos.setConfig(next);
    events.broadcast('config', next);
    return next;
  });

  // --- API tokens (browser session only) ---

  app.get('/api/tokens', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    return { tokens: repos.listApiTokens() };
  });

  app.post('/api/tokens', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const { name } = (request.body ?? {}) as { name?: string };
    if (!name?.trim()) return reply.code(400).send({ error: 'name_required' });
    const tokenId = randomId(8);
    const secret = randomToken(32);
    repos.createApiToken(tokenId, name.trim(), hashToken(secret));
    // The only time the full token is ever visible.
    return { token: `fk_${tokenId}_${secret}`, tokenId, name: name.trim() };
  });

  app.delete('/api/tokens/:tokenId', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const { tokenId } = request.params as { tokenId: string };
    repos.revokeApiToken(tokenId);
    return { ok: true };
  });

  // --- card announce / confirm workflow ---

  app.post('/api/cards/announce', async (request, reply) => {
    const body = request.body as AnnounceRequest;
    if (!body?.clientName || !body?.cardLabel || !Array.isArray(body.files)) {
      return reply.code(400).send({ error: 'invalid_announce' });
    }
    const config = repos.getConfig();
    const files = body.files.filter((f) => !matchesAnyPattern(f.name, config.ignorePatterns));
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    const status = config.autoConfirm ? 'confirmed' : 'pending';
    const id = repos.createSession(body.clientName, body.cardLabel, totalBytes, files.length, status);
    const session = repos.getSession(id)!;
    events.broadcast('session', session);
    return { sessionId: id, status, ignorePatterns: config.ignorePatterns };
  });

  app.get('/api/sessions/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const session = repos.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    return session;
  });

  app.post('/api/sessions/:id/confirm', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const id = Number((request.params as { id: string }).id);
    const session = repos.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    if (session.status !== 'pending') return reply.code(409).send({ error: 'not_pending' });
    repos.setSessionStatus(id, 'confirmed');
    events.broadcast('session', repos.getSession(id));
    return { ok: true };
  });

  app.post('/api/sessions/:id/dismiss', async (request, reply) => {
    if (!requireUser(request, reply)) return;
    const id = Number((request.params as { id: string }).id);
    const session = repos.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    if (session.status !== 'pending') return reply.code(409).send({ error: 'not_pending' });
    repos.setSessionStatus(id, 'dismissed');
    events.broadcast('session', repos.getSession(id));
    return { ok: true };
  });

  app.post('/api/sessions/:id/progress', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const session = repos.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    const body = request.body as ProgressUpdate;
    repos.updateSessionProgress(
      id,
      body.doneBytes ?? 0,
      body.filesDone ?? 0,
      body.filesSkipped ?? 0,
      body.currentFile ?? null
    );
    events.broadcast('session', repos.getSession(id));
    return { ok: true };
  });

  app.post('/api/sessions/:id/complete', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    const session = repos.getSession(id);
    if (!session) return reply.code(404).send({ error: 'not_found' });
    const { error } = (request.body ?? {}) as { error?: string };
    repos.setSessionStatus(id, error ? 'failed' : 'done', error);
    events.broadcast('session', repos.getSession(id));
    return { ok: true };
  });

  // --- digest check + upload ---

  app.get('/api/digests/:sha256', async (request, reply) => {
    const { sha256 } = request.params as { sha256: string };
    if (!/^[a-f0-9]{64}$/.test(sha256)) return reply.code(400).send({ error: 'invalid_digest' });
    const file = repos.findFileByDigest(sha256);
    return { exists: !!file };
  });

  app.post('/api/files', async (request, reply) => {
    const sha256 = String(request.headers['x-fk-sha256'] ?? '');
    const name = decodeURIComponent(String(request.headers['x-fk-name'] ?? ''));
    const mtimeHeader = request.headers['x-fk-mtime'];
    const sessionHeader = request.headers['x-fk-session'];
    if (!/^[a-f0-9]{64}$/.test(sha256) || !name) {
      return reply.code(400).send({ error: 'missing_headers' });
    }
    const mtimeMs = mtimeHeader ? Number(mtimeHeader) : undefined;
    const sessionId = sessionHeader ? Number(sessionHeader) : null;

    try {
      const result = await storage.storeUpload(request.raw, sha256, name, mtimeMs, sessionId);
      return { ok: true, verified: true, size: result.size };
    } catch (err) {
      if (err instanceof DigestMismatchError) {
        return reply.code(422).send({ error: 'digest_mismatch', detail: err.message });
      }
      throw err;
    }
  });
}
