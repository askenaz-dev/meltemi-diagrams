# Validation

## Reproduced defect

The built playground at 375 × 812 with `hasTouch` and `isMobile`, driven through the browser's own
touch input (`Input.dispatchTouchEvent`): before the change, a finger dragged 80 px on the empty
canvas drew a selection band (`rect.band`) and left the content's transform at
`translate(24px, 241.546px) scale(0.789916)`; two fingers spread from 60 to 120 px apart left the
same transform and selected `client` through the band of the first finger. With the change, the
same drag moved the view by (+80, −80) and the spread tripled the zoom (0.79 → 2.37) around the
fingers' midpoint.

The drawing on the narrow screen opens fitted to an 800 × 600 stage, wider than the phone's, since
the canvas was hidden behind the Code tab when it was first drawn; part of it is out of view until
the person pans or presses **Fit the diagram**. That is left to a separate change.

## Focused checks

- `MDG_WEBVIEW_ONLY=touch:` with `pnpm vscode:test-webview`: **5/5 passed**: a finger pans the
  empty canvas (no band, nothing selected, nothing written), a short move taps, a tap selects, a
  drag from an unselected element pans and keeps the selection, a drag of the selected element
  writes one move and pans nothing, a tap on the empty canvas selects nothing, and the mouse still
  draws its band; two fingers double the zoom around their midpoint and the finger left pans on
  and taps nothing; a second finger lets go of a move, writing nothing, and pinches; a read-only
  canvas pans from the selected element; a stroke keeps its finger.
- `PLAYGROUND_TEST_FILTER="canvas on a phone"` with `pnpm playground:test-browser`: **1/1
  passed** at 375 × 812: pan, tap, a pan from an unselected element, a move of the selected one,
  deselecting and a pinch. `packages/playground/.test-output/phone-canvas.png` was looked at.
- Against `packages/canvas/src/app.ts` as it was before the change, four of the five webview
  scenarios failed (the stroke's passes either way) and the playground scenario failed at "no band
  under a finger".

## Repository gates

On the branch from `origin/main` `aea41d1`, Windows, Node 24:

- `pnpm typecheck` and `pnpm lint` (ESLint and Prettier) passed.
- `pnpm test`: 9,934 passed and one skipped; the one failure was this file's link from `tasks.md`,
  run before this file was written, and the documentation links test passed on its own after.
- `pnpm playground:test-browser`: **100/100 passed**.
- `pnpm vscode:test-webview`: **270/270 passed**.

`pnpm vscode:test` (VS Code itself) and `pnpm vscode:package` were not run: the extension's host
code and contents are unchanged, and the canvas it bundles is the one the webview suite drives.
