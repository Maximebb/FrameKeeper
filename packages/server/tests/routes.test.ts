import { beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { buildTestApp, createToken, loginAsAdmin, type TestApp } from './helpers';

let t: TestApp;
let cookie: string;
let bearer: Record<string, string>;

const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

beforeEach(async () => {
  t = await buildTestApp();
  cookie = await loginAsAdmin(t.app);
  const token = await createToken(t.app, cookie);
  bearer = { authorization: `Bearer ${token}` };
});

describe('card announce / confirm workflow', () => {
  const announce = () =>
    t.app.inject({
      method: 'POST',
      url: '/api/cards/announce',
      headers: bearer,
      payload: {
        clientName: 'pc-1',
        cardLabel: 'CANON_SD',
        files: [
          { name: 'DCIM/IMG_1.CR3', size: 100 },
          { name: 'DCIM/IMG_2.CR3', size: 200 },
        ],
      },
    });

  it('creates a pending session awaiting confirmation', async () => {
    const res = await announce();
    expect(res.statusCode).toBe(200);
    const { sessionId, status } = res.json();
    expect(status).toBe('pending');

    const session = await t.app.inject({ method: 'GET', url: `/api/sessions/${sessionId}`, headers: bearer });
    expect(session.json()).toMatchObject({ status: 'pending', totalBytes: 300, totalFiles: 2 });
  });

  it('confirm flips the session for the waiting client', async () => {
    const { sessionId } = (await announce()).json();
    const confirm = await t.app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/confirm`,
      headers: { cookie },
    });
    expect(confirm.statusCode).toBe(200);

    const session = await t.app.inject({ method: 'GET', url: `/api/sessions/${sessionId}`, headers: bearer });
    expect(session.json().status).toBe('confirmed');
  });

  it('dismiss ends the session and confirm is then rejected', async () => {
    const { sessionId } = (await announce()).json();
    await t.app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/dismiss`, headers: { cookie } });

    const confirm = await t.app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/confirm`,
      headers: { cookie },
    });
    expect(confirm.statusCode).toBe(409);
  });

  it('applies server-side ignore patterns to the announced totals', async () => {
    await t.app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: { cookie },
      payload: { ignorePatterns: ['*.THM'], autoConfirm: false },
    });

    const res = await t.app.inject({
      method: 'POST',
      url: '/api/cards/announce',
      headers: bearer,
      payload: {
        clientName: 'pc',
        cardLabel: 'card',
        files: [
          { name: 'DCIM/IMG_1.CR3', size: 100 },
          { name: 'DCIM/IMG_1.THM', size: 5 },
        ],
      },
    });
    const { sessionId, ignorePatterns } = res.json();
    expect(ignorePatterns).toEqual(['*.THM']);

    const session = await t.app.inject({ method: 'GET', url: `/api/sessions/${sessionId}`, headers: bearer });
    expect(session.json()).toMatchObject({ totalFiles: 1, totalBytes: 100 });
  });

  it('auto-confirms when configured', async () => {
    await t.app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: { cookie },
      payload: { ignorePatterns: [], autoConfirm: true },
    });
    const res = await announce();
    expect(res.json().status).toBe('confirmed');
  });

  it('rejects malformed announces', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/cards/announce',
      headers: bearer,
      payload: { clientName: 'pc' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('progress and completion', () => {
  it('records progress updates and completion', async () => {
    const announce = await t.app.inject({
      method: 'POST',
      url: '/api/cards/announce',
      headers: bearer,
      payload: { clientName: 'pc', cardLabel: 'card', files: [{ name: 'A.CR3', size: 100 }] },
    });
    const { sessionId } = announce.json();

    await t.app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/progress`,
      headers: bearer,
      payload: { doneBytes: 50, filesDone: 0, filesSkipped: 0, currentFile: 'A.CR3' },
    });
    let session = (await t.app.inject({ method: 'GET', url: `/api/sessions/${sessionId}`, headers: bearer })).json();
    expect(session).toMatchObject({ status: 'running', doneBytes: 50, currentFile: 'A.CR3' });

    await t.app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/complete`,
      headers: bearer,
      payload: {},
    });
    session = (await t.app.inject({ method: 'GET', url: `/api/sessions/${sessionId}`, headers: bearer })).json();
    expect(session.status).toBe('done');
  });

  it('marks failed sessions with the error', async () => {
    const announce = await t.app.inject({
      method: 'POST',
      url: '/api/cards/announce',
      headers: bearer,
      payload: { clientName: 'pc', cardLabel: 'card', files: [{ name: 'A.CR3', size: 1 }] },
    });
    const { sessionId } = announce.json();
    await t.app.inject({
      method: 'POST',
      url: `/api/sessions/${sessionId}/complete`,
      headers: bearer,
      payload: { error: 'card yanked mid-copy' },
    });
    const session = (await t.app.inject({ method: 'GET', url: `/api/sessions/${sessionId}`, headers: bearer })).json();
    expect(session).toMatchObject({ status: 'failed', error: 'card yanked mid-copy' });
  });
});

describe('digest check and upload', () => {
  it('validates digest format', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/digests/nothex', headers: bearer });
    expect(res.statusCode).toBe(400);
  });

  it('uploads, verifies and dedupes', async () => {
    const content = Buffer.from('raw image data');
    const digest = sha(content);

    const before = await t.app.inject({ method: 'GET', url: `/api/digests/${digest}`, headers: bearer });
    expect(before.json()).toEqual({ exists: false });

    const upload = await t.app.inject({
      method: 'POST',
      url: '/api/files',
      headers: {
        ...bearer,
        'content-type': 'application/octet-stream',
        'x-fk-sha256': digest,
        'x-fk-name': encodeURIComponent('DCIM/100CANON/IMG_0001.CR3'),
        'x-fk-mtime': String(Date.now()),
      },
      payload: content,
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json()).toMatchObject({ ok: true, verified: true, size: content.length });

    const after = await t.app.inject({ method: 'GET', url: `/api/digests/${digest}`, headers: bearer });
    expect(after.json()).toEqual({ exists: true });

    const files = await t.app.inject({ method: 'GET', url: '/api/files', headers: { cookie } });
    expect(files.json().total).toBe(1);
  });

  it('rejects uploads whose bytes do not match the declared digest', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/files',
      headers: {
        ...bearer,
        'content-type': 'application/octet-stream',
        'x-fk-sha256': 'a'.repeat(64),
        'x-fk-name': 'IMG.CR3',
      },
      payload: Buffer.from('corrupted in transit'),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: 'digest_mismatch' });
  });

  it('rejects uploads missing required headers', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/files',
      headers: { ...bearer, 'content-type': 'application/octet-stream' },
      payload: Buffer.from('x'),
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('file history', () => {
  it('searches by name', async () => {
    for (const name of ['IMG_0001.CR3', 'IMG_0002.CR3', 'MVI_0001.MP4']) {
      const content = Buffer.from(`content of ${name}`);
      await t.app.inject({
        method: 'POST',
        url: '/api/files',
        headers: {
          ...bearer,
          'content-type': 'application/octet-stream',
          'x-fk-sha256': sha(content),
          'x-fk-name': encodeURIComponent(name),
        },
        payload: content,
      });
    }
    const res = await t.app.inject({ method: 'GET', url: '/api/files?search=IMG_', headers: { cookie } });
    expect(res.json().total).toBe(2);
  });

  it('does not expose internal storage paths', async () => {
    const content = Buffer.from('secret path test');
    await t.app.inject({
      method: 'POST',
      url: '/api/files',
      headers: {
        ...bearer,
        'content-type': 'application/octet-stream',
        'x-fk-sha256': sha(content),
        'x-fk-name': encodeURIComponent('IMG.CR3'),
      },
      payload: content,
    });
    const res = await t.app.inject({ method: 'GET', url: '/api/files', headers: { cookie } });
    const item = res.json().items[0];
    expect(item).not.toHaveProperty('destPath');
    expect(item.originalName).toBe('IMG.CR3');
  });
});
