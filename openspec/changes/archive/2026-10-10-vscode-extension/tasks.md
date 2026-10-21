## 1. Engine extensions

- [x] 1.1 Layout geometry: `offset`, `labels` and `connectors` on `LayoutResult`; tests that they agree with the scene
- [x] 1.2 `createElkEngine({ loadWorker })`; test with a copied worker
- [x] 1.3 `planBatch` with composition of edits and `operationIndex`; property tests over the edit corpus
- [x] 1.4 `createElement`, `createRelation` with generated ids
- [x] 1.5 `renameRelation`, `removeRelation`, `reconnectRelation`, `setRelationLine`
- [x] 1.6 `setElementLabel`, `setDescription`, `setElementKind`
- [x] 1.7 `setStyleProperty` (replace, insert, create, split shared statements, remove) and `setDiagramProperty`
- [x] 1.8 `addPort`, `removePort`, `groupElements`, `ungroup`, `insertFragment`
- [x] 1.9 Edit tests for every operation, including the corpus run over every valid sheet

## 2. Editor package

- [x] 2.1 `@meltemi/diagrams-editor` scaffold with the subpaths `canvas` and `node`; vitest aliases
- [x] 2.2 `ProjectSessions` (workspaces per root, fonts, icon packs, ELK, injectable readers); the CLI switches to it
- [x] 2.3 `analyzeDocument` with overlays, ELK layout per diagram and merged diagnostics
- [x] 2.4 Completion contexts and items
- [x] 2.5 Hover, symbols, definition, references, highlights
- [x] 2.6 Rename (elements and relations), formatting, semantic tokens
- [x] 2.7 Quick fixes and refactors
- [x] 2.8 `renderDiagram`, `exportFileName`
- [x] 2.9 Canvas helpers: viewport, zoom, fit, keepOrigin, minimap, grid, `resolveMove`, guides, resize, rubber band, keyboard traversal, align and distribute, route handles
- [x] 2.10 Protocol types and `isCanvasMessage`
- [x] 2.11 `CanvasSession`: render, stale, empty, selection, gestures, materialisation in `auto`, creation, connection, deletion, labels and ids, clipboard, grouping, align and distribute, route editing, inspector model and edits
- [x] 2.12 Unit tests for every service, helper and session path

## 3. VS Code extension

- [x] 3.1 `packages/vscode` scaffold: manifest (language, grammar, snippets, icons, custom editor, commands, menus, settings), license and README
- [x] 3.2 TextMate grammar and language configuration; grammar drift test
- [x] 3.3 Document analysis cache, diagnostics and every language provider
- [x] 3.4 Canvas provider: webview HTML with CSP, update loop, revision handling, edits, undo through VS Code, two-way selection, settings, remembered side-by-side opening
- [x] 3.5 Webview UI: layers, grid, toolbar, palette, overlay handles, guides, minimap, inspector, inline inputs, context menu, dependents dialog, status line and live region
- [x] 3.6 Webview input: pointer, wheel, keyboard map, focus management
- [x] 3.7 Commands: Export SVG, Arrange Unplaced Elements, Recompute Layout, Open Canvas, Open Canvas to the Side
- [x] 3.8 Build with esbuild (extension, webview, assets), `THIRD_PARTY_NOTICES.md`, `vsce package`, launch configuration, root scripts

## 4. Tests

- [x] 4.1 Webview tests with `playwright-core` in headless Edge or Chrome
- [x] 4.2 VS Code integration tests with `@vscode/test-electron` and a framework-free runner
- [x] 4.3 Package contents test

## 5. Docs and skill

- [x] 5.1 `docs/editor.md`; README "Editing in VS Code"; decisions 0016 and 0017
- [x] 5.2 Diagnostics and rejection codes documented; skill updated and synced

## 6. Verification

- [x] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm licenses:inventory --check`, `pnpm vscode:test-webview`, `pnpm vscode:test`, `pnpm vscode:package`
- [x] 6.2 Visual review of the canvas in the webview harness: grid, selection, guides, handles, minimap, inspector, stale state, dark and light themes
