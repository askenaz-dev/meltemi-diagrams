## 1. Package

- [x] 1.1 `packages/player`: package, tsconfig with DOM, build script (esbuild IIFE `dist/player.js`), vitest alias.
- [x] 1.2 `PlayerDocument` and builders `storyDocument`, `effectsDocument`; labels; font faces; tests.
- [x] 1.3 `PlayerController`: time, scenes, static view, reduced motion, loop, keyboard commands, announcements, summary text; tests.
- [x] 1.4 Runtime: `<meltemi-player>`, `mountPlayer`, shadow root controls, frames, focus, live region, summary.
- [x] 1.5 `playerPage`, `playerFragment`, `playerScript()`; escaping; tests.

## 2. CLI and editor

- [x] 2.1 `export --format html [--story] [--embed]` and usage errors; tests.
- [x] 2.2 VS Code: player asset in the build, **Meltemi: Export HTML Player**, timeline **Export HTML** button; VS Code and webview tests.

## 3. Browser tests

- [x] 3.1 `pnpm player:test-browser`: frames equal the CLI's, controls, keyboard, reduced motion, static view, summary, fragment pasted twice, no network.

## 4. Docs

- [x] 4.1 `docs/player.md`, stories and export docs, README, CONTRIBUTING and AGENTS verification lists, skill reference, decision 0024; `pnpm skills:sync`.

## 5. Verification

- [x] 5.1 typecheck, lint, test, webview, VS Code, browser player tests, package, licences; review the page visually.
