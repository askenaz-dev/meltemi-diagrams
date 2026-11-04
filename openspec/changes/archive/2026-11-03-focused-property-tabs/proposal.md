# Focused property tabs

## Why

The inspector mixes shape colours, typography, placement, effects and metadata in one long
panel. The owner requested separate tabs across the products, keeping each editing task focused.

## What Changes

- Group properties into Style, Text, Layout, Effects and Details; omit empty tabs.
- Apply the same navigation to the theme editor, with translated labels and keyboard support.
- Keep edits, selection, focus and the chosen tab through host renders and panel folding.

## Capabilities

- Modified: `diagram-canvas`, `theme-editing`.

## Impact

Shared `packages/canvas` presentation used by the browser and VS Code, plus browser scenarios.
This is a post-1.0 refinement outside the delivery roadmap.

## Non-goals

The parallel `smooth-canvas-manipulation` change owns drag, rotation and canvas shadows;
`delivery` owns publishing.
