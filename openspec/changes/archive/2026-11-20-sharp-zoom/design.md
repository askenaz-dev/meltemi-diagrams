# Design

## Context

`CanvasApp.layout` in `packages/canvas/src/app.ts` applies the viewport as
`translate(x, y) scale(zoom)` on the `.content` element, which holds the drawing's SVG, and
`canvas.css` gives `.content` a lasting `will-change: transform`. The player's `Stage.apply` in
`packages/player/src/stage.ts` does the same on its own `.content`, with the hint under
`.frame.direct`, the class every wheel zoom, pinch and pan leaves on until the next animated move.

Chromium's compositor keeps a layer with `will-change: transform` at the raster scale it was first
painted at, so that a transform animation never paints again; it scales that picture instead. A
zoom from a fit of 16 % to 800 % shows a picture painted at 16 % scaled fifty times. A move or an
edit replaces the SVG and repaints it at the current zoom, which is why those, and a reload, made
the drawing sharp again.

The defect was reproduced in the Claude desktop app's browser pane (Chromium, GPU compositing) on
the hosted playground 1.10.21: a free diagram of twelve slides fitted at 16 % and zoomed with Ctrl
and the wheel to 800 % showed the text blurred; setting `will-change: auto` on `.content` painted it
sharp at once. A headless Chrome screenshot is sharp either way, so the browser suites check the
hint, not the pixels.

## Decisions

1. The hint is held only while the view moves. When the transform given to `.content` differs from
   the last one, `.content` gets the `moving` class (`will-change: transform`) and a timer of
   `VIEW_REST_MS` (150 ms) is started again; when it ends, the class goes and the browser paints
   the drawing at its zoom. During a gesture the drawing is still one layer that the compositor
   moves and scales without painting, as before.
2. The transform is compared with the last string `layout` gave, not with `style.transform`, which
   the browser serialises in its own way: a render that leaves the view where it is (an edit, a
   selection) neither writes the transform nor makes the drawing a layer.
3. The player does the same with `.frame.moving` on direct changes (wheel, pinch, drag, keys at
   once, resize). `.frame.direct` and `.frame.panning` keep switching off the transition only. An
   animated move needs no hint: the browser makes an animated transform a layer itself and paints
   it at its final scale once the animation ends.
4. Removing the hint for good was rejected: every frame of a pan would then paint the whole drawing,
   which a large whiteboard cannot do at sixty frames a second.

## Interfaces and files

- `packages/canvas/src/app.ts`: `VIEW_REST_MS`, `shownView` and `viewRest`; `layout`.
- `packages/canvas/canvas.css`: `.content.moving` holds the hint.
- `packages/player/src/stage.ts`: `VIEW_REST_MS`, `shownView`, `viewRest` and `moving`; `apply` and
  `destroy`.
- `packages/player/src/style.ts`: `.frame.moving .content` holds the hint.
- `packages/vscode/test/webview/run.ts` and `packages/player/test/browser/run.ts`: a scenario each.

## Risks

- The first frame of a gesture makes the drawing a layer, which paints it once; a gesture that
  pauses longer than 150 ms paints it again at the pause. Both are one paint, as a move already
  costs.
