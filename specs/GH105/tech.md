# GH105 Technical Spec

## Scope

- `client/src/themes.css`
- `client/src/workbench/styles/dashboard.css`
- `client/src/workbench/concepts/ConceptE.tsx`
- `client/src/workbench/shared.tsx`
- Documentation in `docs/`

## Design

- Add semantic aliases in `themes.css`: priority, due, active, someday, muted,
  and primary action.
- Update `TodoItem` priority badge text to the actual priority value.
- Update Concept E board column tone mapping to follow status semantics:
  inbox/muted, today/due, doing/active, later/someday.
- Use `--text-secondary` for important helper copy that previously used
  `--text-muted`.

## Risks

- Theme overrides remap neon tokens; semantic aliases should default to existing
  tokens to avoid broad visual churn.
- Shared `TodoItem` appears outside Concept E; the priority badge change is
  intentionally global because the current `high`/`med` branch is stale.
