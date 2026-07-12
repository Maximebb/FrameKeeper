import path from 'path';
import fs from 'fs';

export interface ServerEnv {
  port: number;
  host: string;
  dataDir: string;
  backupDir: string;
  frontendDir: string;
  /** Set the Secure flag on session cookies (enable when serving over HTTPS). */
  secureCookies: boolean;
  /** Trust X-Forwarded-* headers from a reverse proxy (needed for secure cookies behind TLS). */
  trustProxy: boolean;
  /** Initial admin password for first boot; defaults to "admin" (forced change on login). */
  adminInitialPassword: string;
}

export function loadEnv(): ServerEnv {
  const dataDir = path.resolve(process.env.FK_DATA_DIR ?? './data');
  const backupDir = path.resolve(process.env.FK_BACKUP_DIR ?? path.join(dataDir, 'backups'));
  const frontendDir = path.resolve(
    process.env.FK_FRONTEND_DIR ?? path.join(__dirname, '../../frontend/dist')
  );
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  return {
    port: Number(process.env.PORT ?? 8080),
    host: process.env.HOST ?? '0.0.0.0',
    dataDir,
    backupDir,
    frontendDir,
    secureCookies: process.env.FK_SECURE_COOKIES === 'true',
    trustProxy: process.env.FK_TRUST_PROXY === 'true',
    adminInitialPassword: process.env.FK_ADMIN_PASSWORD ?? 'admin',
  };
}
