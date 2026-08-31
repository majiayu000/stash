# Stash Native SwiftUI Prototypes

Status: comparison prototypes
Target: macOS 14+
Runtime: SwiftUI only, no server, network, database, or third-party package

## Goal

Build three independently runnable native macOS prototypes so the product
direction can be judged in real windows instead of static mockups. Each window
must answer, within three seconds:

1. What am I doing now?
2. What are today's five to eight tasks?
3. What matters in the short term?
4. What remains important in the long term?

Code-agent activity is visible but secondary. All data is local mock data and
all interactions are ephemeral.

## Shared product brief

The user is a single developer opening Stash repeatedly throughout the day on a
Mac. The physical scene is a quiet desk in neutral daylight: they want instant
orientation without being managed by a dashboard. The emotional target is
minimal, calm, and technically precise.

References are Notion's information restraint, Claude Code's directness, and
Warp's keyboard fluency. These are behavioral anchors, not visual skins.

### Shared constraints

- Native SwiftUI executable package, buildable with Command Line Tools.
- System typography and SF Symbols only.
- One restrained accent; no gradients, glass, neon, decorative illustration,
  metric tiles, nested cards, or fake terminal chrome.
- Mock six Today tasks, two short-term items, two long-term items, and one code
  agent activity.
- Controls must be real SwiftUI controls with keyboard focus and accessible
  labels. At minimum, task completion and row selection are interactive.
- Window is useful around 1180 x 760 and has a sensible minimum size.
- Each prototype owns its own package and does not share source files with the
  other prototypes during comparison.

## Prototype A: Time Ledger

Path: `native/prototypes/time-ledger`
Window title: `Stash · Time Ledger`

Light, paper-like, and structured around time. A narrow navigation rail anchors
the left edge, Today's six-row ledger dominates the center, and a right horizon
column exposes `This week` and `Long term`. Agent activity is one quiet footer
line. Use whitespace and one-pixel dividers rather than cards.

The hierarchy is Today first, horizon second, navigation third, agent status
fourth. The prototype should feel complete but slightly more information-rich
than the other light direction.

## Prototype B: Quiet Workbench

Path: `native/prototypes/quiet-workbench`
Window title: `Stash · Quiet Workbench`

Light mineral surfaces with no conventional sidebar. A compact capture toolbar
sits at the top. A single `In progress` strip establishes the current task. The
body uses an asymmetric split: a broad Today list and a narrow horizon rail for
`Next 7 days`, `Someday`, and `Agents`. Selection uses a muted sage surface.

The hierarchy is current work first, Today second, future and agent summaries
third. This is the quietest and least chrome-heavy direction.

## Prototype C: Command Canvas

Path: `native/prototypes/command-canvas`
Window title: `Stash · Command Canvas`

A restrained dark native utility for keyboard-heavy work. A narrow icon rail
supports a unified canvas with `Add or find a task` at the top and a visible
`Today / Soon / Long term` scope switch. The task list is dense and a persistent
right inspector explains the selected task and its agent activity. Surfaces use
tinted charcoal rather than pure black; depth comes from surface lightness and
separators, not shadows.

The hierarchy is command input and selected scope first, task rows second,
inspector third. It must remain a graphical macOS utility, not a terminal skin.

## Interaction and state scope

These are comparison prototypes, not production task managers. Required:

- Toggle completion for Today tasks.
- Select a task and visibly update its selection or inspector.
- Accept text in the capture/search field.
- Preserve clear focus behavior and avoid hover-only functionality.

Not required: persistence, errors, loading, real agents, reminders, drag and
drop, settings, sync, or task editing.

## Verification

For every package:

1. `swift build` succeeds from a clean package directory.
2. The executable launches and produces the named macOS window.
3. The primary state is visually inspected at its default size.
4. Text is readable, no region clips, and the primary hierarchy matches the
   corresponding direction.
