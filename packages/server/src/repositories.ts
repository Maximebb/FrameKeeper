import type { DatabaseSync } from 'node:sqlite';
import type { BackupSession, FilePublicRecord, FileRecord, ServerConfig, SessionStatus } from '@framekeeper/shared';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  must_change_password: number;
}

export interface ApiTokenRow {
  token_id: string;
  name: string;
  secret_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const DEFAULT_CONFIG: ServerConfig = {
  ignorePatterns: [],
  autoConfirm: false,
};

export class Repositories {
  constructor(private db: DatabaseSync) {}

  // --- users ---

  getUserByUsername(username: string): UserRow | undefined {
    return this.db
      .prepare('SELECT id, username, password_hash, must_change_password FROM users WHERE username = ?')
      .get(username) as UserRow | undefined;
  }

  getUserById(id: number): UserRow | undefined {
    return this.db
      .prepare('SELECT id, username, password_hash, must_change_password FROM users WHERE id = ?')
      .get(id) as UserRow | undefined;
  }

  countUsers(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
    return row.c;
  }

  createUser(username: string, passwordHash: string, mustChange: boolean): void {
    this.db
      .prepare('INSERT INTO users (username, password_hash, must_change_password) VALUES (?, ?, ?)')
      .run(username, passwordHash, mustChange ? 1 : 0);
  }

  updatePassword(userId: number, passwordHash: string): void {
    this.db
      .prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(passwordHash, userId);
  }

  // --- web sessions ---

  createWebSession(id: string, userId: number, tokenHash: string, expiresAt: string): void {
    this.db
      .prepare('INSERT INTO web_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
      .run(id, userId, tokenHash, expiresAt);
  }

  getWebSession(id: string): { id: string; user_id: number; token_hash: string; expires_at: string } | undefined {
    return this.db
      .prepare('SELECT id, user_id, token_hash, expires_at FROM web_sessions WHERE id = ?')
      .get(id) as { id: string; user_id: number; token_hash: string; expires_at: string } | undefined;
  }

  deleteWebSession(id: string): void {
    this.db.prepare('DELETE FROM web_sessions WHERE id = ?').run(id);
  }

  purgeExpiredWebSessions(): void {
    this.db.prepare("DELETE FROM web_sessions WHERE expires_at < datetime('now')").run();
  }

  // --- api tokens ---

  createApiToken(tokenId: string, name: string, secretHash: string): void {
    this.db
      .prepare('INSERT INTO api_tokens (token_id, name, secret_hash) VALUES (?, ?, ?)')
      .run(tokenId, name, secretHash);
  }

  getApiToken(tokenId: string): ApiTokenRow | undefined {
    return this.db.prepare('SELECT * FROM api_tokens WHERE token_id = ?').get(tokenId) as
      | ApiTokenRow
      | undefined;
  }

  listApiTokens(): Omit<ApiTokenRow, 'secret_hash'>[] {
    return this.db
      .prepare(
        'SELECT token_id, name, created_at, last_used_at, revoked_at FROM api_tokens ORDER BY created_at DESC'
      )
      .all() as Omit<ApiTokenRow, 'secret_hash'>[];
  }

  touchApiToken(tokenId: string): void {
    this.db.prepare("UPDATE api_tokens SET last_used_at = datetime('now') WHERE token_id = ?").run(tokenId);
  }

  revokeApiToken(tokenId: string): void {
    this.db.prepare("UPDATE api_tokens SET revoked_at = datetime('now') WHERE token_id = ?").run(tokenId);
  }

  // --- settings ---

  getConfig(): ServerConfig {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as {
      key: string;
      value: string;
    }[];
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      ignorePatterns: map.ignorePatterns ? JSON.parse(map.ignorePatterns) : DEFAULT_CONFIG.ignorePatterns,
      autoConfirm: map.autoConfirm ? map.autoConfirm === 'true' : DEFAULT_CONFIG.autoConfirm,
    };
  }

