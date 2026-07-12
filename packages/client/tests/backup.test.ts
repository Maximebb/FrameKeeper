import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runBackup } from '../src/backup';
import type { ServerApi } from '../src/api';
import type { ClientConfig } from '../src/config';

function makeCard(files: Record<string, string>): { root: string; label: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-backup-'));
  // A card is only detected when DCIM exists, so the fixture always has it.
  fs.mkdirSync(path.join(root, 'DCIM'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, 'DCIM', ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return { root, label: 'TESTCARD' };
}

function makeConfig(overrides: Partial<ClientConfig> = {}): ClientConfig {
  return {
    serverUrl: 'http://test',
    apiToken: 'fk_a_b',
    clientName: 'test-pc',
    pollIntervalMs: 1000,
    deleteAfterBackup: false,
    ignorePatterns: [],
    ...overrides,
  };
}

interface MockApiOptions {
  announceStatus?: string;
  sessionStatuses?: string[];
  existingDigests?: boolean;
  serverIgnorePatterns?: string[];
  uploadError?: string;
}

function makeApi(options: MockApiOptions = {}) {
  const sessionStatuses = [...(options.sessionStatuses ?? [])];
  const api = {
    announce: vi.fn(async () => ({
      sessionId: 42,
      status: options.announceStatus ?? 'confirmed',
      ignorePatterns: options.serverIgnorePatterns ?? [],
    })),
    getSession: vi.fn(async () => ({
      status: sessionStatuses.length > 1 ? sessionStatuses.shift() : sessionStatuses[0],
    })),
    digestExists: vi.fn(async () => ({ exists: options.existingDigests ?? false })),
    upload: vi.fn(async () => {
      if (options.uploadError) throw new Error(options.uploadError);
    }),
    reportProgress: vi.fn(async () => undefined),
    complete: vi.fn(async () => undefined),
  };
  return { api, asServerApi: api as unknown as ServerApi };
}

const cardFiles = (root: string) => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      e.isDirectory() ? walk(abs) : out.push(abs);
    }
  };
  walk(root);
  return out;
};

describe('runBackup', () => {
  it('announces, uploads every file and completes without error', async () => {
    const card = makeCard({ 'A.CR3': 'aaa', 'sub/B.MP4': 'bbbb' });
    const { api, asServerApi } = makeApi();

    await runBackup(makeConfig(), asServerApi, card);

    expect(api.announce).toHaveBeenCalledWith(
      expect.objectContaining({
        clientName: 'test-pc',
        cardLabel: 'TESTCARD',
        files: expect.arrayContaining([
          expect.objectContaining({ name: 'DCIM/A.CR3', size: 3 }),
          expect.objectContaining({ name: 'DCIM/sub/B.MP4', size: 4 }),
        ]),
      })
    );
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.complete).toHaveBeenCalledWith(42, undefined);
    // deleteAfterBackup is false: everything stays on the card
    expect(cardFiles(card.root)).toHaveLength(2);
  });

  it('skips files the server already has, but can still delete them', async () => {
    const card = makeCard({ 'A.CR3': 'aaa' });
    const { api, asServerApi } = makeApi({ existingDigests: true });

    await runBackup(makeConfig({ deleteAfterBackup: true }), asServerApi, card);

    expect(api.upload).not.toHaveBeenCalled();
    expect(cardFiles(card.root)).toHaveLength(0);
    const lastProgress = api.reportProgress.mock.calls.at(-1)![1] as { filesSkipped: number };
    expect(lastProgress.filesSkipped).toBe(1);
  });

  it('deletes card files only after successful upload when opted in', async () => {
    const card = makeCard({ 'A.CR3': 'aaa' });
    const { api, asServerApi } = makeApi();

    await runBackup(makeConfig({ deleteAfterBackup: true }), asServerApi, card);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(cardFiles(card.root)).toHaveLength(0);
  });

  it('never deletes when the upload fails, and reports the failure', async () => {
    const card = makeCard({ 'A.CR3': 'aaa' });
    const { api, asServerApi } = makeApi({ uploadError: 'digest_mismatch' });

    await runBackup(makeConfig({ deleteAfterBackup: true }), asServerApi, card);

    expect(cardFiles(card.root)).toHaveLength(1);
    expect(api.complete).toHaveBeenCalledWith(42, expect.stringContaining('digest_mismatch'));
  });

  it('waits for confirmation before touching any file', async () => {
    const card = makeCard({ 'A.CR3': 'aaa' });
    const { api, asServerApi } = makeApi({
      announceStatus: 'pending',
      sessionStatuses: ['pending', 'confirmed'],
    });

    await runBackup(makeConfig(), asServerApi, card);

    expect(api.getSession).toHaveBeenCalled();
    expect(api.upload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the user dismisses the prompt', async () => {
    const card = makeCard({ 'A.CR3': 'aaa' });
    const { api, asServerApi } = makeApi({
      announceStatus: 'pending',
      sessionStatuses: ['dismissed'],
    });

    await runBackup(makeConfig({ deleteAfterBackup: true }), asServerApi, card);

    expect(api.upload).not.toHaveBeenCalled();
    expect(api.complete).not.toHaveBeenCalled();
    expect(cardFiles(card.root)).toHaveLength(1);
  });

  it('applies local and server ignore patterns', async () => {
    const card = makeCard({ 'A.CR3': 'aaa', 'A.THM': 'x', 'B.LRV': 'y' });
    const { api, asServerApi } = makeApi({ serverIgnorePatterns: ['*.LRV'] });

    await runBackup(makeConfig({ ignorePatterns: ['*.THM'] }), asServerApi, card);

    // Locally ignored files are not even announced
    const announced = api.announce.mock.calls[0][0] as { files: { name: string }[] };
    expect(announced.files.map((f) => f.name)).toEqual(['DCIM/A.CR3', 'DCIM/B.LRV']);
    // Server-ignored files are announced (server filters totals) but not uploaded
    expect(api.upload).toHaveBeenCalledTimes(1);
  });

  it('announces nothing for an empty card', async () => {
    const card = makeCard({});
    const { api, asServerApi } = makeApi();
    await runBackup(makeConfig(), asServerApi, card);
    expect(api.announce).not.toHaveBeenCalled();
  });
});
