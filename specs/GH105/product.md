# GH105 Product Spec

## Problem

The workbench uses several color accents without a stable meaning, while
priority is not readable through text/shape. Color should support scanning
without being the only channel for priority.

## Acceptance Criteria

- Document a stable color semantics map.
- Concept E priority markers include visible `P0`/`P1`/`P2`/`P3` text, not only
  color or punctuation.
- Key muted helper text on Concept E uses a contrast-safe token.
- Column colors map to stable status semantics instead of arbitrary "different
  column" colors.

## Non-Goals

- Do not rebuild the theme system.
- Do not remove the existing dark neon visual style.
