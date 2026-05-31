# Release Checklist

Use this runbook before tagging stash or handing it to a new local user. It is
written for a clean checkout and must be run against the exact commit or tag
that will be released.

## 1. Release Inputs

Record these before running commands:

| Field | Value |
|---|---|
| Release version |  |
| Git commit or tag |  |
| Operator |  |
| Date |  |
| OS and Bun version |  |
| Database path |  |
| Backup path |  |

The release version must stay synchronized across:

- `package.json`
- `server/package.json`
- `client/package.json`
- `shared/package.json`
- `server/src/web/app-factory.ts` health response version

Every release also needs a changelog entry. If `CHANGELOG.md` does not exist
yet, create it in the release PR. The entry must include user-visible changes,
data or migration notes, known warnings, and rollback notes.

## 2. Clean Install

Start from a new clone or a freshly reset checkout:

```sh
git clone https://github.com/majiayu000/stash.git /tmp/stash-release
cd /tmp/stash-release
git checkout <release-tag-or-sha>
git status --short
bun --version
```

`git status --short` must print nothing. Bun must satisfy the `package.json`
engine requirement.

Install each package because this repository does not currently declare root
workspaces:

```sh
bun install
(cd server && bun install)
(cd client && bun install)
```

Blocking install warnings:

| Warning | Blocks release? | Required action |
|---|---:|---|
| Dependency install exits non-zero | Yes | Fix dependency or lockfile state. |
| Bun version is below the engine requirement | Yes | Upgrade Bun or lower the documented requirement in the same PR. |
| Peer or optional dependency warning with passing tests | No | Record it in the release notes. |

## 3. First-Run Database Creation

Use an isolated release database so the proof is repeatable:

```sh
export STASH_DB_PATH=/tmp/stash-release.db
export CLAUDE_ROOT=/tmp/stash-rich-claude
export CODEX_ROOT=/tmp/stash-rich-codex

rm -f "$STASH_DB_PATH" "$STASH_DB_PATH-wal" "$STASH_DB_PATH-shm"
STASH_DB_PATH="$STASH_DB_PATH" bun run server:start \
  > /tmp/stash-release-server.log 2>&1 &
export STASH_SERVER_PID=$!

until curl -fsS http://localhost:4174/health; do sleep 1; done
test -f "$STASH_DB_PATH"
curl -fsS http://localhost:4174/health
kill "$STASH_SERVER_PID"
wait "$STASH_SERVER_PID" 2>/dev/null || true
```

Expected result:

- The server creates the DB file.
- `/health` returns JSON with `ok: true`, `service: "stash"`, and the release
  version.
- `_migrations` exists in the DB.

Verify migrations directly:

```sh
sqlite3 "$STASH_DB_PATH" \
  "select id from _migrations order by id;"
sqlite3 "$STASH_DB_PATH" \
  "pragma integrity_check;"
```

`pragma integrity_check` must print `ok`.

## 4. Demo Seed

Seed the same DB with rich demo data and one fixture agent session:

```sh
STASH_DB_PATH="$STASH_DB_PATH" CLAUDE_ROOT="$CLAUDE_ROOT" \
  bun run seed:rich:sessions
```

Expected result:

- The command exits 0.
- The output reports seeded areas, skills, project knowledge, work items, and a
  fixture Claude JSONL path.
- Rerunning the command does not duplicate existing per-table data.

## 5. Server And Client Startup

Start the server:

```sh
STASH_DB_PATH="$STASH_DB_PATH" \
CLAUDE_ROOT="$CLAUDE_ROOT" \
CODEX_ROOT="$CODEX_ROOT" \
  bun run server:dev
```

In another shell, start the client:

```sh
bun run client:dev
```

Required checks:

```sh
curl -fsS http://localhost:4174/health
curl -fsS http://localhost:4174/api/overview
open http://localhost:5173/
```

Blocking startup warnings:

| Warning | Blocks release? | Required action |
|---|---:|---|
| Server cannot bind `4174` | Yes | Stop the conflicting process or document a `PORT` override. |
| Client cannot bind `5173` | Yes | Stop the conflicting process or run Vite on a documented port. |
| `/health` is unreachable or has the wrong version | Yes | Fix the server or version wiring. |
| Empty agent-session list with fixture roots | Yes | Fix seed or scanner configuration. |
| Empty agent-session list with real local roots only | No | Record as local-data dependent. |

