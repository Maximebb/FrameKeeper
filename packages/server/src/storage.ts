import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { sha256File } from '@framekeeper/shared';
import { Repositories } from './repositories';

export class DigestMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`digest mismatch: expected ${expected}, got ${actual}`);
    this.name = 'DigestMismatchError';
  }
}

export class StorageEngine {
  constructor(
    private backupDir: string,
    private repos: Repositories
  ) {}

  /**
   * Streams an upload to a temp file, verifies its SHA-256 on disk against the
   * digest the client computed from the card, then moves it into the dated
   * layout and records it. On mismatch the partial file is removed.
   */
  async storeUpload(
    body: Readable,
    expectedSha256: string,
    originalName: string,
    mtimeMs: number | undefined,
    sessionId: number | null
  ): Promise<{ destPath: string; size: number }> {
    const existing = this.repos.findFileByDigest(expectedSha256);
    if (existing) {
      return { destPath: existing.destPath, size: existing.size };
    }

    const tmpDir = path.join(this.backupDir, '.incoming');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${expectedSha256}.part`);

    try {
      await pipeline(body, fs.createWriteStream(tmpPath));

      // Verification pass: re-read what actually landed on disk.
      const actual = await sha256File(tmpPath);
      if (actual !== expectedSha256) {
        throw new DigestMismatchError(expectedSha256, actual);
      }

      const destPath = this.allocateDestPath(originalName, mtimeMs);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.renameSync(tmpPath, destPath);
      if (mtimeMs) {
        const mtime = new Date(mtimeMs);
        fs.utimesSync(destPath, mtime, mtime);
      }

      const size = fs.statSync(destPath).size;
      this.repos.insertFile(expectedSha256, size, originalName, destPath, sessionId);
      return { destPath, size };
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  }

  /** `<backupRoot>/YYYY/MM/DD/<basename>`, suffixed `_1`, `_2`, ... on collision. */
  private allocateDestPath(originalName: string, mtimeMs: number | undefined): string {
    const date = mtimeMs ? new Date(mtimeMs) : new Date();
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const base = path.basename(originalName.replace(/\\/g, '/'));
    const dir = path.join(this.backupDir, yyyy, mm, dd);

    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    let candidate = path.join(dir, base);
    for (let i = 1; fs.existsSync(candidate); i++) {
      candidate = path.join(dir, `${stem}_${i}${ext}`);
    }
    return candidate;
  }
}
