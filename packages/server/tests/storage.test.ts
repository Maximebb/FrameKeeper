import { beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { openDatabase } from '../src/db';
import { Repositories } from '../src/repositories';
import { DigestMismatchError, StorageEngine } from '../src/storage';

let repos: Repositories;
let backupDir: string;
let engine: StorageEngine;

const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-storage-'));
  backupDir = path.join(dir, 'backups');
  fs.mkdirSync(backupDir);
  repos = new Repositories(openDatabase(dir));
  engine = new StorageEngine(backupDir, repos);
});

describe('storeUpload', () => {
  it('writes, verifies and records a file in the dated layout', async () => {
    const content = Buffer.from('photo bytes');
    const mtime = Date.UTC(2026, 0, 15, 12, 0, 0);
    const result = await engine.storeUpload(
      Readable.from(content),
      sha(content),
      'DCIM/100CANON/IMG_0001.CR3',
      mtime,
      null
    );

    expect(fs.readFileSync(result.destPath)).toEqual(content);
    expect(result.destPath).toContain(path.join('2026', '01', '15'));
    expect(path.basename(result.destPath)).toBe('IMG_0001.CR3');

    const record = repos.findFileByDigest(sha(content))!;
    expect(record.destPath).toBe(result.destPath);
    expect(record.size).toBe(content.length);
  });

  it('rejects a corrupted upload and leaves nothing behind', async () => {
    const content = Buffer.from('actual bytes');
    const wrongDigest = sha(Buffer.from('what the client thought it sent'));

    await expect(
      engine.storeUpload(Readable.from(content), wrongDigest, 'IMG.CR3', undefined, null)
    ).rejects.toThrow(DigestMismatchError);

    // No partial file, no dest file, no DB record.
    const everything: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, e.name);
        e.isDirectory() ? walk(abs) : everything.push(abs);
      }
    };
    walk(backupDir);
    expect(everything).toHaveLength(0);
    expect(repos.findFileByDigest(wrongDigest)).toBeUndefined();
  });

  it('dedupes: returns the existing record without writing twice', async () => {
    const content = Buffer.from('same bytes');
    const first = await engine.storeUpload(Readable.from(content), sha(content), 'A.CR3', undefined, null);
    const second = await engine.storeUpload(Readable.from(content), sha(content), 'B.CR3', undefined, null);

    expect(second.destPath).toBe(first.destPath);
    expect(repos.listFiles(undefined, 10, 0).total).toBe(1);
  });

  it('suffixes colliding file names instead of overwriting', async () => {
    const mtime = Date.UTC(2026, 5, 1);
    const a = Buffer.from('first file');
    const b = Buffer.from('second, different file');

    const first = await engine.storeUpload(Readable.from(a), sha(a), 'IMG_0001.CR3', mtime, null);
    const second = await engine.storeUpload(Readable.from(b), sha(b), 'IMG_0001.CR3', mtime, null);

    expect(path.basename(first.destPath)).toBe('IMG_0001.CR3');
    expect(path.basename(second.destPath)).toBe('IMG_0001_1.CR3');
    expect(fs.readFileSync(first.destPath)).toEqual(a);
    expect(fs.readFileSync(second.destPath)).toEqual(b);
  });

  it('applies the card mtime to the stored file', async () => {
    const content = Buffer.from('dated');
    const mtime = Date.UTC(2025, 11, 24, 18, 30, 0);
    const result = await engine.storeUpload(Readable.from(content), sha(content), 'X.JPG', mtime, null);
    expect(fs.statSync(result.destPath).mtimeMs).toBeCloseTo(mtime, -3);
  });
});
