# FrameKeeper — outstanding items

Things that were not (or could not be) verified during initial development, plus known gaps to
revisit. The core build and the end-to-end smoke test (`npm run smoke`) pass; everything below
is follow-up.

## Needs manual verification

- [ ] **Docker image**: Docker was not installed in the WSL environment used for development, so
      the image was never built. Run `docker compose up -d --build` and verify the server comes
      up, persists its database across restarts, and writes backups to the mounted volume.
- [ ] **Real SD card detection on Windows**: the client's removable-volume detection uses the
      `drivelist` native module (`packages/client/src/drives.ts`); its drive-to-card mapping is
      unit-tested, but enumeration was only exercised on Linux. Insert a real camera card on
      Windows and confirm detection, the frontend prompt, and a full backup. Also confirm the
      `drivelist` prebuilt binary installs cleanly on the target Windows machine.
- [ ] **Windows service registration**: `npm run service:install` (elevated shell, in
      `packages/client`) uses `node-windows`. Verify the service installs, starts at boot, and
      picks up `config.yaml` (the install script passes `FK_CLIENT_CONFIG` pointing at the
      package root).
- [ ] **Backup of very large files** (multi-GB video): the pipeline streams end to end, but
      memory use and upload duration have not been observed with real 4K footage.

## Known gaps / future work

- [ ] **HTTPS**: API tokens travel as bearer headers; put the server behind a TLS reverse proxy
      before exposing it beyond the local network.
- [ ] **Per-file retry / resume**: the client currently aborts the whole session at the first
      failed file. Add retries with backoff and the ability to resume a partially completed
      session.
- [ ] **Stale sessions**: a `pending` session that is never confirmed or dismissed stays pending
      forever (the client gives up waiting after 15 minutes, but the row remains). Add expiry or
      cleanup.
- [ ] **Card identity**: cards are identified by volume label only. Two cards with the same
      label are indistinguishable in history; consider the volume serial number.
- [ ] **Login rate limiting**: no brute-force protection on `POST /api/auth/login`.
- [ ] **SSE session expiry**: if the web session expires while the dashboard is open, the
      EventSource silently stops receiving events until the page is reloaded.
- [ ] **Single user**: only the seeded `admin` account exists; add user management if more
      accounts are needed.
- [ ] **Frontend component tests**: unit tests cover pure logic only (`api.ts` helpers).
      Rendering/interaction tests for the Preact views were skipped; add
      `@testing-library/preact` + jsdom if component coverage is wanted.
