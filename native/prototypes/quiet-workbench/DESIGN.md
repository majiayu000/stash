# Quiet Workbench prototype specification

## Intent

This prototype tests a calm, native macOS home surface that answers three questions within the first few seconds: what is active now, what matters today, and what is waiting beyond today. Agent activity is present as secondary operational context rather than the product's visual center.

## Surface

- A compact capture toolbar sits at the top and accepts a real task title.
- One `In progress` strip gives the current task a single, unambiguous place.
- The main area is an asymmetric two-column layout: six `Today` tasks on the left; `Next 7 days`, `Someday`, and `Agents` summaries on the right.
- The hierarchy uses whitespace, typography, and rules instead of a sidebar, dashboard tiles, gradients, glass, or terminal simulation.
- Muted sage is reserved for focus, selection, completion, and live status.

## Interaction contract

- Clicking a task's circle toggles completion.
- Clicking the rest of a Today row selects it and exposes a restrained sage selection treatment.
- Submitting the capture field appends a task to Today; empty submissions do nothing.
- Command-N moves focus to capture.
- The window defaults to approximately 1180 by 760 points and remains usable down to 920 by 620 points.

## Files

- `Package.swift`: standalone SwiftPM executable declaration for macOS 14+.
- `Sources/QuietWorkbench/QuietWorkbenchApp.swift`: app entry point, mock domain data, interaction state, and the complete SwiftUI surface.

## Verification

Run `swift build` from this directory with Apple Command Line Tools. The package has no third-party dependencies and does not require an Xcode project or Preview.
