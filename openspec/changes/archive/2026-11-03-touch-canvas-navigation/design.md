# Design

## Context

`CanvasApp` in `packages/canvas/src/app.ts` handles every gesture through pointer events on the
stage, whose CSS has `touch-action: none`, so the browser neither scrolls nor zooms there. A press
pans only with the middle button or with Space held; a left press on the empty canvas starts a
`band` drag. A finger arrives as a left press of type `touch`, so it drew a band and nothing ever
moved the view. The interactive player (`packages/player/src/stage.ts`) already pans with one
pointer and pinches with two, and the canvas has `zoomAt` for the wheel.

## Decisions

1. Fingers are told apart by `pointerType === "touch"`. A stylus keeps the mouse's behaviour, as
   do its palm rejection and its barrel button.
2. A finger pans unless it takes hold of something a mouse press would drag: a handle, or a
   selected element, label or spaced sequence event on a canvas that edits. Anywhere else (the
   empty canvas, an element or relation not selected, any press on a read-only canvas) the press
   is a `pan` drag that remembers what it pressed. Until it moves `TAP_REACH` (8 px; a finger is
   less steady than a mouse's 3 px `DRAG_THRESHOLD`) it pans nothing, and released there it is a
   tap that selects what it pressed, or nothing. The alternative, a finger dragging any element it
   lands on, leaves no room to pan a diagram whose groups or C4 boundaries cover the stage at a
   phone's zoom, and turns every attempt to pan into an edit. A tap then drag stays the way to move
   something, and two fingers always pan.
3. The fingers on the stage are kept by pointer with their last points. A second one starts a
   `pinch`: what the first began is let go of with `resetPreview` (a move goes back, writing
   nothing), except a stroke of the pen, the highlighter or the eraser, which keeps its finger as
   before. The pinch zooms the viewport it started from by the ratio of the fingers' spread around
   their starting midpoint (`zoomAt`, clamped to 10–800 %) and pans it by the midpoint's movement,
   as the player does. A third finger adds nothing. When one of the two lifts, the other pans on
   from where it is and taps nothing. A finger the stage no longer holds (its pointer capture
   gone) is dropped at the next press, so a lost release cannot leave a phantom finger.
4. Safari's `gesturestart` events are left alone: preventing them would also stop the page zoom of
   a trackpad pinch on desktop Safari, a desktop change outside this one.

## Interfaces and files

- `packages/canvas/src/app.ts`: the `pan` drag gains `finger` and `tap`; a `pinch` drag; the
  `touches` map, `fingerHolds` and `secondFinger`; the pointer down, move, up and cancel handlers.
- `packages/vscode/test/webview/touch.ts`: the webview scenarios, imported by the existing runner,
  which gains a `touch` option (`hasTouch`).
- `packages/playground/test/browser/run.ts`: a phone scenario at 375 × 812 with `hasTouch` and
  `isMobile`, and a `touch` option.
- `docs/editor.md`, `docs/playground.md` and their Spanish versions.

No public API or source format change.

## Risks and verification

Touch input is driven through the browser's own input (`Input.dispatchTouchEvent`), so the canvas
gets the pointer events, pointer capture and frame-aligned moves a phone gives; a finger is lifted
alone by a `touchEnd` naming it. The scenarios check the view's transform, the selection, the band
and the source writes, and they fail on the code before the change. The behaviour on a real phone
(iOS Safari, Android Chrome) is not measured by these suites.
