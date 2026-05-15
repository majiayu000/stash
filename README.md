# stash

Todo + Agent Workboard. Inbox-first task capture; Claude/Codex sessions are evidence, not the product.

## Quick start

```sh
bun install
bun run seed              # populate sample data
bun run server:dev        # http://localhost:4174
# in another shell
bun run client:dev        # http://localhost:5173
```

## Architecture

See [`SPEC.md`](./SPEC.md).

- `shared/` — TypeScript type definitions used by both server and client.
- `server/` — Bun + Hono + `bun:sqlite`. Owns work items, areas, evidence, and Claude/Codex scanners.
- `client/` — React + Vite + Tailwind. Eight top-level pages (Overview, Inbox, Todo, Projects, Workboard, Sessions, Evidence, Analytics).
- `docs/reference/` — read-only source material (PRD, mockups, original workbench exploration).

## Tests

```sh
bun run server:test       # domain unit + adapter unit + API integration
bun run client:test       # component + hook (vitest)
bun run client:e2e        # Playwright golden paths
bun run test:all
bun run typecheck
```

## Data

State lives in `$STASH_DB_PATH` (default `~/.local/share/stash/stash.db`). SQLite WAL mode, single-process.

Claude session source: `$CLAUDE_ROOT` (default `~/.claude`).
Codex session source: `$CODEX_ROOT` (default `~/.codex`).

## Slices

| Slice | What | Status |
|---|---|---|
| 1 | Inbox + manual todo core (Overview, Inbox, Todo) | in progress |
| 2 | Claude session scanner + link sessions to work items | pending |
| 3 | Codex session adapter (provider-neutral) | pending |
| 4 | Progress evidence + completion candidate flow | pending |
