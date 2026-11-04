## 1. Foundations

- [x] 1.1 Renderer `embeddableFaces(scenes, provider)` and `fontFaceRule(face)`; `fontFaceRules` on top of them; tests.
- [x] 1.2 Manifest `catalog` settings (reader, diagnostics, `MANIFEST_FIELDS`, schema); tests.
- [x] 1.3 Editor: shared layout helper for exports and the catalog.

## 2. Catalog package

- [x] 2.1 `@meltemi/diagrams-catalog`: package, configs, build script; `catalogData` (entries, views per scenario, links, entities, faces, sources); tests.
- [x] 2.2 `views.ts` (home, navigation, diagram, story, entities, entity, search) and `catalogPage` with CSP; tests.
- [x] 2.3 Browser runtime: routes, history, focus, players and thumbnails, element clicks, scenario picker, downloads, search; `catalogScript()`.
- [x] 2.4 Browser suite (`pnpm catalog:test-browser`): offline, navigation, links, search, keyboard, story, downloads, narrow and dark.

## 3. Command line and editor

- [x] 3.1 `buildCatalog` in `@meltemi/diagrams-editor/node` (settings, exclusions, skipped entries, warnings).
- [x] 3.2 CLI `build catalog [path]` with `--out`, `--title`, `--source`; help; tests (reproducible, privacy, exit codes).
- [x] 3.3 VS Code **Build Catalog** (bundled runtime, command, open in browser); VS Code test; package check.

## 4. Docs

- [x] 4.1 `docs/catalog.md`, `project.json` reference, decision 0027, README, editor guide, skill reference; `pnpm skills:sync`.

## 5. Verification

- [x] 5.1 typecheck, lint, test, browser suites, VS Code, package, licences; review the catalog visually.
