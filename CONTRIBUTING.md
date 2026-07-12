# Contributing to FrameKeeper

Thank you for your interest in FrameKeeper. Contributions from humans and AI coding agents are both welcome.

## Before you start

Read the docs that match your change:

| Doc | When to read it |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Design, invariants, and code conventions |
| [docs/USAGE.md](docs/USAGE.md) | Operator workflow and configuration |

## Pull request expectations

**Keep pull requests concise and minimal.** A small, focused change that solves one problem is much easier to review and merge than a large refactor or a bundle of unrelated fixes.

- **One concern per PR.** Do not mix feature work, refactors, formatting sweeps, and drive-by cleanups.
- **Smallest correct diff.** Change only what the task requires. Avoid renaming, reformatting, or restructuring code you are not touching for the fix.
- **Match existing style.** Follow patterns already used in the package you edit (naming, types, error handling, tests).
- **Tests when behavior changes.** Add or update tests when you change logic; skip tests for docs-only changes.
- **Clear description.** State what changed, why, and how you verified it (commands run, manual steps).

Large or sprawling PRs may be asked to be split before review.

## Agent contributions

AI agents (Cursor, Copilot, Claude Code, and similar tools) are encouraged to contribute, including via automated pull requests. The same rules apply:

1. **Stay in scope.** Implement only what was requested. Do not add extra features, speculative error handling, or "while I'm here" edits.
2. **Be minimal.** Prefer a 10-line fix over a 100-line rewrite. Reuse existing helpers and conventions instead of introducing new abstractions.
3. **Do not pad PRs.** Avoid verbose comments, unnecessary docs, or unrelated file changes to make a change look more substantial.
4. **Verify locally.** Run relevant checks before opening a PR (see below).

Maintainers review agent PRs the same way as human PRs: clarity, correctness, and diff size matter.

## Development workflow

```bash
npm install
npm run build
npm test
```

For end-to-end validation:

```bash
npm run smoke
```

Package layout and dev commands are summarized in [README.md](README.md).

## Submitting a pull request

1. Fork or branch from `main`.
2. Make a focused change with a descriptive commit message.
3. Ensure `npm test` passes (CI runs on every PR).
4. Open a pull request with a short summary and verification notes.

## Questions

Open a GitHub issue for bugs, feature ideas, or questions before starting large work. That helps avoid duplicate effort and keeps PRs aligned with project goals.
