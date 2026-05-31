# stash

A local-first todo + AI-agent workbench. Capture in milliseconds, manage with one
hand on the keyboard, and pull the right context forward when you start working.

Built for power users who live between a terminal, a todo list, and an AI coding
assistant. Single user, single device, no cloud, no auth, no telemetry.

## Why

Generic todo apps don't know your agent ran for four hours yesterday and made
three decisions. Generic agent dashboards don't help you triage tomorrow's work.
stash sits between them. Your todos point at projects; your projects gather
lessons, decisions and Claude/Codex sessions; the next time you start work, the
context surfaces itself.

## Quick start

```sh
# 1) Install
bun install

# Optional: check local paths and dev servers before first launch
bun run doctor

# 2) Install the capture CLI into ~/.local/bin/stash
bun run install:cli

# 3) Seed a believable demo (areas, todos, projects, milestones, decisions, lessons,
#    plus one fake Claude JSONL so analytics has data to chew on)
STASH_DB_PATH=/tmp/stash-demo.db bun run seed:rich:sessions

# 4) Start the server
STASH_DB_PATH=/tmp/stash-demo.db CLAUDE_ROOT=/tmp/stash-rich-claude \
  bun run server:dev          # http://localhost:4174

# 5) Start the client (in another shell)
bun run client:dev            # http://localhost:5173
```

Open `http://localhost:5173`. The default top navigation follows the first-user
path: Home -> Inbox/Todo -> Project -> Session/Evidence -> Settings.

Try UI capture from the default page:

```txt
press c, type: fix login #aurora ^p1 !tomorrow @auth *45m, press Enter
```

Try shell capture from a normal shell after `bun run install:cli`:

```sh
stash doctor
stash add "fix login #aurora ^p1 !tomorrow @auth *45m"
```

## Verification

Use the verify gate before handing off a change:

```sh
bun run verify     # local gate: strict doctor + typecheck/tests/build/e2e
bun run verify:ci  # CI gate: isolated e2e ports and database
```

GitHub Actions runs `bun run verify:ci` for pull requests and pushes to `main`.

## Daily flow

```
Capture:        press  c  →  type "fix login #aurora ^p1 !tomorrow @auth *45m"  →  enter
                or:    stash add "fix login #aurora ^p1 !tomorrow @auth *45m"   (CLI)
Triage:         j / k  to walk inbox, t/n/s/d for pin/plan/someday/drop
Multi-select:   v to mark, V to mark all, action keys apply to all marked
Find:           Cmd+K  search title/description/labels
Smart lists:    `  toggles a chip row: overdue / today-pinned / p0 / etc
Detail:         Enter on a row opens the modal; edit anything; ✓ done; Cmd+Z undo
Reminders:      ConceptN → enable browser notifications; reminderAt fires automatically
```

## The 16 concept pages

stash renders the same data through 16 different lenses. Pick the one that
matches what you're doing:

| route | concept | when |
|---|---|---|
| `/`              | E — capture & board | default; daily triage |
| `/c/a`           | A — card wall | project-first browse |
| `/c/b`           | B — multi-project board | drag work across projects |
| `/c/c`           | C — hero + stream | one project in focus, live agent feed on the right |
| `/c/d`           | D — constellation | all projects as glowing nodes, click to inspect |
| `/c/e`           | E — inbox & 4-col board | same as `/` |
| `/c/f`           | F — file picker | jump by file path |
| `/c/g/:sessionId` | G — session detail | what the agent did |
| `/c/h`           | H — cost & burn | spend per project / model / day |
| `/c/i`           | I — ⌘K palette | global search |
| `/c/j`           | J — weekly review | what shipped, what's stale |
| `/c/k/:projectId`| K — project workbench | intent / milestones / decisions / notes / lessons |
| `/c/l/:workItemId`| L — todo detail | edit anything, link sessions |
| `/c/m`           | M — skills library | install + bind skills to projects |
| `/c/n`           | N — settings | themes, projects CRUD, notifications |
| `/c/o`           | O — start session dispatcher | composes prompt + spawns claude / codex |
| `/c/prd`         | PRD | product requirements |

Use the floating switcher (top-right) to jump between concepts.

## Capture token grammar

Quick Capture (`c`) and the CLI (`stash …`) both parse the same inline tokens:

| token | example | meaning |
|---|---|---|
| `#project` | `#aurora` | resolves to an area name (case-insensitive) |
| `@tag` | `@auth` | adds a label |
| `^p0..^p3` | `^p1` | sets priority |
| `!date` | `!tomorrow` / `!fri` / `!next-tue` / `!2026-05-20` | `scheduledFor` |
| `!!date` | `!!2026-05-30` | `dueAt` (the deadline, not the start) |
| `*duration` | `*45m` / `*2h` | estimate in minutes |

Anything that doesn't match falls into the `unresolved` field so the original
text is never lost; the raw input is also stored in `rawInput` for re-parsing.

## CLI install and diagnostics

`bun run install:cli` symlinks `tools/stash` into `~/.local/bin/stash` by
default. Override the destination with `STASH_CLI_DIR=/path/to/bin`; rerun with
`--force` if that path already has an older `stash` command.

```sh
bun run install:cli
stash doctor
stash add "write release notes #stash ^p2 !today"
```

If the server runs somewhere other than `http://localhost:4174`, set:

```sh
export STASH_BASE_URL=http://localhost:4174
stash doctor
```

`tools/stash doctor` works without installing the CLI and checks the same
server reachability path.

