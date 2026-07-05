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

## Documentation

| Doc | Audience |
| --- | --- |
| [docs/USAGE.md](docs/USAGE.md) | Operators — workflow, backup process, deployment models. Also rendered in the frontend **Guide** page (same file, bundled at build time). |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Contributors — design, invariants, conventions |
| [docs/TODO.md](docs/TODO.md) | Outstanding work |

## Build and deploy

FrameKeeper is always **client–server**: the server stores backups and serves the web UI; the
client runs on the Windows machine where you insert SD cards.

### Server (Docker)

```bash
docker compose up -d --build
```

Environment variables (see `docker-compose.yml`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `FK_DATA_DIR` | `/data` | SQLite database location |
| `FK_BACKUP_DIR` | `/backups` | Where backed-up files are stored (`YYYY/MM/DD/...`) |
| `FK_FRONTEND_DIR` | *(built into image)* | Static frontend files (override only for custom builds) |
| `FK_SECURE_COOKIES` | `false` | Set to `true` when serving over HTTPS (sets `Secure` on session cookies) |
| `FK_TRUST_PROXY` | `false` | Set to `true` when behind a TLS reverse proxy |
| `FK_ADMIN_PASSWORD` | `admin` | Initial admin password on first boot (default forces change on login) |

The compose file mounts a named volume for the database and `./backups` on the host for photo
storage. Runtime settings (ignore patterns, auto-confirm) live in the database and are edited
from the frontend Settings page.

For HTTPS, TLS, first login, API tokens, and deployment topology choices, see
[docs/USAGE.md](docs/USAGE.md).

### Client (Windows)

```powershell
cd packages/client
copy config.example.yaml config.yaml   # then edit serverUrl + apiToken
npm run build -w @framekeeper/client   # from the repo root
npm run start -w @framekeeper/client   # run in the foreground to test
```

Config path override: `FK_CLIENT_CONFIG`. Full option reference: [docs/USAGE.md](docs/USAGE.md).

#### Install as a Windows service

From an **elevated** shell:

```powershell
cd packages/client
npm run service:install     # registers "FrameKeeper Client"
npm run service:uninstall   # removes it
```

Build the client once before installing the service (`npm run build -w @framekeeper/client`
from the repo root).

### Development

```bash
npm install
npm run build          # shared -> server -> client -> frontend
npm test               # unit tests for all packages (vitest)
npm run smoke          # end-to-end test with a fake card (uses FK_WATCH_DIRS)
npm run start:server   # local server (set env vars as needed)
npm run start:client   # local client (needs config.yaml)
npm run dev:frontend   # Vite dev server proxying /api to localhost:8080
```

On non-Windows platforms the client watches directories listed in `FK_WATCH_DIRS`
(`;`-separated) instead of removable volumes, which is how the smoke test simulates a card.
