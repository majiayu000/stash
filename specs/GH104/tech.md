# GH104 Technical Spec

## Scope

- `client/src/workbench/concepts/ConceptE.tsx`
- `client/src/workbench/ConnectedFlow.tsx`
- Existing e2e coverage under `client/e2e/`

## Design

- Render Concept E topbar with a custom `right` slot showing todo-oriented
  counts.
- Move `ConnectedFlow` below the board and wrap it in a disclosure whose open
  state is stored in `localStorage`.
- Keep the board layout stable: capture hero, feedback, board/right rail, then
  optional connected-flow summary.

## Risks

- `localStorage` can be unavailable; persistence failures must not break render.
- Existing Concept E tests should keep passing because the capture and board
  test ids remain stable.
