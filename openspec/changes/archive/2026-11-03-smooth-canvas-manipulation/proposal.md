# Smooth canvas manipulation

## Why

Dragging a component must keep the drawing and its selection together while asynchronous
previews arrive and while the written edit is compiled. The rotation handle currently looks
like another connection dot, and flat components are hard to distinguish from the canvas.

This is a post-1.0 presentation and interaction change outside `docs/roadmap-1.0.md`.

## What changes

- Keep a moved component and its outline at the pointer through delayed previews and the drop.
- Make the rotation handle a clear arc arrow with a comfortable hit area.
- Give solid components a subtle canvas-only shadow, preserving the source and exports.

## Capabilities

- Modified: `diagram-canvas` (drag continuity, rotation affordance and canvas depth).

## Impact

`packages/canvas` and the real webview browser harness in `packages/vscode`. The editor's
source edits, revision checks, undo boundaries and exported SVG contract stay unchanged.

## Non-goals

Inspector tabs belong to the separate inspector presentation change. Releases and hosted
deployment belong to the delivery change.
