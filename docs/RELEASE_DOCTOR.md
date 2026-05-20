# Release Doctor

Use this checklist before handing stash to a clean macOS user or cutting a local release.

## Install

```sh
bun --version
bun install
cd server && bun install
cd ../client && bun install
cd ..
```

stash requires the Bun version declared in `package.json`.

## Seed and Run

```sh
STASH_DB_PATH=/tmp/stash-demo.db bun run seed:rich:sessions

STASH_DB_PATH=/tmp/stash-demo.db CLAUDE_ROOT=/tmp/stash-rich-claude \
  bun run server:dev

bun run client:dev
```

Open `http://localhost:5173`. The server listens on `http://localhost:4174`.

## Diagnose

```sh
bun run doctor
```

The doctor checks:

- Bun version against `package.json`.
- SQLite DB parent path from `STASH_DB_PATH`, or the default `~/.local/share/stash/stash.db`.
- Claude session root from `CLAUDE_ROOT`, defaulting to `~/.claude`.
- Codex session root from `CODEX_ROOT`, defaulting to `~/.codex`.
- Server port `4174` with `/health`.
- Client port `5173`.

Warnings mean stash can still run, but the affected scanner or port should be reviewed.
Failures should be fixed before release.

## Validate

```sh
bun run typecheck
bun run test:all
bun run client:build
bun run client:e2e
```

`bun run client:e2e` covers every README concept route, all 16 ConceptSwitcher entries,
and both canonical `/c/g/:sessionId` and provider-qualified `/c/g/:provider/:sessionId`
session deep links.