## 6. CLI Install And Capture

Install the CLI in a temporary bin directory without touching the user's shell
profile:

```sh
mkdir -p /tmp/stash-release-bin
ln -sf "$PWD/tools/stash" /tmp/stash-release-bin/stash
PATH="/tmp/stash-release-bin:$PATH" stash --help
```

With the server still running, prove capture end to end:

```sh
PATH="/tmp/stash-release-bin:$PATH" \
STASH_BASE_URL=http://localhost:4174 \
  stash "release smoke capture #aurora ^p1 !tomorrow @release *15m"

curl -fsS "http://localhost:4174/api/work-items?status=inbox" \
  | grep "release smoke capture"
```

Blocking CLI warnings:

| Warning | Blocks release? | Required action |
|---|---:|---|
| `stash --help` exits non-zero | Yes | Fix executable bit, shebang, or Bun path. |
| CLI capture times out against a running server | Yes | Fix CLI request path or server capture endpoint. |
| Captured item is missing parsed tokens | Yes | Fix parser or capture endpoint before release. |

## 7. Route Matrix

Run these direct route checks in a browser with the client and server running.
No route may blank-screen, redirect unexpectedly, or hide API failures as empty
data.

| Route | Purpose | Required proof |
|---|---|---|
| `/` | Default Capture and Plan view | Workbench loads and capture is visible. |
| `/c/a` | Card wall | Page renders without console errors. |
| `/c/b` | Mission control | Page renders without console errors. |
| `/c/c` | Hero and stream | Page renders without console errors. |
| `/c/d` | Constellation | Page renders without console errors. |
| `/c/e` | Capture and board | Same data surface as `/`. |
| `/c/f` | Project edit | Page renders or shows an intentional empty state. |
| `/c/unknown` | Unknown concept recovery | Shows a recoverable invalid-concept state, not a blank page. |
| `/c/g` | Session detail default | Shows a fixture or local session when available. |
| `/c/g/:sessionId` | Session detail deep link | Opens the requested session. |
| `/c/h` | Cost and burn analytics | Charts render or show a real error state. |
| `/c/i` | Command palette concept | Page renders or shows an intentional empty state. |
| `/c/j` | Weekly review | Page renders or shows an intentional empty state. |
| `/c/k` | Project workbench default | Shows a project or intentional empty state. |
| `/c/k/:projectId` | Project workbench deep link | Opens the requested project. |
| `/c/l` | Todo detail default | Shows a todo or intentional empty state. |
| `/c/l/:workItemId` | Todo detail deep link | Opens the requested todo. |
| `/c/m` | Skills library | Skills list renders. |
| `/c/n` | Settings | Page renders without console errors. |
| `/c/o` | Session dispatcher | Prompt composer renders. |
| `/c/prd` | Product requirements | PRD page renders. |

Blocking route warnings:

| Warning | Blocks release? | Required action |
|---|---:|---|
| Blank screen or unhandled React exception | Yes | Fix before release. |
| Console error from a release path | Yes | Fix or explicitly downgrade with a linked issue and maintainer approval. |
| User-visible API failure rendered as empty data | Yes | Surface an error state and keep data honest. |
| Missing local data with a clear empty state | No | Record the fixture or seed used. |

## 8. Backup And Restore Proof

Create a backup while the release DB is known-good:

```sh
export STASH_BACKUP_PATH=/tmp/stash-release-backup.db
rm -f "$STASH_BACKUP_PATH"
sqlite3 "$STASH_DB_PATH" "pragma wal_checkpoint(TRUNCATE);"
sqlite3 "$STASH_DB_PATH" "vacuum into '$STASH_BACKUP_PATH';"
sqlite3 "$STASH_BACKUP_PATH" "pragma integrity_check;"
```

Expected result: `pragma integrity_check` prints `ok`.

Stop the release server from the startup check, then prove restore using a
separate DB path:

