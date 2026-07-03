import fs from 'node:fs';
import { matchesAnyPattern, sha256File } from '@framekeeper/shared';
import type { ClientConfig } from './config';
import { ServerApi } from './api';
import { scanCard, type CameraCard, type CardFile } from './drives';

const CONFIRMATION_POLL_MS = 2000;
const CONFIRMATION_TIMEOUT_MS = 15 * 60 * 1000;

export async function runBackup(config: ClientConfig, api: ServerApi, card: CameraCard): Promise<void> {
  const allFiles = scanCard(card.root);
  const files = allFiles.filter((f) => !matchesAnyPattern(f.relPath, config.ignorePatterns));
  if (files.length === 0) {
    console.log(`[${card.label}] no files to back up`);
    return;
  }

  const { sessionId, status, ignorePatterns: serverPatterns } = await api.announce({
    clientName: config.clientName,
    cardLabel: card.label,
    files: files.map((f) => ({ name: f.relPath, size: f.size, mtimeMs: f.mtimeMs })),
  });
  console.log(`[${card.label}] announced session ${sessionId} (${files.length} files), status=${status}`);

  if (status === 'pending') {
    const confirmed = await waitForConfirmation(api, sessionId);
    if (!confirmed) {
      console.log(`[${card.label}] session ${sessionId} dismissed or timed out`);
      return;
    }
  }

  // Apply server-side ignore patterns too, so both configs are honored.
  const workList = files.filter((f) => !matchesAnyPattern(f.relPath, serverPatterns));

  let doneBytes = 0;
  let filesDone = 0;
  let filesSkipped = 0;
  let failure: string | undefined;

  for (const file of workList) {
    try {
      const outcome = await backupOneFile(config, api, sessionId, file);
      if (outcome === 'skipped') filesSkipped++;
      else filesDone++;
    } catch (err) {
      failure = `${file.relPath}: ${(err as Error).message}`;
      console.error(`[${card.label}] FAILED ${failure}`);
      break;
    }
    doneBytes += file.size;
    await api.reportProgress(sessionId, {
      doneBytes,
      filesDone,
      filesSkipped,
      currentFile: file.relPath,
    });
  }

  await api.complete(sessionId, failure);
  console.log(
    `[${card.label}] session ${sessionId} ${failure ? 'failed' : 'done'}: ${filesDone} backed up, ${filesSkipped} already known`
  );
}

async function backupOneFile(
  config: ClientConfig,
  api: ServerApi,
  sessionId: number,
  file: CardFile
): Promise<'uploaded' | 'skipped'> {
  const digest = await sha256File(file.absPath);

  const { exists } = await api.digestExists(digest);
  if (!exists) {
    // Server writes, re-reads and verifies before responding OK.
    await api.upload(sessionId, file.absPath, file.relPath, digest, file.mtimeMs);
  }

  // Delete from the card only after the server has a verified copy.
  if (config.deleteAfterBackup) {
    fs.rmSync(file.absPath);
  }
  return exists ? 'skipped' : 'uploaded';
}

async function waitForConfirmation(api: ServerApi, sessionId: number): Promise<boolean> {
  const deadline = Date.now() + CONFIRMATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const session = await api.getSession(sessionId);
    if (session.status === 'confirmed' || session.status === 'running') return true;
    if (session.status === 'dismissed') return false;
    await new Promise((r) => setTimeout(r, CONFIRMATION_POLL_MS));
  }
  return false;
}
