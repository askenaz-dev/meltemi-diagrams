# Validation

## Reproduced defect

In the Claude desktop app's browser pane (Chromium with GPU compositing, device pixel ratio 2.5) at
1280 × 800, on the hosted playground 1.10.21: a free diagram of twelve slides (`sketch.light`, a
heading and a line of text each) fitted at 16 % and zoomed in with Ctrl and the wheel to 800 %
showed the heading's letters blurred; `.content` had `will-change: transform`. Setting
`will-change: auto` on it painted the same view sharp at once. With the change, the built
playground served locally showed the same board at 800 % sharp, with `will-change: auto` at rest.
The change was first written on 4 November and carried onto the recreated repository's main
`3fa0b2f` on 20 November; the hosted playground 1.11.39 still showed the same board blurred at
800 %, with `will-change: transform` on `.content` after the view had rested.

A headless Chrome screenshot of the same zoom is sharp with or without the hint, so the browser
suites check the hint, not the pixels.

## Focused checks

- `MDG_WEBVIEW_ONLY="painted sharp again"` with `pnpm vscode:test-webview`: **1/1 passed**: the
  hint is `transform` right after Ctrl and the wheel, `auto` once the view rests, and stays `auto`
  after a render that leaves the view in place.
- `pnpm player:test-browser`: the new scenario passed with the others (**46/46**, three runs).
- Against `packages/canvas` and `packages/player` as they are on `3fa0b2f`, both scenarios failed
  (the hint never left). In that player run one other scenario, the fullscreen presentation's,
  failed once as well; it passed in all three runs with the change.

## Repository gates

On the change over `3fa0b2f`, Windows, Node 24:

- `pnpm typecheck` and `pnpm lint` (ESLint and Prettier) passed.
- `pnpm test`: **11,649 passed** and one skipped. Run from Git Bash, the four archive tests of
  `packages/acceptance/test/local-operations.test.ts` failed because GNU `tar` read `C:` as a
  remote host; run from PowerShell, where Windows `tar` comes first, that file passed **8/8**.
- `pnpm vscode:test-webview`: **367/367 passed**.
- `pnpm playground:test-browser`: **160/160 passed**.
- `pnpm player:test-browser`: **46/46 passed**.
- `pnpm catalog:test-browser`: **14/14 passed** (the catalog bundles the player).

`pnpm vscode:test` (VS Code itself) and `pnpm vscode:package` were not run: the extension's host
code and contents are unchanged, and the canvas it bundles is the one the webview suite drives.
