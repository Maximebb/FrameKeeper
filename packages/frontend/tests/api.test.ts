import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, formatBytes } from '../src/api';

function stubFetch(status: number, body: unknown) {
  const mock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('formatBytes', () => {
  it('formats across unit boundaries', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(200 * 1024 * 1024)).toBe('200 MB');
    expect(formatBytes(3.4 * 1024 * 1024 * 1024)).toBe('3.4 GB');
    expect(formatBytes(2 * 1024 ** 4)).toBe('2.0 TB');
  });
});

describe('api client', () => {
  it('sends credentials-bearing JSON requests', async () => {
    const mock = stubFetch(200, { username: 'admin', mustChangePassword: false });
    await api.login('admin', 'pw');

    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ username: 'admin', password: 'pw' });
  });

  it('maps error responses to ApiError with status and code', async () => {
    stubFetch(401, { error: 'invalid_credentials' });
    const err = await api.login('admin', 'bad').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('invalid_credentials');
  });

  it('falls back to a generic code when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json');
        },
      }))
    );
    const err = await api.status().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('request_failed');
  });

  it('encodes search parameters in file queries', async () => {
    const mock = stubFetch(200, { total: 0, items: [] });
    await api.files('IMG 0001 & more', 50);
    const [url] = mock.mock.calls[0] as unknown as [string];
    expect(url).toBe('/api/files?search=IMG%200001%20%26%20more&offset=50');
  });
});
