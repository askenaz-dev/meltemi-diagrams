## 1. Edits

- [x] 1.1 `arrange` with scope `all`: when routes are removed and places inserted, plan the insertion on the text the other edits leave and compose both (`composeEdits`); test with every route of the last block removed

## 2. Routing

- [x] 2.1 `detourRoute` in `packages/layout/src/routing.ts`: sparse orthogonal grid, Dijkstra over (point, direction) with a 40 px bend cost, 20 px stubs, end boxes and obstacles blocked; tests
- [x] 2.2 Layout: in every mode, a crossing `auto`/`orthogonal` connector without waypoints or lane tries the L and Z routes (free ends), then the detour from its own ends and sides; keep it only when it crosses fewer shapes; tests (engine route with pinned ends, assisted pinned ends)

## 3. Canvas

- [x] 3.1 `routeHandles`: segment handles at the middle by length of the drawn stretch between controls; tests
- [x] 3.2 Theme tokens `selection` and `guide` (colour values, not style colour names; inherited; theme panel); `CanvasRender.colors` from the resolved theme; the canvas sets `--mdg-select` and `--mdg-guide`; tests
- [x] 3.3 Webview tests: the midpoint handle on the drawn connector, colours from the theme

## 4. Documentation and release

- [x] 4.1 `docs/language/styles.md` (tokens), `docs/language/layout.md` (detours), `docs/editor.md` (handles, colours) and their Spanish versions; decision note; CHANGELOG 1.6.0, version 1.6.0; typecheck, lint, every suite, conformance, acceptance
