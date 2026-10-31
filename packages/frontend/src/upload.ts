import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import { matchesAnyPattern } from '@shared/patterns';
import { api, type UploadProgress } from './api';

const HASH_CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * Incremental SHA-256 of a browser file, read in chunks so large videos are never
 * held in memory. Pure JS (not WebCrypto) so it also works over plain HTTP.
 */
export async function sha256Blob(blob: Blob): Promise<string> {
  const hash = sha256.create();
  for (let offset = 0; offset < blob.size; offset += HASH_CHUNK_BYTES) {
    hash.update(new Uint8Array(await blob.slice(offset, offset + HASH_CHUNK_BYTES).arrayBuffer()));
  }
  return bytesToHex(hash.digest());
}

/** Path relative to the picked folder when a folder was chosen, else the bare file name. */
export function relativeName(file: File): string {
  return file.webkitRelativePath || file.name;
}

/** Folder name for a folder selection, otherwise a generic label. */
export function selectionLabel(files: File[]): string {
  const roots = new Set(files.map((f) => (f.webkitRelativePath || '').split('/')[0]));
  const [root] = roots;
  return roots.size === 1 && root ? root : 'Manual upload';
}

/**
 * Same flow as the native client, for files the user picked: announce, confirm
 * (picking the files is the confirmation), then per file hash -> digest check ->
 * upload (server verifies before acknowledging) -> progress, and finally complete.
 * Throws on the first failure, after marking the session failed.
 */
export async function uploadFiles(
  files: File[],
  onProgress: (progress: UploadProgress) => void = () => undefined
): Promise<UploadProgress> {
  const { sessionId, status, ignorePatterns } = await api.announce({
    clientName: 'Browser',
    cardLabel: selectionLabel(files),
    files: files.map((f) => ({ name: relativeName(f), size: f.size, mtimeMs: f.lastModified })),
  });
  if (status === 'pending') await api.confirmSession(sessionId);

  const workList = files.filter((f) => !matchesAnyPattern(relativeName(f), ignorePatterns));
  const progress: UploadProgress = { doneBytes: 0, filesDone: 0, filesSkipped: 0, currentFile: null };
  let failure: string | undefined;

  for (const file of workList) {
    const name = relativeName(file);
    onProgress({ ...progress, currentFile: name });
    try {
      const digest = await sha256Blob(file);
      const { exists } = await api.digestExists(digest);
      if (exists) progress.filesSkipped++;
      else {
        await api.uploadFile(sessionId, file, name, digest, file.lastModified);
        progress.filesDone++;
      }
    } catch (err) {
      failure = `${name}: ${(err as Error).message}`;
      break;
    }
    progress.doneBytes += file.size;
    progress.currentFile = name;
    // Rejected with 409 if the session was cancelled from the Dashboard.
    await api.reportProgress(sessionId, progress);
    onProgress({ ...progress });
  }

  await api.completeSession(sessionId, failure);
  if (failure) throw new Error(failure);
  return progress;
}
