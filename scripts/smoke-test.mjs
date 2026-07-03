// End-to-end smoke test: boots the server on a random port with temp dirs,
// exercises auth (forced password change), token creation, and a full
// client backup of a fake SD card, then verifies files landed with correct
// digests and were deleted from the "card".
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, '.smoke-tmp');
fs.rmSync(tmp, { recursive: true, force: true });
const dataDir = path.join(tmp, 'data');
const backupDir = path.join(tmp, 'backups');
const cardDir = path.join(tmp, 'card');
fs.mkdirSync(path.join(cardDir, 'DCIM', '100CANON'), { recursive: true });

// Fake card contents
const filesOnCard = {};
for (const name of ['IMG_0001.CR3', 'IMG_0002.CR3', 'MVI_0003.MP4']) {
  const content = randomBytes(256 * 1024 + Math.floor(Math.random() * 1024));
  const abs = path.join(cardDir, 'DCIM', '100CANON', name);
  fs.writeFileSync(abs, content);
  filesOnCard[name] = createHash('sha256').update(content).digest('hex');
}

const PORT = 18321;
const base = `http://127.0.0.1:${PORT}`;
let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};

const server = spawn('node', [path.join(root, 'packages/server/dist/index.js')], {
  env: { ...process.env, PORT: String(PORT), FK_DATA_DIR: dataDir, FK_BACKUP_DIR: backupDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

let client;
try {
  // Wait for the server to come up
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    try {
      const res = await fetch(`${base}/api/status`);
      up = res.status === 401; // up AND locked down
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  check(up, 'server up; /api/status requires auth (401 when anonymous)');

  // Login with default credentials
  let res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  const login = await res.json();
  const cookie = res.headers.get('set-cookie').split(';')[0];
  check(res.ok && login.mustChangePassword === true, 'default admin login demands password change');

  // Config should be blocked until the password is changed
  res = await fetch(`${base}/api/config`, { headers: { cookie } });
  check(res.status === 403, 'endpoints locked while password change pending (403)');

  // Change password
  res = await fetch(`${base}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ currentPassword: 'admin', newPassword: 'correct-horse-battery' }),
  });
  check(res.ok, 'password change accepted');

  res = await fetch(`${base}/api/config`, { headers: { cookie } });
  check(res.ok, 'config accessible after password change');

  // Old password must no longer work
  res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  check(res.status === 401, 'old default password rejected after change');

  // Create an API token for the client
  res = await fetch(`${base}/api/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ name: 'smoke-client' }),
  });
  const { token } = await res.json();
  check(res.ok && /^fk_[a-f0-9]+_/.test(token), 'API token created');

  // Bad token rejected
  res = await fetch(`${base}/api/digests/${'0'.repeat(64)}`, {
    headers: { Authorization: 'Bearer fk_deadbeef_notavalidsecret' },
  });
  check(res.status === 401, 'invalid API token rejected');

  // Auto-confirm so the client doesn't wait on the UI prompt
  res = await fetch(`${base}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ autoConfirm: true, ignorePatterns: [] }),
  });
  check(res.ok, 'autoConfirm enabled');

  // Write client config and run the client against the fake card
  const clientConfig = path.join(tmp, 'client-config.yaml');
  fs.writeFileSync(
    clientConfig,
    [
      `serverUrl: "${base}"`,
      `apiToken: "${token}"`,
      'clientName: "smoke-client"',
      'pollIntervalMs: 1000',
      'deleteAfterBackup: true',
      'ignorePatterns: []',
    ].join('\n')
  );

  client = spawn('node', [path.join(root, 'packages/client/dist/index.js')], {
    env: { ...process.env, FK_CLIENT_CONFIG: clientConfig, FK_WATCH_DIRS: cardDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  client.stdout.on('data', (d) => process.stdout.write(`[client] ${d}`));
  client.stderr.on('data', (d) => process.stderr.write(`[client] ${d}`));

  // Wait for the session to complete
  let done = false;
  for (let i = 0; i < 60 && !done; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const sessions = await (
      await fetch(`${base}/api/sessions`, { headers: { cookie } })
    ).json();
    done = sessions.sessions.some((s) => s.status === 'done');
  }
  check(done, 'backup session completed');

  // Verify backed-up files: correct count, correct digests on server disk
  const backed = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (!e.name.endsWith('.part')) backed.push(abs);
    }
  };
  walk(backupDir);
  check(backed.length === 3, `3 files stored on server (got ${backed.length})`);

  const storedDigests = new Set(
    backed.map((p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex'))
  );
  const allMatch = Object.values(filesOnCard).every((d) => storedDigests.has(d));
  check(allMatch, 'stored file digests match card originals');

  // Card should be empty (deleteAfterBackup: true, delete only after verify)
  const remaining = fs
    .readdirSync(path.join(cardDir, 'DCIM', '100CANON'))
    .filter((f) => !f.startsWith('.'));
  check(remaining.length === 0, 'card files deleted after verified backup');

  // Digest dedupe endpoint agrees
  const someDigest = Object.values(filesOnCard)[0];
  const dedupe = await (
    await fetch(`${base}/api/digests/${someDigest}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  check(dedupe.exists === true, 'digest lookup reports file as backed up');
} catch (err) {
  console.error('SMOKE TEST ERROR:', err);
  failures++;
} finally {
  client?.kill();
  server.kill();
}

console.log(failures === 0 ? '\nAll smoke tests passed.' : `\n${failures} smoke test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
