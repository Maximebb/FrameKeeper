import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ServerApi } from '../src/api';
import type { ClientConfig } from '../src/config';

const config: ClientConfig = {
  serverUrl: 'http://server:8080',
  apiToken: 'fk_id_secret',
  clientName: 'pc',
  pollIntervalMs: 1000,
  deleteAfterBackup: false,
  ignorePatterns: [],
};

function stubFetch(status: number, body: unknown) {
  const mock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ServerApi', () => {
  it('sends the bearer token on every request', async () => {
    const mock = stubFetch(200, { exists: false });
    await new ServerApi(config).digestExists('a'.repeat(64));

    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://server:8080/api/digests/${'a'.repeat(64)}`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fk_id_secret');
  });

  it('posts JSON bodies with content type', async () => {
    const mock = stubFetch(200, { sessionId: 1, status: 'pending', ignorePatterns: [] });
    await new ServerApi(config).announce({ clientName: 'pc', cardLabel: 'card', files: [] });

    const [, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toMatchObject({ cardLabel: 'card' });
  });

  it('throws with status and body on non-2xx responses', async () => {
    stubFetch(401, { error: 'unauthorized' });
    await expect(new ServerApi(config).getSession(1)).rejects.toThrow(/401/);
  });

  it('upload streams the file with digest metadata headers', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-api-'));
    const file = path.join(dir, 'IMG.CR3');
    fs.writeFileSync(file, 'bytes');

    const mock = stubFetch(200, { ok: true, verified: true });
    await new ServerApi(config).upload(42, file, 'DCIM/IMG.CR3', 'e'.repeat(64), 1700000000000);

    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit & { duplex?: string }];
    expect(url).toBe('http://server:8080/api/files');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-FK-Sha256']).toBe('e'.repeat(64));
    expect(headers['X-FK-Name']).toBe(encodeURIComponent('DCIM/IMG.CR3'));
    expect(headers['X-FK-Session']).toBe('42');
    expect(headers['Content-Type']).toBe('application/octet-stream');
    expect(init.duplex).toBe('half');
  });

  it('upload fails when the server does not confirm verification', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-api-'));
    const file = path.join(dir, 'IMG.CR3');
    fs.writeFileSync(file, 'bytes');

    stubFetch(200, { ok: true }); // no `verified: true`
    await expect(
      new ServerApi(config).upload(1, file, 'IMG.CR3', 'e'.repeat(64), 0)
    ).rejects.toThrow(/did not confirm verification/);
  });

  it('upload surfaces server rejections (e.g. digest mismatch)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-api-'));
    const file = path.join(dir, 'IMG.CR3');
    fs.writeFileSync(file, 'bytes');

    stubFetch(422, { error: 'digest_mismatch' });
    await expect(
      new ServerApi(config).upload(1, file, 'IMG.CR3', 'e'.repeat(64), 0)
    ).rejects.toThrow(/422/);
  });
});
