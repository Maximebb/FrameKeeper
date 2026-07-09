# Release process

FrameKeeper releases two artifacts from this repository:

- **Server**: a Docker image at `ghcr.io/maximebb/framekeeper-server`.
- **Client**: a self-contained Windows artifact (`framekeeper-client-vX.Y.Z.zip`)
  plus a one-liner install script, attached to each GitHub release.

## How a release happens

```
push to main ──> CI (build/test/smoke)
            ──> Server image (main): push ghcr image tagged $IMAGE_TAG
            ──> Semantic release: analyze commits, create tag vX.Y.Z + GitHub
                release with generated notes (only when a releasable commit
                landed)
                     │
tag vX.Y.Z ──────────┴──> Release (tag):
                            • build + push ghcr image :vX.Y.Z
                            • promote :latest (unless it would downgrade)
                            • build client zip, attach zip + install script
                              to the GitHub release
```

### Push to main

- `.github/workflows/server-image-main.yml` builds the server image and pushes
  it as `ghcr.io/maximebb/framekeeper-server:$IMAGE_TAG`, where `IMAGE_TAG` is
  an environment **variable** on the `main` GitHub environment (e.g. `edge` or
  `main`). The workflow fails with a clear error if the variable is unset.
- `.github/workflows/semantic-release.yml` runs
  [semantic-release](https://semantic-release.gitbook.io/) with the config in
  `.releaserc.json`. It inspects commits since the last release using the
  [Conventional Commits](https://www.conventionalcommits.org/) convention
  (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:`/`!` → major), and when a
  release is due it pushes the `vX.Y.Z` tag and creates the GitHub release with
  generated notes. Commits that don't follow the convention are ignored by the
  analyzer, so nothing is released for them.

### Tag `vX.Y.Z`

`.github/workflows/release-tag.yml` triggers on any `v*.*.*` tag push (from
semantic-release or pushed manually) and runs two jobs:

- **Server image**: builds and pushes
  `ghcr.io/maximebb/framekeeper-server:vX.Y.Z`, then decides whether to move
  `latest`:
  - If no `latest` exists, the new tag becomes `latest`.
  - Otherwise it finds which prior `vX.Y.Z` tag the current `latest` digest
    corresponds to. If `latest` doesn't match any release tag it is left
    untouched (with a warning). If the new version is `>=` the current one,
    `latest` is re-pointed to it; older versions (e.g. a backported patch)
    never downgrade `latest`.
- **Client release**: builds the client on a Windows runner, stages a
  self-contained artifact with `scripts/package-client.mjs` (compiled `dist/`,
  production `node_modules` including `@framekeeper/shared`, and
  `config.example.yaml`), zips it, and attaches the zip plus
  `scripts/install-framekeeper-client.ps1` to the GitHub release. If the tag
  was pushed manually and no release exists yet, one is created with
  auto-generated notes.

## Installing the client from a release

From an elevated PowerShell:

```powershell
iwr -useb https://github.com/Maximebb/FrameKeeper/releases/latest/download/install-framekeeper-client.ps1 | iex
```

The script verifies Node.js 20+, downloads the matching client zip, extracts it
to `%ProgramData%\FrameKeeper\client`, prompts for `serverUrl`/`apiToken` on
first install (preserved on upgrades), and registers/starts the
"FrameKeeper Client" Windows service. Overrides via environment variables:
`FK_VERSION`, `FK_INSTALL_DIR`, `FK_SERVER_URL`, `FK_API_TOKEN`.

## One-time repository setup

1. **`main` environment**: Settings → Environments → New environment `main`,
   then add an environment *variable* `IMAGE_TAG` (e.g. `edge`). All release
   jobs declare `environment: main`, so environment secrets/variables are only
   exposed to them. Set the deployment branch policy to **Selected branches
   and tags** and allow both the `main` branch and the `v*` tag pattern —
   otherwise the tag-triggered release jobs are rejected with "not allowed to
   deploy". Don't add required reviewers unless you want to manually approve
   every release run.
2. **Tag protection**: Settings → Rules → Rulesets → New tag ruleset targeting
   `v*`, restricting creation/update/deletion. Add yourself (repo admin) to the
   bypass list so semantic-release (running with your PAT) and manual tags
   still work.
3. **`RELEASE_TOKEN` secret**: create a fine-grained PAT scoped to this repo
   with **Contents: Read and write**, and add it as a secret named
   `RELEASE_TOKEN` **on the `main` environment** (the semantic-release job
   runs in that environment, so a repository-wide secret is not needed). This
   matters for two reasons: tags pushed with the default `GITHUB_TOKEN` do
   **not** trigger other workflows (so the tag release would never run), and
   the PAT lets semantic-release bypass the tag ruleset.
4. **GHCR package permissions**: after the first push creates the
   `framekeeper-server` package, make it public if you want unauthenticated
   pulls (package settings → Change visibility), and confirm the repository has
   *Admin*/*Write* access on the package so workflows can keep pushing.
5. **Conventional Commits**: use `feat:`/`fix:`/etc. going forward (squash-merge
   titles count when squash merging), otherwise semantic-release will never cut
   a release.

## Manual release

If you prefer not to rely on semantic-release for a given release:

```bash
git tag v1.2.3 && git push origin v1.2.3
```

The tag workflow builds and publishes everything and creates the GitHub
release with auto-generated notes after a short grace period (it first waits
~2 minutes to let semantic-release create the release when the tag came from
automation).
