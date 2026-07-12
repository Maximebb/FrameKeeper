# FrameKeeper — How to use

FrameKeeper backs up camera SD cards to a central server. A **Windows client** on the machine
with the card reader detects insertions, hashes files, and uploads them. The **server** (usually
Docker on a NAS or always-on host) verifies every file on disk, stores it, and serves this web
frontend for confirmation, progress, and configuration.

The client never stores backups; the server never reads SD cards.

## Initial setup

### First login

Open the server in a browser (`http://<server>:8080` on your LAN, or your HTTPS URL if behind
a reverse proxy). Sign in with `admin` / `admin`. You will be forced to set a new password
before anything else is accessible.

### Create an API token for each client PC

Go to **Settings → API tokens**, enter a name, and click **Create**. The token
(`fk_..._...`) is displayed **once** — copy it into that machine's client `config.yaml`.
Tokens can be revoked from the same page.

### Client configuration

On each Windows PC with a card reader, edit `packages/client/config.yaml` (see
`config.example.yaml`):

| Key | Default | Purpose |
| --- | --- | --- |
| `serverUrl` | — | Base URL of the server (`http://…` on LAN, `https://…` behind a proxy) |
| `apiToken` | — | Token created above |
| `clientName` | hostname | Name shown in this frontend |
| `pollIntervalMs` | `3000` | How often to scan for newly inserted drives |
| `deleteAfterBackup` | `false` | Delete card files after the server confirms a verified backup |
| `ignorePatterns` | `[]` | File name patterns to skip (`*.THM`, `*.LRV`, …) |

Install the client as a Windows service so it starts with the PC (see the project README for
build and install commands).

Server-side settings (**Settings** in this frontend) include ignore patterns and
**auto-confirm** (skip the confirmation prompt and start backups immediately).

## Day-to-day workflow

1. Insert a camera SD card into a Windows PC running the FrameKeeper client service.
2. The client detects the card (removable volume with a `DCIM/` folder) and announces the file
   list to the server.
3. A prompt appears on the **Dashboard** (unless auto-confirm is enabled). Confirm to start the
   backup, or dismiss to ignore the card.
4. The client hashes each file, skips anything the server already has (by SHA-256), and uploads
   the rest. Progress appears live on the Dashboard.
5. When finished, the session moves to **History**. If `deleteAfterBackup: true` in the client's
   `config.yaml`, verified files are removed from the card; otherwise the card is left intact.

Re-inserting a card after removal triggers a new detection and prompt.

## Backup process

1. **Detection** — the client polls removable drives every few seconds. A volume qualifies when
   it is removable, not the system drive, and contains `DCIM/`.
2. **Announce** — the client scans `DCIM/`, applies its local `ignorePatterns`, and sends the
   file list to the server. The server applies its own ignore patterns (from Settings), creates
   a backup session, and notifies this frontend in real time.
3. **Confirmation** — you confirm here (or the server auto-confirms if configured). The client
   polls until the session is confirmed, dismissed, or times out (15 minutes).
4. **Per file:**
   - Client computes SHA-256 on the card.
   - If the server already has that digest, the upload is skipped (global deduplication — the
     same bytes are stored once regardless of card or client).
   - Otherwise the file is streamed to the server, which writes a temp file, **re-reads it from
     disk and recomputes the digest**, and only acknowledges on a match. A mismatch deletes the
     partial file and returns an error; the client stops at the first failure.
   - Verified files are stored under `YYYY/MM/DD/<filename>` on the server (date from the
     file's mtime on the card; `_1`, `_2`, … suffix on name collisions).
5. **Delete (opt-in)** — only after the server confirms a verified copy (or the digest already
   existed), and only when `deleteAfterBackup: true`, does the client remove the file from the
   card. Default is `false`.

Both client `ignorePatterns` and server ignore patterns (Settings) are applied — a file is
backed up only if neither side excludes it.

## Choosing a deployment model

FrameKeeper separates **where cards are read** (Windows client) from **where files are stored**
(Docker server). Pick a layout based on where your card readers live and where you want backups
to land.

| | **Server on NAS / always-on host** | **Server on the same PC as the client** |
| --- | --- | --- |
| **Best for** | Central backup store, multiple card-reading PCs, large storage | Quick single-machine setup, no separate host |
| **`serverUrl`** | `http://<nas-ip>:8080` on LAN | `http://127.0.0.1:8080` or `http://localhost:8080` |
| **Backup files** | NAS volume bind-mounted to `/backups` in compose | Local `./backups` folder (or any host path) |
| **Database** | Named Docker volume on the NAS host | Same — persists in the container volume |
| **Frontend** | Browse to the NAS address from any device on the LAN | Browse to `localhost:8080` on that PC |

| | **Plain HTTP on LAN** | **HTTPS via reverse proxy** |
| --- | --- | --- |
| **Best for** | Home network only; server not reachable from the internet | Remote access, untrusted networks, internet exposure |
| **`serverUrl`** | `http://192.168.x.x:8080` | `https://framekeeper.example.com` |
| **Setup** | `docker compose up` — no extra layers | TLS-terminating proxy in front of port 8080 |
| **Security note** | Acceptable when the server stays on a trusted LAN | Recommended whenever client traffic crosses an untrusted link — API tokens are sent on every request |

### Typical setups

- **Home NAS (most common)** — run `docker compose` on the NAS, mount `./backups` to your photo
  library share, install the Windows client service on each PC with a card reader. Use
  `http://<nas-ip>:8080` on the LAN. Open this frontend from a phone or laptop to confirm
  backups.
- **Single Windows PC** — run Docker Desktop (or the server locally) on the same machine, point
  the client at `http://127.0.0.1:8080`. Backups land in the local `./backups` directory.
  Simplest topology; no network dependency after setup.
- **Remote / multi-site** — keep the server on a NAS or VPS, put it behind HTTPS, and set each
  client's `serverUrl` to the public URL. Create one API token per client machine so you can
  revoke access individually.

**What stays the same in every model:** the client never stores backups; the server never reads
SD cards; uploads are verified on disk before acknowledgement; card deletion remains opt-in on
each client.
