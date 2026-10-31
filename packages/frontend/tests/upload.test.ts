import { createHash } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectionLabel, sha256Blob, uploadFiles } from '../src/upload';

const hex = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

function makeFile(content: string, name: string, relativePath = ''): File {
  const file = new File([content], name, { lastModified: 1_700_000_000_000 });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

interface ServerStub {
  status?: string;
  ignorePatterns?: string[];
  known?: string[];
  uploadResponse?: { status: number; body: unknown };
}

function stubServer(options: ServerStub = {}) {
  const calls: { method: string; url: string; init: RequestInit }[] = [];
  const reply = (status: number, body: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? 'GET';
      calls.push({ method, url, init });
      if (url === '/api/cards/announce')
        return reply(200, {
          sessionId: 7,
          status: options.status ?? 'confirmed',
          ignorePatterns: options.ignorePatterns ?? [],
        });
      if (url.startsWith('/api/digests/'))
        return reply(200, { exists: (options.known ?? []).includes(url.slice('/api/digests/'.length)) });
      if (url === '/api/files') {
        const r = options.uploadResponse ?? { status: 200, body: { ok: true, verified: true } };
        return reply(r.status, r.body);
      }
      return reply(200, { ok: true });
    })
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('sha256Blob', () => {
  it('matches a one-shot digest, including across chunk boundaries', async () => {
    const big = new Uint8Array(9 * 1024 * 1024 + 123).map((_, i) => i % 251);
    expect(await sha256Blob(new Blob([big]))).toBe(hex(big));
    expect(await sha256Blob(new Blob([]))).toBe(hex(''));
  });
});

describe('selectionLabel', () => {
  it('uses the picked folder name, otherwise a generic label', () => {
    expect(selectionLabel([makeFile('a', 'A.JPG', 'DCIM/A.JPG'), makeFile('b', 'B.JPG', 'DCIM/sub/B.JPG')])).toBe('DCIM');
    expect(selectionLabel([makeFile('a', 'A.JPG')])).toBe('Manual upload');
  });
});

describe('uploadFiles', () => {
  it('announces, uploads with digest headers, reports progress and completes', async () => {
    const calls = stubServer();
    const files = [makeFile('aaa', 'A.CR3', 'DCIM/A.CR3'), makeFile('bbbb', 'B.MP4', 'DCIM/B.MP4')];

    const result = await uploadFiles(files);

    expect(result).toEqual({ doneBytes: 7, filesDone: 2, filesSkipped: 0, currentFile: 'DCIM/B.MP4' });
    const announce = JSON.parse(calls[0].init.body as string);
    expect(announce).toEqual({
      clientName: 'Browser',
      cardLabel: 'DCIM',
      files: [
        { name: 'DCIM/A.CR3', size: 3, mtimeMs: 1_700_000_000_000 },
        { name: 'DCIM/B.MP4', size: 4, mtimeMs: 1_700_000_000_000 },
      ],
    });
    const uploads = calls.filter((c) => c.url === '/api/files');
    expect(uploads).toHaveLength(2);
    expect(uploads[0].init.headers).toMatchObject({
      'X-FK-Sha256': hex('aaa'),
      'X-FK-Name': encodeURIComponent('DCIM/A.CR3'),
      'X-FK-Mtime': '1700000000000',
      'X-FK-Session': '7',
    });
    expect(uploads[0].init.body).toBe(files[0]);
    expect(calls.at(-1)).toMatchObject({ url: '/api/sessions/7/complete' });
    expect(JSON.parse(calls.at(-1)!.init.body as string)).toEqual({});
  });

  it('confirms a pending session itself, since picking files is the confirmation', async () => {
    const calls = stubServer({ status: 'pending' });
    await uploadFiles([makeFile('a', 'A.JPG')]);
    expect(calls[1]).toMatchObject({ method: 'POST', url: '/api/sessions/7/confirm' });
  });

  it('skips digests the server already has and honors server ignore patterns', async () => {
    const calls = stubServer({ known: [hex('aaa')], ignorePatterns: ['*.THM'] });
    const result = await uploadFiles([makeFile('aaa', 'A.CR3'), makeFile('t', 'A.THM'), makeFile('b', 'B.CR3')]);

    expect(result).toMatchObject({ filesDone: 1, filesSkipped: 1 });
    expect(calls.filter((c) => c.url === '/api/files')).toHaveLength(1);
    expect(calls.some((c) => c.url === `/api/digests/${hex('t')}`)).toBe(false);
  });

  it('stops at a verification failure and marks the session failed', async () => {
    const calls = stubServer({ uploadResponse: { status: 422, body: { error: 'digest_mismatch' } } });

    await expect(uploadFiles([makeFile('a', 'A.JPG'), makeFile('b', 'B.JPG')])).rejects.toThrow(
      'A.JPG: digest_mismatch'
    );
    expect(calls.filter((c) => c.url === '/api/files')).toHaveLength(1);
    const complete = calls.find((c) => c.url === '/api/sessions/7/complete')!;
    expect(JSON.parse(complete.init.body as string)).toEqual({ error: 'A.JPG: digest_mismatch' });
  });

  it('treats an unverified acknowledgement as a failure', async () => {
    stubServer({ uploadResponse: { status: 200, body: { ok: true } } });
    await expect(uploadFiles([makeFile('a', 'A.JPG')])).rejects.toThrow('not_verified');
  });
});
