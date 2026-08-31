# Now-first Work Preview

Status: implementation preview
Route: `/ui-demo/dense-work`

## Outcome

The preview should help one person open stash, capture a thought, and decide what
to work on next without scanning the entire database. The memorable element is
one visually dominant `Now` commitment; Today, Inbox, Later, projects, and agent
activity remain supporting context.

## Product boundaries

- Keep the existing `/` work board unchanged while this direction is evaluated.
- Reuse persisted `WorkItem` data and the existing capture/update APIs.
- Do not add a new task status or schema for unique focus in this preview.
- Do not expose global project, completion, analytics, or session dashboards.
- Show agent activity only when it matches the project of the current `Now` item.
- Preserve explicit API errors. A failed capture or transition remains visible.

## Primary interaction

1. Capture a thought from the single top input.
2. See one `Now` commitment selected from active work, then today's work.
3. Start, complete, defer, or open that commitment.
4. Promote another Today item into `Now` with one action.
5. Review compact Inbox and Later previews without expanding every commitment.

`Start`, `Complete`, and `Defer` use the canonical lifecycle inputs from
`work.lifecycle.ts`. The preview may keep the most recently selected `Now` item
in local page state because the current data model has no persisted unique-focus
field.

## Visual direction

The page is a quiet editorial desk: warm paper, deep ink, a restrained vermilion
accent, characterful serif display type, and readable sans-serif body text. It
uses generous negative space around `Now`, 14px-or-larger task text, minimal
motion, and no dashboard-style metric wall.

Desktop uses a two-column composition with `Now` on the left and a short Today
queue on the right. Narrow screens become a single column without horizontal
scrolling. Reduced-motion preferences disable entry transitions.

## Files

- `client/src/workbench/pages/DenseWorkDemoPage.tsx`
- `client/src/workbench/pages/dense-work-demo.styles.ts`
- `client/src/workbench/pages/DenseWorkDemoPage.test.tsx`

## Verification

- Component tests prove grouping, capture, start, complete, and error feedback.
- Client TypeScript passes.
- Production client build passes.
- Browser inspection covers desktop and a narrow viewport.
- The final preview is opened at `/ui-demo/dense-work` against the isolated demo.
