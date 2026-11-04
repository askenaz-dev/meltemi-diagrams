# Tasks

## 1. Sharp zoom

- [x] Reproduce the blurred zoom in a browser with GPU compositing and record the cause.
- [x] Hold the canvas's `will-change` only while the view moves, and drop it 150 ms after it rests.
- [x] Do the same in the player for direct changes of its viewport.

## 2. Verification

- [x] A webview scenario: the hint while zooming, none at rest, none after a render in place; it
      fails before the change.
- [x] A player scenario: the hint while zooming, none at rest; it fails before the change.
- [x] Check the built playground in the browser pane: a zoom to 800 % is sharp once it rests.
- [x] Run repository typecheck, lint and unit tests and the webview, player and playground browser
      suites, record their results, then archive.

Evidence is recorded in [validation.md](validation.md).
