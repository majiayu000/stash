# GH104 Product Spec

## Problem

Concept E is the default daily home, but the first viewport currently gives
more weight to agent metrics and connected-flow cards than to capture and the
four todo columns. Daily capture should be the primary affordance.

## Acceptance Criteria

- The default Concept E first viewport shows the capture input and four board
  columns as the primary surface at 1440x900.
- Agent/project/session summary cards are still available, but moved after the
  board or collapsed.
- The summary-card collapsed state persists across reloads.
- Topbar metrics on Concept E emphasize todo/capture status instead of agent
  burn metrics.

## Non-Goals

- Do not remove agent, project, session, burn, or review navigation.
- Do not redesign other concept pages.
