# stash v0.2 — Workbench SPEC

Supersedes the v0.1 8-page architecture in `/SPEC.md`. v0.2 ports the full **workbench design template** (15 concepts + PRD page) faithfully — design, colors, and behaviors — onto the existing stash backend, extending it where new domains are required.

Current hardening note: this is a historical design spec. The current production
readiness plan lives in [`docs/PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md).
The current canonical session-detail route is `/c/g/:sessionId`; the older
provider-qualified route is tracked as a route-contract hardening item.

Authoritative reference: `docs/reference/workbench-explore/` (read-only). Visual fidelity across all 7 themes (Cyber, Matrix, Synthwave, Amber, Glacier, Paper, Mono) is non-negotiable per user feedback.

---

## 1. Scope

| In scope | Out of scope |
|---|---|
| 15 concept pages (A–O) + PRD page | Mobile / compact view (1440px desktop first) |
| 7 themes with full override layer | Team collab, cloud sync, auth |
| Real backend wiring for every concept | Replacing Jira/Linear |
| Skills domain (new) | Skill registry hosting (we install only) |
| Project Knowledge domain (new) | Two-way Obsidian sync |
| Cost + weekly analytics (new) | Forecasting / ML predictions |
| Sub-tasks for work-items | Multi-user permissions |
| Playwright golden-path per concept | Full a11y AAA — start with keyboard nav |

## 2. Concept map

| # | Concept | Layout | Primary data | New backend? |
|---|---|---|---|---|
| E | Capture & Plan (default) | hero capture + 4-col board + right rail | work-items, agent-sessions, workboard | ✅ done |
| A | Card Wall | 2-pane: grid + right rail | workboard, sessions, work-items | — |
| B | Mission Control | 3-pane: sidebar / center / right | workboard.byProject, sessions, work-items | — |
| C | Hero + Stream | 2-pane: hero+mini grid / live feed | workboard, sessions | — |
| D | Constellation | SVG graph + bottom timeline | workboard (positions seeded), sessions | — |
| F | New project / edit | 2-panel modal | areas CRUD | — (uses areas) |
| G | Session detail | 2-pane: transcript / meta | agent-sessions/:id/events | — |
| H | Cost & burn analytics | KPIs + grid (charts + donut + heatmap) | analytics/burn aggregator | **3c** |
| I | ⌘K palette | dimmed overlay + searchable groups | search across work-items, sessions, areas | — (client-side search) |
| J | Weekly review | sections: narrative, KPIs, done, features, plan | analytics/weekly aggregator | **3d** |
| K | Project workbench | hero + main / sidebar | project knowledge (intent, milestones, decisions, notes, lessons) + skills | **3a + 3b** |
| L | Todo detail modal | overlay: main / right meta | work-item + sessions linked + sub-tasks | **3e** |
| M | Skills library | tabs + grid + right detail | skills + bindings | **3a** |
| N | Settings | left nav + appearance grid | theme persistence (already in localStorage), paths, rates | — |
| O | Start session dispatcher | modal: prompt + tool/model/skills + context + budget | projects, skills, project knowledge | **3a + 3b** |
| PRD | Product requirements | single scrollable artboard | static content | — |

## 3. Backend extensions

### 3a. Skills domain
```
skills(id, name, emoji, desc, source, stars, official, installed, version, created_at, updated_at)
project_skills(project_id, skill_id, enabled, bound_at)
```
Routes: `GET/POST/PATCH/DELETE /api/skills`, `GET/PUT /api/projects/:id/skills`.

### 3b. Project knowledge domain
- `project_intent(project_id PK, text, updated_at)`
- `milestones(id, project_id, name, date, status, progress, created_at)`
- `decisions(id, project_id, date, title, body, tags JSON, session_id NULL, created_at)`
- `project_notes(project_id PK, markdown, updated_at)`
- `lessons(id, project_id NULL, title, body, tags JSON, cross JSON, created_at)`

Routes under `/api/projects/:id/{intent,milestones,decisions,notes,lessons}`.

**Naming note**: stash currently calls projects "areas". For v0.2 we keep the DB column `area_id` but expose `projectId` in the API for design alignment. Migration 006 introduces an `area.kind = 'project'|'area'` discriminator so future "true areas" (PARA-style) stay separate.

### 3c. Cost & burn aggregator
`GET /api/analytics/burn?days=30` → 
```ts
{
  dailySpend: [{date, tokens, cost}],     // 30 entries
  hourlyHeatmap: number[7][24],           // tokens
  modelMix: [{model, share, cost, tokens}],
  perProjectLeaderboard: [{projectId, projectName, tokens, cost, sessions, share}],
}
```
Computed on-demand from `agent_sessions` table (no separate materialized view yet).

### 3d. Weekly aggregator
`GET /api/analytics/weekly?week=YYYY-WW` →
```ts
{
  doneCount, focusHours,
  featuresAdvanced: [{name, from, to}],
  sessionsByDay: number[7],
  donePerProject: [{projectId, count}],
  wow: { tokens: {now, prev}, cost: {now, prev}, sessions: {now, prev} },
}
```

### 3e. Sub-tasks
`work_items.parent_id NULL` self-foreign-key. Re-use existing checklist routes where they overlap. Sub-task rendering on Concept L only.

## 4. Shared widget extraction (Phase 1)

Move to `client/src/workbench/shared/`:
- `Topbar`, `ProgressBar`, `LiveDot`, `StatusPill`, `ModelBadge`, `FeatDot`
- `Tile`, `StatTile`, `ProjectCardFull`, `ProjectChipRow`
- `SessionRow` (compact + detail variants), `TodoItem` (compact + with-meta variants)
- `Typewriter`, `ShinyText`, `CountUp`, `ParticleField`, `CursorGlow`, `TiltCard` (effects already in `components/effects/`)
- Layout helpers: `BoardCol`, `FeedLine`, `MsTerminal`

## 5. Routing

```
/                                    → concept E (default)
/c/:detailId  (detailId ∈ a..o, prd) → corresponding concept
/c/k/:projectId                      → Concept K bound to a specific project
/c/g/:sessionId                      → Concept G bound to a session
/c/l/:workItemId                     → Concept L bound to a work item
/c/prd                               → PRD page
*                                    → redirect to /
```

ConceptSwitcher (top-right) lists all 16 entries, persists last selection to localStorage.

## 6. Theming

7 themes already declared in `client/src/themes.css` with full override layer. Theme class applied to `<body>` by `lib/theme.ts`. New concepts must use shared widget classes (`pcard`, `surface`, `board-col`, `pcard-status`, etc.) so the override rules cascade automatically. **Do not invent new neon-cyan-hardcoded styling** — read from CSS vars only.

## 7. Testing

| Layer | Tool | Per-concept target |
|---|---|---|
| Domain unit | `bun test` | service.test.ts per new domain |
| Adapter unit | `bun test` | aggregator unit for analytics |
| Web integration | `bun test` | one round-trip per new route |
| Client unit | `vitest` | one shared widget test per primitive |
| E2E | `playwright` | one golden interaction per concept (palette open, todo split, skill toggle, week nav, etc.) |

## 8. Resolved decisions (locked 2026-05-15)

1. **Project ≡ Area** → keep `areas` DB table; API and UI expose `projectId` as alias. No rename migration. Concept N may surface the distinction later if PARA-style true areas are added.
2. **Concept J narrative** → deterministic template summary in v0.2. No LLM dependency until v0.3.
3. **Skills source-of-truth** → local SQLite only. No external registry sync in v0.2.
4. **Cost rates** → hardcoded defaults shipped in `server/src/domain/skill/rates.ts` (mistake: in pricing module — corrected to `server/src/web/routes/analytics-burn.ts` constants). User-editable via Concept N → persisted to `kv_settings` table (introduced ad-hoc on first edit).
