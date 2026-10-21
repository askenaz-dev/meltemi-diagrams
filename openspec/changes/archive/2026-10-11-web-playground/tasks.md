## 1. Host-neutral libraries

- [x] 1.1 `layout-elk`: no static `node:` imports; the default loader and `loadElkWorkerFile` reach Node through `process.getBuiltinModule`; outside Node without `loadWorker`, a clear error; test of a browser bundle
- [x] 1.2 `fonts/node`: `bundledFontFiles()` (complete files, subsets of the bundled weights, `unicode.json`); test that a library over only those files measures and embeds like the installed one
- [x] 1.3 `editor`: `ProjectSessions` in `src/projects.ts` (options with injectable host, readers and ELK loader; Node defaults in `node.ts`); `exports.ts`, `layouts.ts`, `catalog.ts`, `review.ts` import nothing from `node.ts`; `profileRequest` takes a function that places outputs; the main entry exports what a browser host needs
- [x] 1.4 `project`: `TEMPLATES` and `templateManifest`; `init` uses them; test of the same manifest

## 2. Canvas package and the extension fix

- [x] 2.1 `packages/canvas` (`@meltemi/diagrams-canvas`): `CanvasApp`, DOM helpers, panels, story panel, `canvas.css`, `CanvasHostApi`; package, tsconfig, lint globals, vitest alias
- [x] 2.2 VS Code: webview `main.ts` mounts the package; build copies `canvas.css` to `dist/canvas.css` and ships `bundledFontFiles()`; canvas page, `.vscodeignore`, package check and webview harness updated
- [x] 2.3 Extension tests: the package check lists `dist/canvas.css` and every file of `bundledFontFiles()`; the fonts test measures and embeds with only those files

## 3. Playground core

- [x] 3.1 `packages/playground`: package, tsconfigs, `build.mjs` (ES modules with splitting, assets, `templates.json`, notices, CSP page), root scripts
- [x] 3.2 `MemoryHost` and the project model of the page (files, open file, revisions)
- [x] 3.3 `LazyFiles`: synchronous readers over fetched files, misses, `settle`; fonts, Tabler data, ELK chunk
- [x] 3.4 Studio: `ProjectSessions` over the memory host, analysis after a 250 ms pause, re-analysis when files arrive, problems
- [x] 3.5 One history per file; Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y anywhere

## 4. Code pane

- [x] 4.1 Text area over the highlighted text, gutter, scrolling in step, highlighting from the lexer, services and keywords
- [x] 4.2 Diagnostics: underlines, gutter marks, problems list with lines, polite announcements
- [x] 4.3 Completion, hover, quick fixes, formatting, rename, go to definition across files
- [x] 4.4 Indentation keys; caret ↔ canvas selection

## 5. Canvas in the page

- [x] 5.1 Mount `CanvasApp` with a host over `CanvasSession`; plans to text edits; settings; theme variables light and dark
- [x] 5.2 Clipboard, reveal, icon picker (Tabler search), image chooser (image added to the project), open model, export commands

## 6. Files, templates, import, share and keep

- [x] 6.1 Templates menu (from `templates.json` and `templateManifest`); file list (add, rename, delete, switch); open files and project `.zip`
- [x] 6.2 Zip writer and reader (stored and deflated, CRC-32); unit tests
- [x] 6.3 Import dialog (paste or file; status, findings, Markdown report)
- [x] 6.4 Share links (encode, decode with caps, previous project kept); unit tests
- [x] 6.5 Work kept in storage; works without storage
- [x] 6.6 Continue locally: project download and the commands to run

## 7. Exports

- [x] 7.1 Export dialog over `produceExport`: diagram or story, options with the CLI's defaults, profiles of the file, problems; resources settled before writing
- [x] 7.2 SVG, animated SVG, HTML player; PNG on a canvas; PDF through a print frame
- [x] 7.3 GIF encoder (median-cut palette, Bayer dithering, LZW, cropped frames, loop); unit tests
- [x] 7.4 WebM writer and MP4 writer; unit tests on synthetic chunks
- [x] 7.5 Video driver: frames from `frameSvg`, WebCodecs VP9/VP8 and H.264, feature detection, progress and cancel
- [x] 7.6 Source, project `.zip`, model JSON, catalog

## 8. Page shell

- [x] 8.1 Header, menus, dialogs, status and live region; split panes with a draggable divider; tabs below 768 px
- [x] 8.2 Light and dark with a remembered switch; keyboard access and visible focus; reduced motion
- [x] 8.3 About dialog with versions and notices; `NOTICES.md`; licence inventory covers the bundle

## 9. Tests, docs and verification

- [x] 9.1 Browser suite `pnpm playground:test-browser` (templates, code, services, canvas both ways, undo, import, share, keep, every export with FFmpeg checks when present, keyboard, narrow layout, origin-only requests)
- [x] 9.2 Docs: `docs/playground.md`, decision 0031, README, `docs/editor.md` (shared canvas), roadmap, skill
- [x] 9.3 Typecheck, lint, unit tests, every browser suite, VS Code tests, package check, licences; visual review of the page
