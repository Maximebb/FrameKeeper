export interface Session {
  id: number;
  clientName: string;
  cardLabel: string;
  status: 'pending' | 'confirmed' | 'running' | 'done' | 'failed' | 'dismissed';
  totalBytes: number;
  doneBytes: number;
  totalFiles: number;
  filesDone: number;
  filesSkipped: number;
  currentFile: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface BackedUpFile {
  id: number;
  sha256: string;
  size: number;
  originalName: string;
  backedUpAt: string;
}

export interface ServerConfig {
  ignorePatterns: string[];
  autoConfirm: boolean;
}

export interface TokenInfo {
  token_id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string
  ) {
    super(code);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let code = 'request_failed';
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ username: string; mustChangePassword: boolean }>('POST', '/api/auth/login', {
      username,
      password,
    }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => request<{ username: string; mustChangePassword: boolean }>('GET', '/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('POST', '/api/auth/change-password', { currentPassword, newPassword }),

  status: () => request<{ session: Session | null }>('GET', '/api/status'),
  sessions: () => request<{ sessions: Session[] }>('GET', '/api/sessions'),
  files: (search: string, offset = 0) =>
    request<{ total: number; items: BackedUpFile[] }>(
      'GET',
      `/api/files?search=${encodeURIComponent(search)}&offset=${offset}`
    ),

  confirmSession: (id: number) => request<{ ok: true }>('POST', `/api/sessions/${id}/confirm`),
  dismissSession: (id: number) => request<{ ok: true }>('POST', `/api/sessions/${id}/dismiss`),

  getConfig: () => request<ServerConfig>('GET', '/api/config'),
  putConfig: (config: ServerConfig) => request<ServerConfig>('PUT', '/api/config', config),

  listTokens: () => request<{ tokens: TokenInfo[] }>('GET', '/api/tokens'),
  createToken: (name: string) =>
    request<{ token: string; tokenId: string; name: string }>('POST', '/api/tokens', { name }),
  revokeToken: (tokenId: string) => request<{ ok: true }>('DELETE', `/api/tokens/${tokenId}`),
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}
