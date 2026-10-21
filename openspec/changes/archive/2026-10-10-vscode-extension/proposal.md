## Why

Writing a sheet today means typing coordinates blind, running `meltemi-diagrams export` and
refreshing a browser. The proposal's editor shows the code and a canvas together. Every visual
action becomes a minimal change to the source, so comments, formatting, undo and Git keep
working, and people coming from draw.io find the canvas tools they expect.

The audience already works in VS Code or one of its forks. VS Code supplies the explorer, the text
editor, undo, save and Git, so the canvas can be the real editor rather than a preview. Roadmap
change 8 asks for the complete `flow` editor now, with nothing left for a later phase.

## What Changes

**New package `@meltemi/diagrams-editor`.** It has no DOM and no VS Code dependency:

- **Document analysis.** Compile inside the project, with unsaved buffers as overlays. Lay out
  every flow diagram with ELK and the project's themes, fonts and icons. Merge every diagnostic.
- **Language services:**
  - context-aware completion (keywords, ids, ports, values, themes, classes, icons) and hover;
  - document symbols, definition, references and highlights;
  - rename of elements and relations;
  - formatting and semantic tokens;
  - quick fixes for the common diagnostics and refactors (name a relation, arrange the diagram).
- **Rendering.** The same SVG as `meltemi-diagrams export`, with geometry in diagram coordinates,
  and the export file-name rule.
- **Canvas session.** It turns gestures, commands, inspector edits and clipboard actions into one
  edit plan each. In `auto` it first writes the current arrangement, so dragging switches to
  `assisted` and keeps the picture.
- **Canvas helpers (`@meltemi/diagrams-editor/canvas`).** Pure functions for the webview and the
  session: viewport, zoom, pan, minimap, grid, snapping, guides, rubber-band and keyboard
  selection, align and distribute, resize, routes, and the message protocol.
- **Project sessions for Node hosts (`@meltemi/diagrams-editor/node`).** Workspaces per project
  root with fonts, icon packs and the ELK engine. The CLI uses them too.

**New VS Code extension "Meltemi Diagrams" (`packages/vscode`).** Language support:

- language registration, a TextMate grammar, brackets and comments, snippets and the file icon;
- live diagnostics in Problems;
- every service above: completion, hover, outline, breadcrumbs, definition, references,
  highlights, rename, formatting, semantic tokens and quick fixes.

**The canvas**, a custom text editor on the same document:

- **Placement.** Opens beside the code by default, and hiding it is remembered across sessions.
- **Navigation like draw.io:**
  - a visible 14 px grid with snapping and alignment guides;
  - zoom from 10 % to 800 % around the pointer, presets, fit and fit selection;
  - pan with the wheel, Space-drag or the middle button;
  - a minimap.
- **Selection:** click, Shift- or Ctrl-click, a rectangle, select all, and Tab or Shift+Tab
  through elements in source order.
- **Create and connect:**
  - a palette for node, decision, data store, note, tag and group;
  - drag from a connection handle to another box;
  - "Connect to…" from the keyboard.
- **Edit in place:** labels, relation labels and ids; delete with dependency detection and
  confirmation; cut, copy, paste and duplicate as `.meltemi` fragments with fresh ids.
- **Arrange:** move, nudge, resize, group and ungroup, align and distribute.
- **Routes:**
  - add, move and remove bends;
  - choose the route kind;
  - drag an end to another side, a named port or another box.
- **Property inspector** for the diagram, an element or a relation: label, kind, description,
  ports, position, size, every style property, route kind, line and arrowhead.
- **Shared document:**
  - one undo step per action, shared with the text;
  - a stale render while the source has errors;
  - two-way selection between text and canvas.
- **Keyboard:** an alternative for every pointer action, and visible focus everywhere.

**Commands:** Export SVG (from the current buffer), Arrange unplaced elements, Recompute layout,
Format document, and Open canvas or Open canvas to the side.

**Packaging and tests:**

- a `.vsix` that carries the fonts, the icon pack, ELK and the notices required by their licences;
- a launch configuration;
- tests inside a real VS Code through `@vscode/test-electron`;
- webview tests in a headless browser through `playwright-core`.

**`@meltemi/diagrams-edit` gains:**

- `planBatch`;
- creating elements and relations;
- renaming, removing and reconnecting relations;
- label, description, kind and line changes;
- style properties, split out of shared statements when needed;
- diagram properties;
- adding and removing ports;
- grouping and ungrouping;
- inserting fragments.

**`@meltemi/diagrams-layout`** reports the scene offset, label boxes and connector points in diagram
coordinates, next to the boxes.

**`@meltemi/diagrams-layout-elk`** accepts a loader for the ELK worker, so bundled hosts can ship it
as a file.

**Docs:**

- `docs/editor.md`, the user guide;
- decisions 0016 (editor host and in-process services) and 0017 (canvas rendering, interaction and
  gestures);
- the README and the skill.

## Capabilities

### New Capabilities

- `editor-language-services`: analysis inside a project, and every language feature listed above.
- `diagram-canvas`: the canvas session and helpers. It covers:
  - render and stale states;
  - viewport, minimap, grid, snapping and guides;
  - selection, gestures, creation and connection, clipboard, grouping, align and distribute, route
    editing, the inspector and keyboard operation;
  - the `auto` to `assisted` materialisation.
- `vscode-extension`: the contribution:
  - language support and providers;
  - the side-by-side canvas with its remembered choice, and commands and settings;
  - webview security, packaging with notices, and integration tests.

### Modified Capabilities

- `source-editing`: batch plans and the new structured operations.
- `flow-svg-export`: layout geometry for editors (offset, label boxes, connector points).
- `elk-adapter`: an injectable loader for the ELK worker, and loading it with `self` hidden.
- `package-names`: the private extension package `meltemi-diagrams` is the one exception to the
  package scope.

## Impact

- **New packages:**
  - `packages/editor` (`@meltemi/diagrams-editor`, with the subpaths `canvas` and `node`);
  - `packages/vscode` (a private extension package, not published to npm).
- **Changed packages:**
  - `@meltemi/diagrams-edit`: new operations;
  - `@meltemi/diagrams-layout`: geometry;
  - `@meltemi/diagrams-layout-elk`: the loader option;
  - `@meltemi/diagrams-cli`: it uses the editor's project sessions.
- **Dev dependencies, all approved downloads, only in `packages/vscode`:**
  - `@types/vscode` 1.95.0;
  - `@vscode/vsce` 3.9.2;
  - `@vscode/test-electron` 3.1.0, which downloads VS Code for the tests;
  - `playwright-core` 1.63.0, which uses the installed Edge or Chrome;
  - `esbuild` 0.28.2, which is already installed.
- **Root tooling:**
  - scripts `vscode:build`, `vscode:package`, `vscode:test` and `vscode:test-webview`;
  - the vitest aliases;
  - ESLint browser globals for the webview sources;
  - `.vscode/launch.json`.

## Non-goals

- Tools of the `free`, `sequence` and `c4` profiles, which come with those profiles (roadmap changes
  9 to 11).
- Import commands (change 12), timeline and story editing (changes 13 and 14), and the PNG, PDF
  and video export commands (changes 16 and 17).
- The browser playground (change 22). The editor package stays host-neutral for it.
- Publishing to the Marketplace and Open VSX, which is an owner action prepared by change 24.
