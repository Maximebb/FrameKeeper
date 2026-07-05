import fs from 'fs';
import { Readable } from 'stream';
import type { AnnounceRequest, BackupSession, ProgressUpdate } from '@framekeeper/shared';
import type { ClientConfig } from './config';

export class ServerApi {
  constructor(private config: ClientConfig) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.config.apiToken}`, ...extra };
  }

  private async json<T>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.config.serverUrl}${url}`, {
      method,
      headers: this.headers(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${method} ${url} -> ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  announce(request: AnnounceRequest): Promise<{ sessionId: number; status: string; ignorePatterns: string[] }> {
    return this.json('POST', '/api/cards/announce', request);
  }

  getSession(id: number): Promise<BackupSession> {
    return this.json('GET', `/api/sessions/${id}`);
  }

  digestExists(sha256: string): Promise<{ exists: boolean }> {
    return this.json('GET', `/api/digests/${sha256}`);
  }

  reportProgress(sessionId: number, progress: ProgressUpdate): Promise<void> {
    return this.json('POST', `/api/sessions/${sessionId}/progress`, progress);
  }

  complete(sessionId: number, error?: string): Promise<void> {
    return this.json('POST', `/api/sessions/${sessionId}/complete`, error ? { error } : {});
  }

  /**
   * Streams a file to the server. Resolves only when the server has written
   * AND verified the digest on its disk.
   */
  async upload(
    sessionId: number,
    absPath: string,
    relPath: string,
    sha256: string,
    mtimeMs: number
  ): Promise<void> {
    const res = await fetch(`${this.config.serverUrl}/api/files`, {
      method: 'POST',
      headers: this.headers({
        'Content-Type': 'application/octet-stream',
        'X-FK-Sha256': sha256,
        'X-FK-Name': encodeURIComponent(relPath),
        'X-FK-Mtime': String(Math.round(mtimeMs)),
        'X-FK-Session': String(sessionId),
      }),
      body: Readable.toWeb(fs.createReadStream(absPath)) as unknown as globalThis.ReadableStream,
      // duplex is required by Node's fetch for streamed request bodies
      duplex: 'half',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`upload ${relPath} -> ${res.status} ${text}`);
    }
    const body = (await res.json()) as { verified?: boolean };
    if (!body.verified) {
      throw new Error(`upload ${relPath}: server did not confirm verification`);
    }
  }
}
