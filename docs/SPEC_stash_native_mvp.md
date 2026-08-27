# Stash Native MVP — Time Ledger

Status: implementation
Target: macOS 14+
Product direction: Time Ledger

## Product decision

The selected native direction is the light, time-oriented Time Ledger. The
existing web application remains untouched while the native product proves its
daily workflow. Agent activity is explicitly deferred. It must not occupy
navigation, the primary canvas, or the status bar in this MVP.

Opening Stash must answer these questions in under three seconds:

1. What should I do today, and in what order?
2. Is today's plan committed or still changing?
3. What matters in the next seven days?
4. What long-term work should not be forgotten?

## Core daily contract

Stash creates an explainable daily plan automatically. The user does not drag
tasks into order.

- The planner considers active work, overdue deadlines, work scheduled for
  today, manual Today pins, priority, due-soon work, and task age.
- Deferred, completed, cancelled, and unavailable long-term tasks are excluded.
- A normal plan contains five to eight tasks. It may contain fewer only when
  fewer eligible tasks exist.
- Each planned task exposes one short reason for its position.
- `Lock today` freezes the ordered task IDs for the calendar day. Completing,
  editing, or deferring a task still updates that task, but unrelated captures
  cannot silently reorder the locked plan.
- `Replan` is available only while the plan is unlocked. A new calendar day
  creates a fresh unlocked plan automatically.

## Information architecture

The permanent destinations are:

- `Today`: ordered daily plan, completion progress, and short/long horizons.
- `Inbox`: fast captures that still need a date, horizon, or project.
- `Upcoming`: scheduled and due work outside today.
- `Projects`: projects and their remaining tasks.
- `Review`: today completion and deferred-work summary.

Search is a global action, not a destination. Settings and agent sessions are
deferred until they have a real product contract.

## Required interactions

- Capture a task from every destination with Return or the Add button.
- Parse the useful subset of the existing capture grammar: `#project`,
  `^p0..^p3`, `!today`, `!tomorrow`, and `*30m` / `*2h`.
- Complete or reopen a task.
- Mark a task active, move it to Today, schedule it for tomorrow, defer it, or
  move it to the long-term horizon.
- Select any task and edit its title, notes, project, priority, estimate, and
  horizon in the persistent right inspector.
- Delete only after explicit confirmation.
- Use `Command-N` for capture, `Command-K` for search, and `Command-1...5` for
  destinations.
- Persist every mutation locally and show saving failures visibly.

## Data and persistence

The native MVP owns a versioned Codable workspace stored under Application
Support. The store contains projects, tasks, and the current daily plan. Writes
are atomic and coalesced off the main actor. The first launch seeds realistic
local examples so the complete interaction can be judged; later launches load
the user's saved workspace.

This persistence is intentionally independent from the current Bun/SQLite web
runtime. A migration or shared data adapter can be designed after the native
workflow is accepted.

## Performance contract

- No network, server, third-party package, background polling, or agent scan at
  launch.
- Stable task identity and cached daily-plan output; navigation must not trigger
  planner work.
- Disk writes never block the UI actor.
- Search feedback is debounced and works against 10,000 local tasks without a
  visible pause.
- Planner and JSON round-trip performance receive repeatable tests.
- Release build launches as a normal `.app`; idle CPU should settle near zero.

## Visual contract

Preserve the selected Time Ledger composition: a narrow navigation rail, a
dominant center ledger, and a 300-point horizon or inspector rail. Use system
typography, thin separators, generous white space, and a restrained slate-blue
accent. Do not introduce dashboards, card grids, gradients, glass, decorative
motion, or a permanent agent footer.

The physical scene is a developer at a quiet daylight desk opening the app
many times per day. The interface should feel like a well-kept paper ledger
with native controls, not a planning ceremony.

## Files

- `native/prototypes/time-ledger/Package.swift`
- `native/prototypes/time-ledger/Sources/StashCore/*`
- `native/prototypes/time-ledger/Sources/StashTimeLedger/*`
- `native/prototypes/time-ledger/Sources/StashCoreChecks/*`
- `native/prototypes/time-ledger/scripts/package_app.sh`

## Acceptance

- A fresh user can capture, plan, lock, complete, defer, edit, search, and
  recover their data after relaunch.
- Today contains an explainable five-to-eight-item plan without drag-and-drop.
- Short-term and long-term work are visible from Today.
- Every permanent navigation item opens a real surface.
- No Agent status is shown.
- `swift run StashCoreChecks` and a release build pass. The current standalone
  Command Line Tools image does not ship XCTest or Swift Testing.
- A packaged app is opened and visually inspected at the default and minimum
  window sizes.
- Fresh measurements cover planner speed, persistence round-trip, launch time,
  idle CPU, and memory.
