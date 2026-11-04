# Sharp drawing after a zoom

## Why

When the person zooms in on the canvas, the drawing turns blurred and stays blurred until the page
is reloaded or something in the drawing changes (a move, an edit). The owner reported it on the
hosted playground at 426 %, on a phone and on a desktop browser; VS Code's webview shares the
canvas, and the embeddable player zooms the same way.

The content layer of both has a lasting `will-change: transform`. With that hint the browser keeps
the drawing at the scale it was first painted at and scales that picture for every later zoom,
painting it again only when its contents change.

## What changes

- The canvas and the player make their drawing a layer of its own only while the view moves (a
  zoom or a pan); once the view has rested for 150 ms the hint goes and the browser paints the
  drawing again at its zoom.
- A render that leaves the view where it is does not make the drawing a layer.

## Capabilities

- Modified: `diagram-canvas` (a sharp drawing at every zoom).
- Modified: `viewer-interaction` (a sharp drawing at every zoom).

## Impact

`packages/canvas` (`CanvasApp.layout` and `canvas.css`), `packages/player` (`Stage.apply` and its
style), and the browser scenarios of the VS Code webview and of the player. No source format, host
protocol or export changes: exports never carried the view.

## Non-goals

A drawing sharp while a zoom is still under way (the browser scales the picture of a moving layer),
and the minimap's own picture, which is drawn at one small scale.
