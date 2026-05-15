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
| 1 | Inbox + manual todo core (Overview, Inbox, Todo) | shipped |
| 2 | Claude session scanner + link sessions to work items | shipped |
| 3 | Codex session adapter (provider-neutral) | shipped |
| 4 | Progress evidence + completion candidate flow | shipped |

## Verification (last run)

- `bun run server:test` → **83/83 pass**, 227 assertions, ~95 ms
- `bun run client:test` → **11/11 pass** (vitest + RTL)
- `bun run client:e2e` → **4/4 pass** (Playwright: inbox-capture, link-session, codex-session, progress-evidence)
- `bun run typecheck` → clean both sides
- Manual smoke: `bun run server:start` boots in ~1 s, `bun run client:dev` boots in ~1 s, `/api/overview` returns 200 via Vite proxy `5173 → 4174`.
