# stash v0.2 — Implementation PLAN

Phased rollout of `docs/SPEC_v0.2.md`. Each phase ends with verification commands before advancing. **No backwards-compat hacks**: delete the v0.1 GitHub-style code path entirely.

Current hardening note: this is the historical v0.2 implementation plan. The
current production-readiness plan is [`docs/PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md).
The current canonical session-detail route is `/c/g/:sessionId`; provider-
qualified session links are a production hardening item, not the current router
contract.

---

## Phase 0 — Spec & alignment ✅ (this turn)

Output: `docs/SPEC_v0.2.md` + this `docs/PLAN.md` + 8 TaskCreate tasks (#15–#24).

Decision points open for user (see SPEC §8) — answer before Phase 3 starts.

---

## Phase 1 — Shared widgets + concept switcher + routing

Touches: `client/src/workbench/shared/`, `client/src/workbench/Workbench.tsx`, `client/src/App.tsx`.

Steps:
1. Add `client/src/workbench/shared/`:
   - `Topbar.tsx`, `ProgressBar.tsx`, `LiveDot` (already in effects), `StatusPill.tsx`, `ModelBadge.tsx`, `FeatDot.tsx`
   - `Tile.tsx`, `StatTile.tsx`, `ProjectCardFull.tsx`, `ProjectChipRow.tsx`
   - `SessionRow.tsx` (compact + detail), `TodoItem.tsx` (compact + with-meta)
   - `BoardCol.tsx`, `FeedLine.tsx`, `MsTerminal.tsx`
   - Extract from `shared.tsx` + `ConceptE.tsx`. Drop dead code.
2. Add `ConceptSwitcher.tsx` floating pill (top-right, next to ThemeSwitcher).
3. Refactor `Workbench.tsx` to be the layout host; route content comes from `<Outlet />`.
4. Add routes in `App.tsx`: `/`, `/c/:id`, `/c/k/:projectId`, `/c/g/:sessionId`, `/c/l/:workItemId`, `/c/prd`, fallback.
5. Verify: `bunx tsc --noEmit`, `bunx vitest run`, manual click-through all switcher entries (404 for unbuilt concepts is fine).

**Done when**: switcher shows 16 entries; clicking each loads a placeholder or built concept without console errors; Concept E continues to function on `/`.

---

## Phase 2 — Port 15 concepts visually (mock-supplemented data)

Order by user impact (most-asked first):
1. **B** Mission Control · 2. **A** Card Wall · 3. **K** Project Workbench · 4. **G** Session Detail · 5. **H** Cost analytics · 6. **L** Todo modal · 7. **F** New project · 8. **M** Skills · 9. **O** Dispatcher · 10. **I** Palette · 11. **J** Weekly · 12. **D** Constellation · 13. **C** Hero · 14. **N** Settings · 15. **PRD**.

Per concept:
1. Read `/tmp/design_pkg2/todo/project/concept-X.jsx` verbatim.
2. Port to `client/src/workbench/concepts/ConceptX.tsx` using shared widgets where possible.
3. Inline `<style>{conceptXStyles}</style>` block — copy 1:1, but reference `var(--xxx)` only.
4. Real data first: use existing hooks (`useWorkbenchData`, `getAgentSession`, etc.). Where data is missing, seed via `client/src/workbench/mock.ts` (one central mock with TODO markers showing which Phase 3 task will replace it).
5. Test theme fidelity by manually cycling through 7 themes on the dev server.
6. Add to `ConceptSwitcher` entry list.
7. Verify: `bunx tsc --noEmit`, no console errors, dev server hot-reloads cleanly.

**Done when**: all 16 entries in the switcher render the design template visually, with mock fills clearly marked.

---

## Phase 3 — Backend domain extensions

### 3a — Skills domain (3-4 hr)
- Migration `005_skills.sql`: `skills`, `project_skills` tables.
- `server/src/domain/skill/{repository.ts, service.ts, service.test.ts}`.
- `server/src/web/routes/skills.ts`: GET/POST/PATCH/DELETE.
- `server/src/web/routes/project-skills.ts` (or extend areas route): GET/PUT bindings.
- `shared/src/skill.ts`: type def.
- `client/src/api/skills.ts`: client wrapper.
- Seed 5–10 example skills in `server/fixtures/seed.ts`.
- Verify: `cd server && bun test` (all green), `curl localhost:4174/api/skills` returns seeded entries.

### 3b — Project knowledge (4-6 hr)
- Migration `006_project_knowledge.sql`: 5 new tables, FK on area_id.
- 5 sub-domains under `server/src/domain/project-knowledge/`.
- Routes nested under `/api/projects/:id/...` (note: aliased to area_id internally).
- `shared/src/project-knowledge.ts`.
- Seed: intent + 2 milestones + 1 decision + notes for the first seeded area.
- Verify as above.

### 3c — Cost & burn aggregator (2 hr)
- `server/src/web/routes/analytics-burn.ts`: pure aggregator from `agent_sessions`.
- No new table. Compute on-demand; cache header `Cache-Control: max-age=60`.
- Unit test the aggregator with fixture sessions across 30 days.
- Verify.

### 3d — Weekly aggregator (2 hr)
- `server/src/web/routes/analytics-weekly.ts`: same pattern. Accept `?week=YYYY-WW`, default to current ISO week.
- Verify.

### 3e — Sub-tasks (1 hr)
- Audit existing `work_item_checklist` route — confirm it covers the Concept L use case. If yes, mark moot.
- Else: migration `007_work_item_parent.sql` adds `parent_id` column.
- Verify.

---

## Phase 4 — Wire concepts to real backend

Touches: `client/src/workbench/concepts/Concept{K,L,M,O,H,J}.tsx` + `client/src/api/*`.

Concept by concept, in same priority order as Phase 2:
1. Replace `mock.X` calls with real API calls via new client modules.
2. Add `useAsync`-style hooks where edits need to persist (intent save, milestone add, skill toggle).
3. Loading skeletons + error banners.
4. Verify: `bunx tsc --noEmit`, dev server smoke per concept.

**Done when**: every concept reflects backend data; user edits round-trip to SQLite and persist across reloads.

---

## Phase 5 — Tests + polish

1. Server unit tests for every new service (target: 80% line coverage on new code).
2. Server integration tests: one round-trip per new route.
3. Client unit tests: one test per shared widget primitive (`StatTile`, `FeatDot`, `MsTerminal`, etc.).
4. Playwright golden paths:
   - `concept-e-capture.spec.ts` (already have)
   - `concept-l-todo-detail.spec.ts` — open modal, add sub-task, mark done
   - `concept-i-palette.spec.ts` — ⌘K opens, type to filter, Enter to navigate
   - `concept-m-skill-bind.spec.ts` — toggle skill on a project
   - `concept-j-weekly-nav.spec.ts` — week-prev / week-next
   - `concept-h-burn.spec.ts` — chart renders, heatmap renders
   - `concept-n-theme.spec.ts` — switch theme, persists across reload
5. A11y: keyboard nav for palette + modals (Esc closes, Tab traps focus).
6. `bun run test:all` must pass clean.

**Done when**: full test suite green; user-visible bugs filed before close.

---

## Verification cadence

| Trigger | Command |
|---|---|
| After source edit | `bunx tsc --noEmit` |
| After domain edit | `cd server && bun test` |
| After client component edit | `cd client && bunx vitest run` |
| Before phase close | `bun run test:all` |
| Before each commit | git diff review + `bun run test:all` |

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Concept K knowledge model creep (intent + milestones + decisions + notes + lessons is a lot) | Ship K in two sub-passes: K-lite (intent + notes) first, K-full (milestones + decisions + lessons) second |
| Constellation SVG performance with many projects | Cap at 20 nodes; show "+N more" overflow |
| Theme regressions across 15 new concepts | Phase 2 step 5 (manual 7-theme cycle) is mandatory before phase close |
| Mock-to-real switch missed in Phase 4 | Use single `client/src/workbench/mock.ts` so all TODO markers are in one file — grep for `mock.` before phase close |
| User changes scope mid-flight | Each phase commits independently; can pause/cut at any phase boundary |

---

## Status board

See TaskCreate tasks #15–#24 for live status. Current: #15 in progress (writing this).
