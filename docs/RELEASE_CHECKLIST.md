# Release Checklist

Use this before tagging or handing stash to a new local user.

## Install

```sh
bun install
bun run doctor
```

`doctor` checks the Bun version, resolved DB path, Claude/Codex roots, and the
default server/client ports.

## Seed And Run

```sh
STASH_DB_PATH=/tmp/stash-demo.db bun run seed:rich:sessions
STASH_DB_PATH=/tmp/stash-demo.db CLAUDE_ROOT=/tmp/stash-rich-claude bun run server:dev
bun run client:dev
```

Open `http://localhost:5173/`.

Direct routes:

- `/` or `/c/e`: Capture & Plan
- `/c/a` through `/c/o`, plus `/c/prd`: concept pages
- `/c/g`: latest or first available session detail shell
- `/c/g/:sessionId`: session detail
- `/c/k`: first available project workbench
- `/c/k/:projectId`: project workbench
- `/c/l`: first available todo detail
- `/c/l/:workItemId`: todo detail

## Verify

```sh
bun run typecheck
bun run server:test
bun run client:test
bun run client:build
bun run client:e2e
```

`client:e2e` includes route coverage for every concept switcher entry:
`/`, `/c/a`, `/c/b`, `/c/c`, `/c/d`, `/c/e`, `/c/f`, `/c/g`, `/c/h`,
`/c/i`, `/c/j`, `/c/k`, `/c/l`, `/c/m`, `/c/n`, `/c/o`, and `/c/prd`.

## Diagnose

```sh
bun run doctor
```

Common warnings:

- `db file not found`: run a seed command or start the server once.
- `Claude root not found` / `Codex root not found`: set `CLAUDE_ROOT` or
  `CODEX_ROOT` to fixture or local agent-log directories.
- `server health unreachable`: start `bun run server:dev`, or set `PORT` if
  another process owns `4174`.
- `client dev server unreachable`: start `bun run client:dev`.