```sh
export STASH_RESTORE_PATH=/tmp/stash-release-restore.db
rm -f "$STASH_RESTORE_PATH" "$STASH_RESTORE_PATH-wal" "$STASH_RESTORE_PATH-shm"
cp "$STASH_BACKUP_PATH" "$STASH_RESTORE_PATH"

STASH_DB_PATH="$STASH_RESTORE_PATH" \
CLAUDE_ROOT="$CLAUDE_ROOT" \
CODEX_ROOT="$CODEX_ROOT" \
  bun run server:start > /tmp/stash-restore-server.log 2>&1 &
export STASH_RESTORE_PID=$!

until curl -fsS http://localhost:4174/health; do sleep 1; done
curl -fsS http://localhost:4174/api/overview
kill "$STASH_RESTORE_PID"
wait "$STASH_RESTORE_PID" 2>/dev/null || true
```

Blocking backup warnings:

| Warning | Blocks release? | Required action |
|---|---:|---|
| Backup command fails | Yes | Fix backup procedure or DB state. |
| Backup `integrity_check` is not `ok` | Yes | Stop release and investigate data corruption. |
| Restored DB cannot start the app | Yes | Fix migration or restore process. |
| Backup was not rerun after a migration change | Yes | Rerun backup and restore proof. |

## 9. Verification Commands

Run the current handoff gate:

```sh
bun run verify
```

For debugging, the expanded commands are:

```sh
bun run typecheck
bun run server:test
bun run client:test
bun run client:build
bun run client:e2e
bun run test:all
```

`bun run client:e2e` must cover every README concept route, all ConceptSwitcher
entries, and the documented G/K/L deep links.

Record results:

| Command | Status | Notes |
|---|---|---|
| `bun run typecheck` |  |  |
| `bun run server:test` |  |  |
| `bun run client:test` |  |  |
| `bun run client:build` |  |  |
| `bun run client:e2e` |  |  |
| `bun run test:all` |  |  |
| `bun run verify` |  |  |

Blocking verification warnings:

| Warning | Blocks release? | Required action |
|---|---:|---|
| Typecheck, unit, build, or e2e command exits non-zero | Yes | Fix before release. |
| Playwright browser is missing locally | No | Run `bun x playwright install chromium`, then rerun e2e. |
| E2E fails because a port is occupied | Yes | Rerun in an isolated environment and record the clean result. |
| `bun run verify` exists but fails | Yes | Fix before release. |

## 10. Rollback

Rollback requires both app code and DB state.

Prepare before release:

```sh
export PREVIOUS_RELEASE=<previous-tag-or-sha>
export NEW_RELEASE=<new-tag-or-sha>
export STASH_BACKUP_PATH=/tmp/stash-release-backup.db
test -f "$STASH_BACKUP_PATH"
```

Rollback app code:

```sh
git fetch --tags origin
git checkout "$PREVIOUS_RELEASE"
bun install
(cd server && bun install)
(cd client && bun install)
```

Rollback DB state:

```sh
export STASH_DB_PATH=/tmp/stash-release.db
cp "$STASH_DB_PATH" "$STASH_DB_PATH.after-failed-release"
rm -f "$STASH_DB_PATH" "$STASH_DB_PATH-wal" "$STASH_DB_PATH-shm"
cp "$STASH_BACKUP_PATH" "$STASH_DB_PATH"
sqlite3 "$STASH_DB_PATH" "pragma integrity_check;"
```

Restart and verify:

```sh
STASH_DB_PATH="$STASH_DB_PATH" \
CLAUDE_ROOT="$CLAUDE_ROOT" \
CODEX_ROOT="$CODEX_ROOT" \
  bun run server:start > /tmp/stash-rollback-server.log 2>&1 &
export STASH_ROLLBACK_PID=$!

until curl -fsS http://localhost:4174/health; do sleep 1; done
curl -fsS http://localhost:4174/health
curl -fsS http://localhost:4174/api/overview
kill "$STASH_ROLLBACK_PID"
wait "$STASH_ROLLBACK_PID" 2>/dev/null || true
```

Rollback is complete only when the previous app version starts against the
restored DB and the overview API returns data.

## 11. Release Decision

Release can proceed only when all blocking warnings are cleared.

| Gate | Status | Evidence |
|---|---|---|
| Clean install |  |  |
| First-run DB creation |  |  |
| Demo seed |  |  |
| Server/client startup |  |  |
| CLI capture |  |  |
| Route matrix |  |  |
| Backup and restore |  |  |
| Verification commands |  |  |
| Version bump |  |  |
| Changelog entry |  |  |
| Rollback proof |  |  |

If any blocking warning remains, do not tag the release. File or link the issue,
record the failed gate, and rerun this checklist after the fix.
