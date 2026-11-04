# Touch canvas navigation

## Why

On a phone the canvas cannot be moved around. The stage takes every touch itself
(`touch-action: none`) and treats a finger as a mouse: a drag on the empty canvas draws a selection
band, and a second finger starts another band. The view never pans, and two fingers do not zoom
the drawing. The owner reported it on the hosted playground; VS Code's webview shares the canvas.

This is a post-1.0 interaction change outside `docs/roadmap-1.0.md`.

## What changes

- One finger on the empty canvas, or on anything not selected, pans the view; a tap selects.
- A finger on a handle, or on what is selected, takes hold of it as a mouse press does.
- Two fingers zoom around their midpoint and pan with it; the finger left after a pinch pans on.
- Mouse, stylus and keyboard input keep their behaviour.

## Capabilities

- Modified: `diagram-canvas` (one finger and two fingers on the canvas).

## Impact

`packages/canvas` (the pointer handlers of `CanvasApp`), the browser scenarios of the playground
and of the VS Code webview, and the editor and playground guides in English and Spanish. No source
format, host protocol or export changes.

## Non-goals

Selecting several shapes with a finger (a band or a long press), panning in story mode, and fitting
the drawing when a phone first shows the Canvas tab are separate changes.
