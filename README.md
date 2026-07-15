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

Open `http://localhost:5173`. The primary navigation exposes five stable product
sections: Work, Projects, Sessions, Review, and Settings. Entity pages keep their
own semantic URLs, such as `/todos/:id`, `/projects/:id`, and `/sessions/:id`.

Try UI capture from the default page:

```txt
press c, type: fix login #aurora ^p1 !tomorrow @auth *45m, press Enter
press c, type: morning routine :system @daily, press Enter
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
Detail:         Enter on a row opens its full page; edit anything; ✓ done; Cmd+Z undo
Reminders:      Settings → enable browser notifications; reminderAt fires automatically
Systems:        create with :system, open the 🔁 systems chip, Run system, complete the Run
```

## Mobile capture boundary

The workbench is desktop-first, with responsive navigation and readable compact
layouts for checking work on a narrow screen. Off-computer capture can use the
same capture API instead of a separate mobile product:
`stash add "..."` when a shell is available, or `POST /api/work-items/capture`
from a trusted local shortcut/automation pointed at the running server.

## Product navigation and routes

The persistent application navigation has five destinations: Work, Projects,
Sessions, Review, and Settings. Creation flows and entity details are entered
from the object they act on, rather than appearing as unrelated destinations.

| route | purpose |
|---|---|
| `/` | capture, Inbox, Today, Doing, and Later |
| `/todos/:workItemId` | edit one task, inspect evidence, or start a connected session |
| `/projects` | find or create projects |
| `/projects/new` | create a project |
| `/projects/:projectId` | project intent, milestones, decisions, notes, lessons, tasks, and sessions |
| `/projects/:projectId/settings` | edit or delete one project |
| `/sessions` | live agents and session history |
| `/sessions/new?todoId=...` | start a session from a specific task |
| `/sessions/:sessionId` | transcript, tools, files, related task, and project context |
| `/review` | weekly review and next-week planning |
| `/review/usage` | token, cost, model, project, and budget review |
| `/settings` | themes, notifications, and budgets |
| `/settings/skills` | skill registry and project bindings |

`Cmd+K` searches globally; it is an action overlay, not a page.

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
| `:system` / `kind:system` | `morning routine :system` | creates a reusable System template |

Anything that doesn't match falls into the `unresolved` field so the original
text is never lost; the raw input is also stored in `rawInput` for re-parsing.

## Systems / reusable flows

Systems are reusable WorkItem templates for routines and checklists. A System is
created with `kind=system`, usually through Quick Capture (`:system`) or the API.
It is a template, so it cannot be marked done. Open the built-in SmartLists
`🔁 systems` chip, choose a template, then use `Run system` to create an
independent Run with a fresh checklist copy. Complete the Run, not the template.

The rich seed includes three examples: Morning routine, Packing checklist, and
Airbnb turnover. Each has checklist steps and a historical Run so the System
detail page shows prior execution history immediately after seeding.

More detail lives in [`docs/PRD_systems.md`](docs/PRD_systems.md) and
[`docs/PLAN_systems.md`](docs/PLAN_systems.md).

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
          • workbench/   application shell + semantic pages + shared widgets
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
bun run server:test      # server domain + route tests
bun run client:test      # client unit/component tests
bun run client:e2e       # Playwright golden paths + semantic route coverage
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
- Background refresh for very large Claude/Codex histories is still deferred;
  current scans are bounded by route limits, singleflight, and per-file cache.
- The canonical session route is `/sessions/:sessionId`; provider-qualified deep links are
  a hardening target, not the current route contract.
- Release packaging is still personal-use only; no public OSS license is granted.

## What ships vs what's deferred

**Shipped today** (0.1.13):
- Five stable product sections plus semantic entity and action routes
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
- Connected session starter: composes a prompt and spawns Claude / Codex
- Analytics: 30-day burn (daily spend / hourly heatmap / model mix / per-project)
  with Codex token-usage extracted from rollout JSONLs
- Weekly review snapshot (WoW pairs, focus hours, done-by-project, stale digest)
- Settings: 7 themes, notifications opt-in, budgets, and skills
- Persisted budgets (scope × period uniqueness, 409 on conflict)

**Deferred** (real new features, not wiring):
- Voice capture (Whisper local)
- Browser extension / native global hotkey
- Multi-device sync (CRDT or Tailscale)
- Daily-plan generation a la Motion / Sunsama
- Calendar planning and a richer live activity feed

See [`docs/SPEC_v0.4.md`](./docs/SPEC_v0.4.md) for the current task lifecycle
specification. [`docs/SPEC_v0.2.md`](./docs/SPEC_v0.2.md) records the superseded
multi-lens design and is retained only as project history.

## Access, license, and launch boundary

This repository is public for personal transparency and review, but it is not an
open-source release. There is intentionally no `LICENSE` file, which means no
permission is granted to copy, modify, redistribute, package, or operate stash
for others.

Current access status:
- Personal-use local beta.
- No hosted service, release artifact, support SLA, security program, or public
  plugin ecosystem.
- GitHub issues are for project tracking, not guaranteed support.

Current caveats:
- Designed for a single trusted local user.
- Not hardened for multi-user auth, public network exposure, or shared machines.
- Reads local Claude/Codex session files; review configured paths before use.
- Back up SQLite data before migration or distribution experiments.

If this becomes a real OSS launch later, the required next steps are: choose and
add a license, add contributing/security/support docs, publish release artifacts,
and update repository topics and launch copy to match the granted permissions.
