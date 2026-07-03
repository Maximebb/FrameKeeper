import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import { loadEnv } from './env';
import { openDatabase } from './db';
import { Repositories } from './repositories';
import { registerAuth, seedAdmin } from './auth';
import { registerRoutes } from './routes';
import { StorageEngine } from './storage';
import { EventBus } from './events';

async function main(): Promise<void> {
  const env = loadEnv();
  const db = openDatabase(env.dataDir);
  const repos = new Repositories(db);
  seedAdmin(repos);

  const app = Fastify({
    logger: true,
    bodyLimit: 1024 * 1024, // JSON bodies only; uploads stream through the octet-stream parser
  });

  await app.register(fastifyCookie);

  // Pass file uploads through untouched so the storage engine can stream them to disk.
  app.addContentTypeParser('application/octet-stream', (_req, payload, done) => {
    done(null, payload);
  });

  registerAuth(app, repos);

  const storage = new StorageEngine(env.backupDir, repos);
  const events = new EventBus();
  registerRoutes(app, repos, storage, events);

  if (fs.existsSync(env.frontendDir)) {
    await app.register(fastifyStatic, { root: env.frontendDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      // SPA fallback
      return reply.sendFile('index.html');
    });
  } else {
    app.log.warn(`frontend dir not found at ${env.frontendDir}; serving API only`);
  }

  await app.listen({ port: env.port, host: env.host });
  app.log.info(`FrameKeeper server on ${env.host}:${env.port}, backups in ${env.backupDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
