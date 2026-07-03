# FrameKeeper

Camera SD card backup system with two components:

- **Server** (containerized): receives files over an authenticated HTTP API, verifies every
  upload's SHA-256 on disk before acknowledging it, records digests in SQLite, and serves the
  web frontend (progress, history, configuration, API tokens).
- **Client** (native Windows, runs as a service): watches for inserted SD cards (removable
  volumes with a `DCIM` folder), announces them to the server, and — once you confirm in the
  frontend — hashes, deduplicates and uploads each file. Files are deleted from the card only
  after the server has confirmed a verified copy, and only if you opted in.

```
packages/
  server/     Fastify + SQLite (node:sqlite) backend
  client/     Windows client (detection, hashing, upload)
  frontend/   Preact SPA served by the server
  shared/     Shared types + hashing helpers
```

Contributing (human or agent)? Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — it
describes the design, core invariants and conventions. Outstanding work is tracked in
[docs/TODO.md](docs/TODO.md).

## Server deployment (Docker)

```bash
docker compose up -d --build
```

Environment variables (see `docker-compose.yml`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `FK_DATA_DIR` | `/data` | SQLite database location |
| `FK_BACKUP_DIR` | `/backups` | Where backed-up files are stored (`YYYY/MM/DD/...`) |

Everything else (ignore patterns, auto-confirm) is stored in the database and configured from
the frontend Settings page.

### First login

Open `http://<server>:8080`, sign in with `admin` / `admin`. You will be forced to set a new
password before anything else is accessible. All API endpoints require authentication; passwords
and tokens are stored salted and hashed (scrypt / salted SHA-256), never in clear.

### Create an API token for each client

Settings -> API tokens -> enter a name -> Create. The token (`fk_..._...`) is displayed **once**;
copy it into the client's `config.yaml`. Tokens can be revoked from the same page.

## Client setup (Windows)

```powershell
cd packages/client
copy config.example.yaml config.yaml   # then edit serverUrl + apiToken
npm run build -w @framekeeper/client   # from the repo root
npm run start -w @framekeeper/client   # run in the foreground to test
```

`config.yaml` options:

| Key | Default | Purpose |
| --- | --- | --- |
| `serverUrl` | — | Base URL of the server |
| `apiToken` | — | Token created in the frontend |
| `clientName` | hostname | Name shown in the frontend |
| `pollIntervalMs` | `3000` | Drive scan interval |
| `deleteAfterBackup` | `false` | Delete card files after server-verified backup |
| `ignorePatterns` | `[]` | File name patterns to skip (`*.THM`, ...) |

### Install as a Windows service (starts with the PC)

From an **elevated** shell:

```powershell
cd packages/client
npm run service:install     # registers "FrameKeeper Client"
npm run service:uninstall   # removes it
```

## Backup integrity flow

1. Client computes the SHA-256 of each file on the card.
2. `GET /api/digests/:sha` — if the server already has it, the upload is skipped.
3. Otherwise the file is streamed to the server, which writes it to a temp file, **re-reads it
   from disk and recomputes the digest**, and only acknowledges on a match (a mismatch deletes
   the partial file and returns an error).
4. Only after that acknowledgement — and only when `deleteAfterBackup: true` — does the client
   remove the file from the card.

## Development

```bash
npm install
npm run build          # shared -> server -> client -> frontend
npm test               # unit tests for all packages (vitest)
npm run smoke          # end-to-end test with a fake card (uses FK_WATCH_DIRS)
npm run dev:frontend   # Vite dev server proxying /api to localhost:8080
```

On non-Windows platforms the client watches directories listed in `FK_WATCH_DIRS`
(`;`-separated) instead of removable volumes, which is how the smoke test simulates a card.

Note: run the server behind HTTPS (reverse proxy) when exposing it beyond your LAN — API tokens
travel as bearer headers.