  setConfig(config: ServerConfig): void {
    const upsert = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
    upsert.run('ignorePatterns', JSON.stringify(config.ignorePatterns));
    upsert.run('autoConfirm', String(config.autoConfirm));
  }

  // --- backup sessions ---

  createSession(clientName: string, cardLabel: string, totalBytes: number, totalFiles: number, status: SessionStatus): number {
    const result = this.db
      .prepare(
        'INSERT INTO sessions (client_name, card_label, status, total_bytes, total_files) VALUES (?, ?, ?, ?, ?)'
      )
      .run(clientName, cardLabel, status, totalBytes, totalFiles);
    return Number(result.lastInsertRowid);
  }

  getSession(id: number): BackupSession | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? toSession(row) : undefined;
  }

  listSessions(limit: number): BackupSession[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY id DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map(toSession);
  }

  getActiveSession(): BackupSession | undefined {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE status IN ('pending','confirmed','running') ORDER BY id DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    return row ? toSession(row) : undefined;
  }

  setSessionStatus(id: number, status: SessionStatus, error?: string): void {
    const finished = status === 'done' || status === 'failed' || status === 'dismissed';
    this.db
      .prepare(
        `UPDATE sessions SET status = ?, error = ?, finished_at = ${finished ? "datetime('now')" : 'finished_at'} WHERE id = ?`
      )
      .run(status, error ?? null, id);
  }

  updateSessionProgress(
    id: number,
    doneBytes: number,
    filesDone: number,
    filesSkipped: number,
    currentFile: string | null
  ): void {
    this.db
      .prepare(
        "UPDATE sessions SET done_bytes = ?, files_done = ?, files_skipped = ?, current_file = ?, status = 'running' WHERE id = ?"
      )
      .run(doneBytes, filesDone, filesSkipped, currentFile, id);
  }

  // --- files ---

  findFileByDigest(sha256: string): FileRecord | undefined {
    const row = this.db.prepare('SELECT * FROM files WHERE sha256 = ?').get(sha256) as
      | Record<string, unknown>
      | undefined;
    return row ? toFile(row) : undefined;
  }

  insertFile(sha256: string, size: number, originalName: string, destPath: string, sessionId: number | null): void {
    this.db
      .prepare('INSERT INTO files (sha256, size, original_name, dest_path, session_id) VALUES (?, ?, ?, ?, ?)')
      .run(sha256, size, originalName, destPath, sessionId);
  }

  listFiles(search: string | undefined, limit: number, offset: number): { total: number; items: FilePublicRecord[] } {
    const where = search ? 'WHERE original_name LIKE ? OR sha256 LIKE ?' : '';
    const params = search ? [`%${search}%`, `${search}%`] : [];
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS c FROM files ${where}`).get(...params) as { c: number }
    ).c;
    const rows = this.db
      .prepare(`SELECT * FROM files ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Record<string, unknown>[];
    return { total, items: rows.map(toPublicFile) };
  }
}

function toSession(row: Record<string, unknown>): BackupSession {
  return {
    id: row.id as number,
    clientName: row.client_name as string,
    cardLabel: row.card_label as string,
    status: row.status as SessionStatus,
    totalBytes: row.total_bytes as number,
    doneBytes: row.done_bytes as number,
    totalFiles: row.total_files as number,
    filesDone: row.files_done as number,
    filesSkipped: row.files_skipped as number,
    currentFile: (row.current_file as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null) ?? null,
  };
}

function toFile(row: Record<string, unknown>): FileRecord {
  return {
    id: row.id as number,
    sha256: row.sha256 as string,
    size: row.size as number,
    originalName: row.original_name as string,
    destPath: row.dest_path as string,
    sessionId: (row.session_id as number | null) ?? null,
    backedUpAt: row.backed_up_at as string,
  };
}

function toPublicFile(row: Record<string, unknown>): FilePublicRecord {
  const { destPath: _destPath, ...file } = toFile(row);
  return file;
}
