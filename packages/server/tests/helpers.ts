import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db';
import { Repositories } from '../src/repositories';
import { registerAuth, seedAdmin } from '../src/auth';
import { registerRoutes } from '../src/routes';
import { StorageEngine } from '../src/storage';
import { EventBus } from '../src/events';

export interface TestApp {
  app: FastifyInstance;
  repos: Repositories;
  backupDir: string;
}

/** Assembles the server exactly like index.ts, on temp dirs, without listening. */
export async function buildTestApp(): Promise<TestApp> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-app-'));
  const backupDir = path.join(dir, 'backups');
  fs.mkdirSync(backupDir);

  const repos = new Repositories(openDatabase(dir));
  seedAdmin(repos);

  const app = Fastify({ logger: false });
  await app.register(fastifyCookie);
  app.addContentTypeParser('application/octet-stream', (_req, payload, done) => {
    done(null, payload);
  });
  registerAuth(app, repos);
  registerRoutes(app, repos, new StorageEngine(backupDir, repos), new EventBus());
  await app.ready();
  return { app, repos, backupDir };
}

/** Logs in as admin, changes the default password, returns a usable session cookie. */
export async function loginAsAdmin(app: FastifyInstance): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'admin', password: 'admin' },
  });
  const cookie = extractCookie(login.headers['set-cookie']);
  await app.inject({
    method: 'POST',
    url: '/api/auth/change-password',
    headers: { cookie },
    payload: { currentPassword: 'admin', newPassword: 'test-password-1' },
  });
  return cookie;
}

export function extractCookie(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!value) throw new Error('no set-cookie header');
  return value.split(';')[0];
}

export async function createToken(app: FastifyInstance, cookie: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/tokens',
    headers: { cookie },
    payload: { name: 'test-client' },
  });
  return (res.json() as { token: string }).token;
}
