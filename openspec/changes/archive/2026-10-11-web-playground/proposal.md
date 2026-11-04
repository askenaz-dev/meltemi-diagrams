## Why

The proposal makes the playground the entry to the product: templates and visible code, a useful
result before any installation or account, and a path to continue locally with the CLI and the
editor (roadmap change 22, "Adoption and launch"). Everything the playground needs already exists
as libraries (compiler, layout, canvas, exports, player, importers); what is missing is a page that
runs them in a browser with nothing installed, and a few Node-only seams that keep them out of it.

## What Changes

- New static site `packages/playground` (`pnpm playground:build`, `pnpm playground:test-browser`):
  one page that runs entirely in the browser, with no account, no server code and no request to
  any other origin.
- **Templates and projects in the browser**: the `init` templates (flow, c4, sequence, free,
  purchase) open as in-memory projects with their `project.json`; the person can add and rename
  `.meltemi` files, open local `.meltemi` files, images and project `.zip` files, and import
  Mermaid or PlantUML text with the importer's report.
- **Visible code with language services**: a code pane with highlighting, line numbers,
  diagnostics, completion, hover, quick fixes, formatting, rename and go to definition, beside the
  **same canvas** as VS Code (palette, inspector, minimap, stories, effects), editing the same
  text; one undo history for code and canvas.
- **Exports from the browser**: SVG (static and animated), PNG (scale, transparency), PDF through
  the browser's print to PDF, the HTML player, GIF, WebM and MP4 drawn frame by frame on the
  deterministic clock, the file's export profiles, the source file, the project as `.zip`, the
  model JSON and the HTML catalog.
- **Share and keep**: a link that carries the project in the URL fragment (compressed, never sent
  to a server, size-capped on read); work kept in the browser between visits; a download that
  continues with `meltemi-diagrams` and VS Code.
- **Shared canvas package**: the canvas application moves from the extension's webview to
  `@meltemi/diagrams-canvas`, used by the extension and the playground alike.
- **Host-neutral libraries**: `ProjectSessions`, exports, layouts and the catalog build move out
  of the Node entry of `@meltemi/diagrams-editor` (the Node entry keeps its defaults); the ELK
  adapter no longer imports Node modules at load time; font hosts get the list of font files to
  ship from `@meltemi/diagrams-fonts/node`.
- **Fix**: the VS Code extension did not ship the Fontsource `unicode.json` tables, so it embedded
  no font subsets in exports and measured Cascadia Mono with the fallback font. It now ships every
  file the font library reads, and a test compares its measurements with the installed fonts.
- Templates' descriptions and their `project.json` move to `@meltemi/diagrams-project` so the CLI
  and the playground share them.
- Documentation (`docs/playground.md`), decision 0031, licence notices of the playground's bundle,
  README, roadmap and the skill.

## Capabilities

### New Capabilities

- `web-playground`: the playground page: in-memory projects and templates, opening and importing
  files, the code pane and its language services, the shared canvas, one undo history, share
  links, kept work, no account and no network, accessibility, notices, build and tests.
- `playground-exports`: every export the playground makes in the browser and how (SVG, PNG, PDF
  by printing, HTML player, GIF, WebM, MP4, profiles, source, project archive, model JSON,
  catalog).
- `canvas-package`: the canvas application as a host-neutral package with a host interface, used
  by the VS Code webview and the playground.

### Modified Capabilities

- `elk-adapter`: the injectable worker loader no longer needs Node modules at load time; without a
  loader outside Node, the engine reports that one is needed.
- `vscode-extension`: the package ships every font file the font library reads (including the
  subset tables) and the canvas stylesheet from the canvas package; a test checks measurements.
- `project-templates`: the templates and their manifests come from `@meltemi/diagrams-project`,
  shared by `init` and the playground.

## Impact

- New packages `packages/canvas` (`@meltemi/diagrams-canvas`) and `packages/playground`
  (private). The extension's webview sources move to `packages/canvas`; `media/canvas.css` becomes
  `dist/canvas.css` in the extension.
- `packages/editor`: new `src/projects.ts`; `exports.ts`, `layouts.ts`, `catalog.ts` and
  `review.ts` no longer import from `node.ts`; `profileRequest` takes a function that places
  outputs. `packages/layout-elk`: no static `node:` imports. `packages/fonts/src/node.ts`: the list
  of bundled font files. `packages/project`: templates. `packages/cli`: `init` uses them.
- No new dependency is downloaded: the playground bundles packages already installed (elkjs,
  fontkit and its dependencies, the fonts, Tabler). Video uses the browser's own encoders
  (WebCodecs) with muxers and a GIF encoder written here.
- Root scripts `playground:build`, `playground:test-browser`; lint globals for browser sources;
  vitest aliases for the new packages; the licence inventory covers the playground bundle.