## Architecture

```
shared/   types used by both ends (Area, WorkItem, Skill, Lesson, Decision, …)
server/   Bun + Hono + bun:sqlite
          • domain/      services (work-item, area, project-knowledge, skill,
                                    capture, analytics/burn, analytics/weekly)
          • adapters/    Claude + Codex JSONL parsers + aggregator
          • web/         routes + Zod schemas + error mapper
          • db/          migrations 001…007
client/   React + Vite + 7-theme system
          • workbench/   the shell + concepts/ (16 files) + shared widgets
          • api/         one wrapper per backend domain
tools/    stash CLI binary + install script (doctor probes /health; capture
          POSTs to /api/work-items/capture)
docs/     SPEC v0.1 / v0.2 / v0.3 / v0.4
          (workbench design, friction-zero capture, Todo lifecycle + weekly review UX)
```

The DB is one SQLite file. `STASH_DB_PATH` always wins. Without an override,
the default is `~/Library/Application Support/stash/stash.db` on macOS and
`${XDG_DATA_HOME:-~/.local/share}/stash/stash.db` elsewhere.

Existing macOS users are protected during the path transition: if the new
`~/Library/Application Support/stash/stash.db` file does not exist, stash keeps
using an existing prior default at `~/.local/share/stash/stash.db` or legacy
`~/Library/Application Support/stash/app.db` so existing data does not
disappear. To migrate explicitly, stop the server, back up the existing DB, copy
it to `~/Library/Application Support/stash/stash.db`, then rerun
`bun run doctor --strict`; or set `STASH_DB_PATH` to the existing file.

Backups default to a `backups/` directory next to the DB. Override with
`STASH_BACKUP_DIR`.

```sh
bun run db:backup
bun run db:restore -- /path/to/stash-backup.db
```

Existing on-disk databases are backed up automatically before pending migrations
run. See [`docs/DATA_SAFETY.md`](./docs/DATA_SAFETY.md) for backup, restore, and
migration-safety details.

Claude/Codex JSONL roots: `CLAUDE_ROOT` (default `~/.claude`), `CODEX_ROOT`
(default `~/.codex`).

## Tests

```sh
bun run typecheck        # server + client TypeScript
bun run server:test      # 204 domain + route tests
bun run client:test      # 2 vitest hook tests
bun run client:e2e       # 9 Playwright golden paths
bun run test:all
bun run doctor           # local install / paths / port checks
bun run doctor --strict  # fail on missing first-run state or unreachable dev servers
```

The pre-commit hook (VibeGuard) runs guards inline; no setup needed beyond
`bun install`.

## Production readiness

The app is usable as a local-first beta, but it is not yet production-hardened.
The current production plan is tracked in
[`docs/PRODUCTION_READINESS.md`](./docs/PRODUCTION_READINESS.md).

Current highest-priority gaps:
- Session and analytics scans are computed on demand and can block pages when the
  local Claude/Codex history is large.
- The canonical G route is `/c/g/:sessionId`; provider-qualified deep links are
  a hardening target, not the current route contract.
- Browser-level e2e coverage proves the main flows, but not every concept page
  has a dedicated golden-path test yet.

## What ships vs what's deferred

**Shipped today** (0.1.12):
- All 16 concept pages render from real backend data
- Quick Capture + CLI capture with token grammar
- Inbox triage keyboard layer with multi-select + undo + help overlay (`?`)
- Global search (`Cmd+K`) + smart-lists chip row (`` ` ``)
- Today list with manual pin + auto-promote, drag-reorder via fractional `sortOrder`
- Cross-column drag between Inbox / Today / Doing / Later
- Recurrence engine (RRULE-lite + Things-style `after_completion`) with picker
- Reminder timestamps + browser notifications (opt-in)
- Project workbench: editable intent / milestones / decisions / notes / lessons
  (now with ✎ edit on decisions and lessons + cross-project toggle)
- Project CRUD UI: scaffold-new and edit-existing with description + review cadence
- Todo detail: inline checklist (✓/✗ steps inside one todo) alongside subtasks
- Inferred completion evidence: scan, accept (✓ done), or reject from the agent trace
- Skills library: search + tabs filter, install/uninstall, per-project bindings,
  new-skill creation, delete with binding cleanup, install command copy
- Session detail: real transcript / tool-call summary / files-touched
- Decision candidate extraction from JSONL (accept/ignore inline)
- Real ConceptO dispatcher: composes a prompt, spawns Claude / Codex subprocess
- Analytics: 30-day burn (daily spend / hourly heatmap / model mix / per-project)
  with Codex token-usage extracted from rollout JSONLs
- Weekly review snapshot (WoW pairs, focus hours, done-by-project, stale digest)
- Settings: 7 themes, project CRUD, notifications opt-in
- Persisted budgets (scope × period uniqueness, 409 on conflict)

**Deferred** (real new features, not wiring):
- Voice capture (Whisper local)
- Browser extension / native global hotkey
- Multi-device sync (CRDT or Tailscale)
- Daily-plan generation a la Motion / Sunsama
- Real "calendar" / "terminal feed" concepts (the current ConceptC/D are
  hero+stream and constellation — repurpose or add new letters)

See [`docs/SPEC_v0.3.md`](./docs/SPEC_v0.3.md) for the most recent SPEC and
[`docs/SPEC_v0.2.md`](./docs/SPEC_v0.2.md) for the original workbench design.

## License

Personal use only for now. No license file = no permission to redistribute.
File an issue if you want one.
