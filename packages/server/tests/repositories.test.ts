import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openDatabase } from '../src/db';
import { Repositories } from '../src/repositories';

let repos: Repositories;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-repos-'));
  repos = new Repositories(openDatabase(dir));
});

describe('users', () => {
  it('creates and fetches a user with forced password change', () => {
    repos.createUser('admin', 'hash', true);
    const user = repos.getUserByUsername('admin')!;
    expect(user.must_change_password).toBe(1);
    expect(repos.getUserById(user.id)?.username).toBe('admin');
    expect(repos.countUsers()).toBe(1);
  });

  it('updatePassword clears the forced-change flag', () => {
    repos.createUser('admin', 'old', true);
    const user = repos.getUserByUsername('admin')!;
    repos.updatePassword(user.id, 'new');
    const updated = repos.getUserById(user.id)!;
    expect(updated.password_hash).toBe('new');
    expect(updated.must_change_password).toBe(0);
  });
});

describe('web sessions', () => {
  it('creates, reads and deletes sessions', () => {
    repos.createUser('admin', 'h', false);
    const userId = repos.getUserByUsername('admin')!.id;
    repos.createWebSession('sid1', userId, 'thash', '2099-01-01 00:00:00');
    expect(repos.getWebSession('sid1')?.user_id).toBe(userId);
    repos.deleteWebSession('sid1');
    expect(repos.getWebSession('sid1')).toBeUndefined();
  });

  it('purges expired sessions only', () => {
    repos.createUser('admin', 'h', false);
    const userId = repos.getUserByUsername('admin')!.id;
    repos.createWebSession('old', userId, 'h', '2000-01-01 00:00:00');
    repos.createWebSession('fresh', userId, 'h', '2099-01-01 00:00:00');
    repos.purgeExpiredWebSessions();
    expect(repos.getWebSession('old')).toBeUndefined();
    expect(repos.getWebSession('fresh')).toBeDefined();
  });
});

describe('api tokens', () => {
  it('creates, lists (without secret), touches and revokes', () => {
    repos.createApiToken('abc123', 'living-room', 'secret-hash');
    const listed = repos.listApiTokens();
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('secret_hash');
    expect(listed[0].last_used_at).toBeNull();

    repos.touchApiToken('abc123');
    expect(repos.getApiToken('abc123')?.last_used_at).not.toBeNull();

    repos.revokeApiToken('abc123');
    expect(repos.getApiToken('abc123')?.revoked_at).not.toBeNull();
  });
});

describe('settings / config', () => {
  it('returns defaults when unset', () => {
    expect(repos.getConfig()).toEqual({ ignorePatterns: [], autoConfirm: false });
  });

  it('round-trips config values', () => {
    repos.setConfig({ ignorePatterns: ['*.THM', '*.LRV'], autoConfirm: true });
    expect(repos.getConfig()).toEqual({ ignorePatterns: ['*.THM', '*.LRV'], autoConfirm: true });
  });
});

describe('backup sessions', () => {
  it('creates a session and reads it back in camelCase', () => {
    const id = repos.createSession('pc-1', 'CANON_SD', 1000, 3, 'pending');
    const session = repos.getSession(id)!;
    expect(session).toMatchObject({
      clientName: 'pc-1',
      cardLabel: 'CANON_SD',
      status: 'pending',
      totalBytes: 1000,
      totalFiles: 3,
      doneBytes: 0,
      finishedAt: null,
    });
  });

  it('tracks the active session and finishes it', () => {
    const id = repos.createSession('pc', 'card', 10, 1, 'pending');
    expect(repos.getActiveSession()?.id).toBe(id);

    repos.setSessionStatus(id, 'done');
    expect(repos.getActiveSession()).toBeUndefined();
    expect(repos.getSession(id)?.finishedAt).not.toBeNull();
  });

  it('records failures with an error message', () => {
    const id = repos.createSession('pc', 'card', 10, 1, 'confirmed');
    repos.setSessionStatus(id, 'failed', 'boom');
    const session = repos.getSession(id)!;
    expect(session.status).toBe('failed');
    expect(session.error).toBe('boom');
  });

  it('updates progress and flips status to running', () => {
    const id = repos.createSession('pc', 'card', 100, 2, 'confirmed');
    repos.updateSessionProgress(id, 50, 1, 0, 'IMG_1.CR3');
    const session = repos.getSession(id)!;
    expect(session.status).toBe('running');
    expect(session.doneBytes).toBe(50);
    expect(session.currentFile).toBe('IMG_1.CR3');
  });

  it('lists newest sessions first', () => {
    repos.createSession('pc', 'a', 1, 1, 'pending');
    const second = repos.createSession('pc', 'b', 1, 1, 'pending');
    const list = repos.listSessions(10);
    expect(list[0].id).toBe(second);
  });
});

describe('files', () => {
  it('inserts and finds by digest', () => {
    const digest = 'a'.repeat(64);
    repos.insertFile(digest, 123, 'DCIM/IMG.CR3', '/backups/2026/01/01/IMG.CR3', null);
    expect(repos.findFileByDigest(digest)?.size).toBe(123);
    expect(repos.findFileByDigest('b'.repeat(64))).toBeUndefined();
  });

  it('enforces digest uniqueness', () => {
    const digest = 'c'.repeat(64);
    repos.insertFile(digest, 1, 'x', '/p1', null);
    expect(() => repos.insertFile(digest, 1, 'y', '/p2', null)).toThrow();
  });

  it('searches by name and paginates', () => {
    for (let i = 0; i < 5; i++) {
      repos.insertFile(String(i).repeat(64), i, `IMG_000${i}.CR3`, `/p/${i}`, null);
    }
    repos.insertFile('f'.repeat(64), 9, 'MVI_0001.MP4', '/p/mvi', null);

    const images = repos.listFiles('IMG_', 10, 0);
    expect(images.total).toBe(5);

    const page = repos.listFiles(undefined, 2, 2);
    expect(page.total).toBe(6);
    expect(page.items).toHaveLength(2);
  });
});
