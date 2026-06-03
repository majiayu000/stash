# Stash Skills UX SPEC

Status: active for Concept M

## Goal

Make Skills feel like a product capability manager instead of a raw API catalog. Users should be able to create a skill, understand whether it is available, install/uninstall it, bind it to projects, and delete it without seeing browser-native dialogs or API implementation details.

## Principles

1. No user-facing API instructions. API routes are internal implementation details.
2. No browser-native `prompt`, `alert`, or `confirm` in Skills flows.
3. Manual create is supported now. Import and runtime scan are future work until the backend exists.
4. Source, status, and bindings must be visible on the primary screen.
5. A skill being installed is not the same as being bound to a project.
6. Destructive actions require an in-app confirmation dialog.
7. Validation and request failures appear inline or as in-app notices.

## Current Data Model

`Skill` fields available to the client:

- `id`
- `name`
- `emoji`
- `description`
- `source`: `official | community`
- `stars`
- `installed`
- `version`
- `createdAt`
- `updatedAt`

Project binding fields:

- `projectId`
- `skillId`
- `enabled`
- `boundAt`

## Concepts

### Availability

`installed = true` means the skill is available in the local Stash library. It does not mean the skill is active on a project.

### Binding

A project binding means the skill will be auto-loaded when starting a session for that project. This is the real activation surface in v0.2.

### Source

`official` means Stash-provided or trusted starter content. `community` means user-created local content. Until import sources exist, Stash must not imply a skill came from GitHub, runtime scan, or marketplace.

## Page Requirements

### Header

The top bar must include:

- Search input across name, ID, and description.
- Filters: all, installed, bound, official, community.
- `+ new skill` CTA.

### Empty State

When no skills exist:

- Show `no skills registered`.
- Show concise copy: create a skill here, then bind it to projects.
- Show `+ new skill`.
- Do not mention `POST /api/skills`.

### Skill Card

Each card must show:

- Emoji
- Name
- Source badge
- Installed/not installed state
- Binding avatars or binding count
- Short description

### Detail Panel

The selected skill detail must show:

- Name, source, stars, binding count.
- Description.
- Status summary:
  - Installed or not installed.
  - Bound project count.
  - Source.
- Installation command may remain as developer-oriented metadata only if it does not replace product actions.
- Install/uninstall button.
- Delete button.
- Project bindings section with explicit toggles.
- Bound projects section.

## Create Skill Flow

Trigger:

- `+ new skill` from header or empty state.

Interaction:

- Open an in-app modal.
- Fields:
  - Name, required.
  - ID, required, auto-generated from name until user edits it.
  - Icon, optional, defaults to puzzle piece.
  - Description, optional.
- Submit creates a `community` skill with `installed: true`.
- Success closes modal, selects the new skill, and shows an in-app notice.
- Failure stays in the modal and shows inline error.

Not allowed:

- `window.prompt`
- `window.alert`
- `window.confirm`
- Direct API endpoint copy in UI.

## Delete Skill Flow

Trigger:

- Delete button in detail panel.

Interaction:

- Open an in-app confirmation dialog.
- Show skill emoji, name, and ID.
- Explain that project bindings will be removed.
- Confirm performs delete.
- Success closes dialog, removes the skill from list, and shows notice.
- Failure stays in dialog and shows inline error.

## Install / Uninstall Flow

Current backend only exposes `installed`. Therefore:

- Toggle via `PATCH /api/skills/:id`.
- Label must be `install` or `uninstall`.
- Do not imply this toggles project activation.
- Project activation remains in project bindings.

Future:

- Introduce a separate `enabled` or `visibility` field if global enablement becomes distinct from local installation.

## Project Binding Flow

Current implementation can use row toggles because the binding list is already visible in the detail panel.

Future upgrade:

- Add a multi-select binding dialog for bulk review.
- Show `All projects`, individual project toggles, and current binding count.

## Future Import Flow

Not in current implementation. Do not create fake UI actions unless they are disabled with clear "not supported yet" copy.

Future `Add skill` chooser:

- Create manually.
- Import from GitHub/URL.
- Scan local skills.
- Browse marketplace.

Required backend additions:

- Import route.
- Source metadata.
- File bundle storage.
- Import limits and explicit failure on missing files.
- Runtime scan API.

## Verification

Before closing a Skills UX change:

1. `rg -n "window\\.(prompt|alert|confirm)" client/src/workbench/concepts/ConceptM.tsx client/src/workbench/concepts/conceptM.styles.ts`
2. `bun run client:typecheck`
3. `bun run client:test`
4. `bun run client:build`
5. Browser smoke on `/skills`:
   - Empty state does not mention `POST /api/skills`.
   - Create opens in-app dialog.
   - Create succeeds with no native browser dialog.
   - Delete opens in-app confirmation.
   - Delete succeeds with no native browser dialog.
