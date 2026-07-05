import { createHash } from 'crypto';
import { createReadStream } from 'fs';

export type SessionStatus =
  | 'pending'
  | 'confirmed'
  | 'running'
  | 'done'
  | 'failed'
  | 'dismissed';

export interface AnnounceFile {
  /** Path relative to the card root, forward slashes. */
  name: string;
  size: number;
  mtimeMs?: number;
}

export interface AnnounceRequest {
  clientName: string;
  cardLabel: string;
  files: AnnounceFile[];
}

export interface BackupSession {
  id: number;
  clientName: string;
  cardLabel: string;
  status: SessionStatus;
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

/** Internal file record including the server-side storage path. */
export interface FileRecord {
  id: number;
  sha256: string;
  size: number;
  originalName: string;
  destPath: string;
  sessionId: number | null;
  backedUpAt: string;
}

/** File metadata exposed over the API (no internal storage path). */
export type FilePublicRecord = Omit<FileRecord, 'destPath'>;

export interface ServerConfig {
  /** Glob-lite patterns (e.g. "*.THM") matched against file names, case-insensitive. */
  ignorePatterns: string[];
  /** Skip the frontend prompt and start backups as soon as a card is announced. */
  autoConfirm: boolean;
}

export interface ProgressUpdate {
  doneBytes: number;
  filesDone: number;
  filesSkipped: number;
  currentFile: string | null;
}

/** Streaming SHA-256 of a file on disk, lowercase hex. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Case-insensitive match of a file name against simple wildcard patterns ("*" only). */
export function matchesAnyPattern(fileName: string, patterns: string[]): boolean {
  const name = fileName.toLowerCase();
  return patterns.some((p) => {
    const rx = new RegExp(
      '^' +
        p
          .toLowerCase()
          .split('*')
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*') +
        '$'
    );
    return rx.test(name);
  });
}
