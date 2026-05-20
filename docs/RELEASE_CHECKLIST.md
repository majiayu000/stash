# Release Runbook

Use this before tagging, handing stash to a new local user, or cutting a demo
build. The goal is to prove install, first run, capture, routes, verification,
backup, restore, and rollback from a clean checkout.

## 1. Clean Checkout

```sh
git clone https://github.com/majiayu000/stash.git stash-release
cd stash-release
git status --short
bun install
```

Expected:

- `git status --short` is empty before release edits.
- `bun install` completes without lifecycle-script failures.
- Bun satisfies `package.json` engines: `>=1.1.0`.

## 2. First-Run Database

Use an explicit DB path for release proof so local user data is not touched.

```sh
export STASH_DB_PATH=/tmp/stash-release.db
rm -f "$STASH_DB_PATH"
bun run doctor
bun run seed:rich:sessions
test -f "$STASH_DB_PATH"
```

Expected:

- Before seeding, `doctor` may warn that the DB file is missing.
- `seed:rich:sessions` creates the DB and fixture agent-session roots.
- `test -f "$STASH_DB_PATH"` exits 0.

## 3. Start Server And Client

Terminal A:

```sh
export STASH_DB_PATH=/tmp/stash-release.db
export CLAUDE_ROOT=/tmp/stash-rich-claude
bun run server:dev
```

Terminal B:

```sh
bun run client:dev
```

Terminal C:

```sh
bun run doctor --strict
```

Expected:

- Server listens on `http://localhost:4174`.
- Client listens on `http://localhost:5173`.
- `doctor --strict` has no warnings once DB, server, client, and agent roots
  are all available.

Open `http://localhost:5173/`.

## 4. CLI Install And Capture

```sh
bun run install:cli
./tools/stash doctor
./tools/stash "release shell capture @demo ^p2 !today *15m"
```

Expected:

- `./tools/stash doctor` resolves the same DB path and server health.
- The shell capture appears in the UI after refresh.
- `bun run install:cli` may also install a `stash` shim into the configured bin
  directory; `./tools/stash` is the repo-local proof path.

## 5. UI Smoke

In the browser at `http://localhost:5173/`:

1. Press `c`.
2. Enter `release UI capture @demo ^p2 !today *15m`.
3. Confirm the item appears in Inbox.
4. Press `/`, search for `release UI capture`, and open the result.
5. Mark the todo done, then reopen it.
6. Open a project page and confirm intent/decisions/lessons panels render.
7. Open Concept O from a todo and compose/dispatch a prompt.

Expected:

- Capture parses labels, priority, date, and estimate.
- Search, project detail, todo detail, and dispatch routes remain reachable.
- Dispatch result distinguishes composed/spawned/failure status.

## 6. Route Matrix

These routes must render without `Failed to load data`:

| Route | Purpose |
| --- | --- |
| `/`, `/c/e` | Capture and plan board |
| `/c/a` | Daily home |
| `/c/b` | Inbox triage |
| `/c/c` | Schedule/timeline |
| `/c/d` | Dependency map |
| `/c/f` | New/edit project |
| `/c/g` | Session list/detail shell |
| `/c/g/:sessionId` | Session detail |
| `/c/h` | Burn/budget analytics |
| `/c/i` | Command palette |
| `/c/j` | Weekly review |
| `/c/k` | Project workbench shell |
| `/c/k/:projectId` | Project workbench |
| `/c/l/:workItemId` | Todo detail |
| `/c/m` | Skill registry |
| `/c/n` | Preferences |
| `/c/o/:workItemId` | Agent dispatch |
| `/c/prd` | Product spec reference |

## 7. Verification Gates

Run the release gate after server/client are running:

```sh
bun run verify
```

`bun run verify` runs:

- `git diff --check`
- `bun run doctor --strict`
- `bun run typecheck`
- `bun run server:test`
- `bun run client:test`
- `bun run client:build`
- `bun run client:e2e`

CI uses isolated ports and a temp DB:

```sh
bun run verify:ci
```

Expected:

- Server tests pass.
- Client unit tests pass.
- Playwright route, mobile, modal, Quick Capture, todo detail, recurrence, and
  dispatch tests pass.
- `client:build` has no untracked Vite chunk warning. The current chunk policy
  emits `vendor`, `concepts`, and app chunks.

## 8. Backup And Restore Proof

With the release DB stopped or idle:

```sh
export DB=/tmp/stash-release.db
export BACKUP=/tmp/stash-release-backup.db
cp "$DB" "$BACKUP"
sqlite3 "$BACKUP" 'PRAGMA integrity_check;'
rm -f /tmp/stash-restore-proof.db
cp "$BACKUP" /tmp/stash-restore-proof.db
STASH_DB_PATH=/tmp/stash-restore-proof.db bun run doctor
```

Expected:

- `PRAGMA integrity_check;` prints `ok`.
- `doctor` resolves `/tmp/stash-restore-proof.db`.
- If server/client are not running for the restore proof, non-strict health
  warnings are acceptable; strict mode should pass once they are restarted with
  `STASH_DB_PATH=/tmp/stash-restore-proof.db`.

## 9. Rollback Proof

Before release, record the current production commit and DB backup:

```sh
git rev-parse HEAD
cp /tmp/stash-release.db /tmp/stash-release-pre-release.db
```

Rollback procedure:

```sh
git switch main
git pull --ff-only
git switch --detach <previous-good-commit>
cp /tmp/stash-release-pre-release.db /tmp/stash-release.db
STASH_DB_PATH=/tmp/stash-release.db bun run verify:ci
```

Expected:

- Code rolls back to the previous-good commit.
- DB restores from the pre-release backup.
- `verify:ci` passes on the rollback target.

Do not delete the pre-release DB backup until the replacement release has passed
the full gate and one manual smoke session.

## 10. Version And Changelog Policy

Before tagging:

1. Update `package.json` `version`.
2. If a `CHANGELOG.md` exists, add a dated entry with user-visible changes,
   migrations, warnings, and rollback notes.
3. If no `CHANGELOG.md` exists, put the same sections in the GitHub release
   body and open a follow-up issue to create a changelog.
4. Mention every DB migration file added since the previous release.
5. Link the release PRs and the final `bun run verify:ci` workflow run.

## 11. Warning Policy

Release-blocking warnings:

- `bun run verify` or `bun run verify:ci` exits non-zero.
- `doctor --strict` reports DB, server, client, or agent-root warnings during
  the release gate.
- `client:build` prints an untracked chunk-size warning.
- Playwright reports `Failed to load data`, unreachable concept routes, modal
  keyboard failure, or mobile route failure.
- SQLite backup integrity check is not `ok`.
- CLI capture does not land in the same DB as the UI.

Non-blocking warnings when documented in release notes:

- Non-strict `doctor` warnings before the DB is created on a clean first run.
- Non-strict server/client health warnings when intentionally running only CLI
  or backup/restore checks.
- Local `NO_COLOR` / `FORCE_COLOR` warnings from Playwright subprocess output.

## 12. Final Release Evidence

Attach these to the release PR or GitHub release:

- Commit SHA and version.
- `bun run verify:ci` workflow URL.
- Manual UI smoke notes.
- CLI capture command and observed item title.
- Backup path, restore path, and `PRAGMA integrity_check` result.
- Rollback commit and rollback verification result.
