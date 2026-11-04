# Design

## Context

`CanvasApp` in `packages/canvas/src/app.ts` follows a drag locally and asks the session for
asynchronous SVG previews. `putScene` replaces the SVG, and `followPointer` subtracts the
preview's movement before applying the latest pointer movement. A drop clears the gesture
before its source edit is rendered, while selection geometry still comes from the old render.
The browser harness drives the same host protocol as VS Code and can delay individual replies.
The regression reproduced a 138.9 screen-pixel separation between the drawing and selection
after release; the existing delayed-preview compensation itself kept the shape under the pointer.

## Decisions

1. Keep dropped movement in the canvas, until a newer source revision confirms it or the action is
   refused. Replies at the same revision keep the displayed drawing and selection together;
   late previews retain the existing token cancellation. Keep queued nudges waiting through the
   accompanying story-list refresh, too. Do not write intermediate source changes or add undo
   steps. Regression tests delay previews and the committed render, sample actual SVG and overlay
   geometry, and cancel a gesture with a late reply. A snapped-zero move, a move back to its origin
   and an unchanged list drop end without a pending edit; switching to view-only discards transient
   edit geometry. Panning remains available while a dropped move awaits its result.
2. Draw an arc arrow in a round, larger hit area at the existing rotation anchor. Preserve its
   `data-handle`, title, angle calculation and Alt behavior. A new location would collide with
   connection handles; a bigger blue dot would remain ambiguous.
3. Add a quiet shadow only to solid element groups in the canvas. Exclude text, lines, pen
   strokes, enclosing groups and stickies (which already draw their own shadow); do not override
   a source-authored SVG filter. Apply the same decoration to ordinary and preview scenes.
   Changing render defaults would also change
   exported files and the language's effective appearance, beyond this presentation request.

## Interfaces and files

- `packages/canvas/src/app.ts`: scene presentation, gesture state and SVG handle drawing.
- `packages/canvas/canvas.css`: only canvas depth and rotation handle rules.
- `packages/vscode/test/webview/`: separate browser scenarios imported by the existing runner.

No public API or source format change. Inspector files are owned by the parallel inspector task.

## Risks and verification

Delayed host replies, rejected edits, changing diagrams and cancellation must never retain
optimistic geometry. Shadows must not catch invisible hit regions or apply twice to children.
Browser tests inspect geometry during the gesture and drop, assert one source edit with comments
intact, and capture the rotation control and shadows for visual review.

Measured evidence and the remaining shared gates are in [validation.md](validation.md). The
reproduced defect was the selection frame snapping back after release; the test did not reproduce
the component itself alternating between old and new positions during a continuous drag. This
change must not be described as proof that every possible form of drag flicker has been fixed.
