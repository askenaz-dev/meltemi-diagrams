## Context

**What the engine already offers:**

- **Projects.** `Workspace` from `@meltemi/diagrams-project` compiles files inside their project,
  with imports, themes, assets and fonts. `setOverlay(path, text)` compiles unsaved buffers.
- **Layout.** `layoutDiagram` arranges `auto` and `assisted` diagrams with ELK and returns a scene
  and boxes in diagram coordinates.
- **Rendering.** `renderSvg` writes portable SVG with `data-id` and `data-role`.
- **Edits.** `planEdit` turns move, resize, route, label anchor, relation label, rename, relation
  id, remove and arrange into minimal, comment-preserving edits.
- **Formatting.** `formatSource` formats a file.
- **Speed.** Planning a drag and recompiling 30 nodes takes about 1 ms. Arranging and exporting 30
  nodes with ELK takes about 14 ms.

**Positions** are UTF-16 offsets with 1-based lines and columns. VS Code uses 0-based lines and
columns, so the conversion subtracts one.

**The owner's requirements for the editor:**

- the code and the canvas are shown together, and hiding the canvas is remembered;
- a 14 px grid;
- navigation and selection like draw.io;
- the complete `flow` editor of roadmap change 8, now.

## Goals / Non-Goals

**Goals:**

- Every canvas action becomes one minimal text edit in the open document, so undo, save and Git
  see one source of truth.
- The canvas shows exactly what the export writes.
- Everything that can be tested without VS Code lives in a host-neutral package.
- Every pointer action has a keyboard alternative, and focus is always visible.
- The `.vsix` installs in VS Code 1.95 or later and in compatible forks, and carries the notices
  required by the licences of what it bundles.

**Non-Goals:**

- Other profiles, importers, timelines, other export formats and the playground. Roadmap changes 9
  to 22 cover them.

## Decisions

### D1. The host is a custom text editor beside the code

The canvas is a `CustomTextEditorProvider` (`meltemi.canvas`, priority `option`) on the same
`TextDocument` as the text editor.

- VS Code then owns undo, redo, dirty state, save, hot exit and Git for both views.
- The text editor stays the default, so files open as code and Git diffs keep working.
- When a `.meltemi` text editor becomes visible, the extension opens the canvas beside it with
  `vscode.openWith` in `ViewColumn.Beside`, keeping focus in the text.

The setting `meltemi.canvas.openWithText` controls this:

| Value | Behaviour |
|---|---|
| `remember` (default) | The canvas opens while a remembered flag in `globalState` is on. The flag starts on, turns off when the user closes a canvas while its text editor stays visible, and turns on when the user opens a canvas. |
| `always` | The canvas always opens beside the text. |
| `never` | The canvas opens only on request. |

A close counts only if, 500 ms later, the extension is still active and the text editor is still
visible. Shutdown never turns the flag off.

| Alternative | Why not |
|---|---|
| Canvas as the default editor | It hides the text and opens in diffs |
| A webview panel like the Markdown preview | It is not bound to the document, so undo would drift |
| A desktop app | It would rebuild the explorer, the editor, undo and Git first |

Engines: `vscode ^1.95.0`, with `@types/vscode` pinned to 1.95.0. Recorded with D3 in decision 0016.

### D2. Packages and public interfaces

| Package | Surface |
|---|---|
| `@meltemi/diagrams-editor` | `analyzeDocument`, the language services (D4), `renderDiagram`, `exportFileName`, `CanvasSession`, `inspect`, `copyFragment` and `pasteFragment`, the `HostMessage` and `CanvasMessage` protocol, and `isCanvasMessage` |
| `@meltemi/diagrams-editor/canvas` | Pure helpers that import no engine package, so the webview bundle stays small: viewport, zoom and pan, minimap, grid, `resolveMove`, guides, `resizeBox`, `selectInRect`, keyboard traversal, align and distribute, bend and segment handles, and the protocol types |
| `@meltemi/diagrams-editor/node` | `ProjectSessions`: one `Workspace` per project root, with the bundled fonts, the built-in icon packs and the ELK engine. Readers are injectable for bundled hosts. The CLI uses it in place of its own cache. |
| `@meltemi/diagrams-edit` | `planBatch` and the operations of D9 |
| `@meltemi/diagrams-layout` | `LayoutResult` gains `offset`, `labels` and `connectors` beside `boxes` (D6) |
| `@meltemi/diagrams-layout-elk` | `createElkEngine({ loadWorker })` (D17) |
| `packages/vscode` | the extension: `src/extension/*` is Node glue, `src/webview/*` is the DOM canvas |

`DocumentAnalysis` holds:

- the text and the revision;
- the `Compilation` and the merged, sorted diagnostics;
- the themes in scope, the icon registry and the measurer;
- one `DiagramView` per flow diagram: id, title, mode, the layout result with ELK, and whether it
  renders.

Every service takes an analysis, so a document is compiled and laid out once per version.

### D3. Language services run in process

The extension calls the editor package from the extension host. The canvas needs the same
compilation, so a language server would compile twice or proxy scenes. Results use LSP-like
shapes (ranges, symbol trees, text edits) so that a server can wrap them later. Highlighting uses
a TextMate grammar for the first paint, and semantic tokens refine ids. A test checks that the
grammar covers every keyword of the model's schema tables.

### D4. Language features

- **Diagnostics.** Compile and module diagnostics, plus the layout diagnostics of each diagram
  without compile errors, deduplicated by code and offset.
- **Completion.** A context is computed from the concrete syntax tree at the cursor: the innermost
  block, the statement keyword and the argument index.

  | Context | Items |
  |---|---|
  | top level | `language`, `import`, `diagram`, `theme` and the other top-level words |
  | flow body, statement start | declaration and property keywords, `placement`, `style`, `animate`, `class`, `rule`, and element ids (to start a relation) |
  | after `->` or `-->` | element ids |
  | element block | `description`, `class`, `port` |
  | property value | the enumerated values from the schema (`direction`, `layout`, `routing`, `preset`) |
  | `theme "` | built-in themes and themes in scope |
  | placement block | `place`, `size`, `route`, `label` and the constraints; then element ids or relation ids by argument |
  | `<element>.` | that element's compass ports, `auto` and its named ports |
  | style, class or rule block | the style properties; then values: enums, colour token names, the classes in scope |
  | `icon "` | icon references from the registry, filtered by the typed prefix, at most 200 |
  | animate block | `effect`, `duration`, `repeat` and their values |

- **Hover:**
  - an element shows its kind, label, description, place and size (default or written), and
    ports;
  - a relation shows `from -> to`, its label and route;
  - a port shows its side and position;
  - keywords and style properties show one line from the language reference;
  - a theme shows its base and frame;
  - an icon shows its pack, licence and a preview.
- **Navigation.** Document symbols are diagrams, groups, elements and relations. Definition,
  references and highlights come from `FlowDiagram.references`.
- **Rename** covers elements (`renameElement`) and named relations (`renameRelation`).
  `prepareRename` refuses keywords, anonymous relations and ports.
- **Formatting.** `formatSource` with the project's options. The result is one replacement of the
  smallest changed range.
- **Semantic tokens:**

  | Token | Type |
  |---|---|
  | element ids | `variable` |
  | group ids | `namespace` |
  | relation ids | `function` |
  | ports | `property` |
  | classes | `class` |
  | themes | `type` |

  The `declaration` modifier marks the declaring token.
- **Quick fixes:**

  | Diagnostic | Fixes |
  |---|---|
  | `layout.missing-placement`, `layout.mode-unsupported` | Arrange the unplaced elements with ELK (`arrange`, scope `unplaced`) |
  | `layout.placement-ignored` | Switch to `layout assisted`; switch to `layout manual` |
  | `ref.unknown-element` | Declare `<id>` as a node |
  | `placement.unknown-port` | Declare the port on the element (on the facing side); use an existing port |
  | `layout.text-overflow` | Set the size to the width in the hint |
  | `prop.unknown`, `layout.unknown-theme`, `theme.unknown-class`, `asset.unknown-icon` | Replace with the closest accepted word, theme, class or icon (edit distance up to 3 or the registry's best match) |

  Refactors offered on a selection:
  - **Name this relation** (`materializeRelationId`);
  - **Arrange diagram** (`arrange`, scope `all`).

### D5. The canvas shows the exporter's SVG with a grid, an overlay and a minimap

The webview has these layers:

1. **Workspace background.** The grid covers the whole viewport, so panning past the sheet still
   shows it.
2. **Content.** The SVG of `renderSvg`, the same bytes as the export. Its background rectangle is
   followed by a grid rectangle, so the grid shows on the sheet behind the shapes.
3. **Overlay:**
   - selection outlines, the focus ring and the rubber band;
   - resize, bend, segment and endpoint handles, and connection handles;
   - guides and drag previews.
4. **Chrome:**
   - the toolbar: diagram picker, zoom, fit, grid, snapping, minimap, arrange and export;
   - the palette;
   - the inspector panel;
   - the minimap;
   - the status line and inline text inputs.

**Grid.** Grid lines follow diagram coordinates, and every fourth line is stronger. Below 6 screen
pixels of spacing only the strong lines are drawn.

**Hit testing.** It walks up to the nearest `g[data-id]`, and `data-role` tells elements, relations
and labels apart.

**Minimap.** It draws a clone of the content SVG scaled into a 200 × 140 box, with the viewport
rectangle on top. Dragging in it pans.

Alternative: React Flow or a canvas renderer. Rejected because they would show something
different from the export and need a second renderer.

### D6. Coordinates and geometry

**Offset.** Layout shifts the content by margins and the frame, so a scene coordinate equals the
diagram coordinate plus `offset`. `LayoutResult` gains, in diagram coordinates:

- `offset`;
- `boxes`, which already exists;
- `labels` (relation key to label pill);
- `connectors`: relation key to the drawn points, the from and to sides, and the written
  waypoints.

**Pointer positions.** The webview converts them with `getScreenCTM()` into scene units and
subtracts the offset, so zoom never changes the numbers written.

**Viewport.** The viewport is `{ x, y, zoom }`, and a screen point equals
`pan + zoom × (point + offset)`.

| Helper | Behaviour |
|---|---|
| `zoomAt` | keeps the point under the pointer fixed and clamps the zoom to the range 0.1 to 8 |
| `zoomStep` | walks the presets 10, 25, 50, 75, 100, 125, 150, 200, 300, 400 and 800 % |
| `fitViewport`, `fitSelection` | fit with a 24 px margin, never above 100 % |
| `keepOrigin` | compensates offset changes between renders, so unchanged boxes stay still |

The viewport is saved in the webview state for each document and diagram.

### D7. Update loop and revisions

- The provider debounces document changes for 120 ms, then calls `session.update(analysis)` and
  posts the resulting messages.
- During a drag the webview previews locally with the same pure helpers. On release it posts one
  message with the revision.
- At most one action is in flight. Nudges made while one is pending are summed and sent after the
  next render.
- A message with an old revision is rejected with `edit.stale-revision`, and the current render is
  sent again.
- Plans are applied as one `WorkspaceEdit`, which is one undo step. Rejections show in the status
  line.
- Every incoming message is validated by `isCanvasMessage`: shape, finite numbers and known kinds.

### D8. Stale and empty states

The session keeps the last good render of each diagram.

- **Errors.** When the diagram has errors, the session sends `stale` with the problem count and
  the first problem. The webview dims the render, shows "Out of date · N problems" and refuses
  gestures.
- **No previous render.** The webview shows the first problem and its quick fix.
- **No flow diagram.** The session sends `empty` with the `export.no-diagram` message.

### D9. New edit operations

| Operation | Effect |
|---|---|
| `planBatch(compilation, operations)` | Plans each operation on the text left by the previous ones, then composes the edits onto the base text. An edit in untouched text is shifted; an edit that overlaps an earlier insertion is merged into it. Applying the batch equals applying the operations one by one, and its inverse restores the text. A rejection names the `operationIndex`. |
| `createElement { kind, id?, label, at?, size?, parent? }` | Inserts a declaration after the last declaration of the diagram or group, writes `place` (and `size`) when `at` is given, and generates `<kind><n>` ids when `id` is absent. A group from the palette gets `place` and `size`. |
| `createRelation { from, to, line, label?, id?, fromPort?, toPort? }` | Inserts `a -> b` after the last relation (or the last declaration). With ports, it also writes `as <id>` and a `route`. |
| `renameRelation { relation, newId }` | Renames the relation id and every reference to it. |
| `removeRelation { relation }` | Deletes the relation with its `route`, `label`, styles and animations. Shared statements lose only that target. |
| `reconnectRelation { relation, end, element, port? }` | Replaces an endpoint and its port, and updates the `route`. |
| `setElementLabel`, `setDescription`, `setElementKind`, `setRelationLine` | Rewrite the declaration, the block or the arrow. An implicit element gains a declaration. |
| `setStyleProperty { target, property, value }` | Replaces the value in the statement that sets it, inserts it into the target's own `style` block, or creates `style <target> { }`. A statement shared by several targets loses this target, which gets its own statement with the shared properties plus the new one. `null` removes the property, and an empty single-target statement is deleted. |
| `setDiagramProperty { property, value }` | Replaces, inserts (after the last property statement) or removes a diagram property. |
| `addPort`, `removePort` | Edit the element's block. `removePort` refuses a port that routes use (`edit.has-dependents`). |
| `groupElements { elements, id, label }` | Moves the declarations of sibling elements into a new `group <id> "<label>" { }` at the first one's place, re-indented. Implicit elements become `node` declarations inside it. |
| `ungroup { group }` | Replaces the group with its children, dedented, and drops the group's `place`, `size`, styles and animations. A group used as a relation endpoint is refused (`edit.has-dependents`). |
| `insertFragment { fragment }` | Inserts the statements of a compiled fragment (D13). Declarations and relations go before the first `placement` block; placement statements go into the last block, or a new one; `style` and `animate` statements go at the end of the body. |

Every operation keeps comments and formatting, and is checked for new syntax errors as before.

### D10. Gestures, grid, guides and materialisation

**Snapping.** The grid comes from `meltemi.canvas.grid` (default 14). Alt disables grid and guides
during a drag. `resolveMove` snaps in this order:

1. the primary box under the pointer;
2. guides to the edges and centres of other boxes, within 6 screen pixels;
3. otherwise, the primary centre to the grid.

**Gestures:**

| Gesture | Operations |
|---|---|
| Move a selection | `setPosition` for each selected element, each placed descendant of a selected group, and each placed group, in one batch |
| Nudge with the arrows | the same, by 1 px, or one grid step with Shift |
| Resize | `setSize` and `setPosition`; the opposite edges stay fixed; snapped to the grid; at least 24 px |
| Move a relation label | `setLabelAnchor` (after `materializeRelationId` when anonymous) |
| Drag a bend or segment, double-click a bend | `setRoute` with new waypoints, inserting a bend at a segment midpoint, or removing a bend |
| Drag a connector end | Onto the same box, `setRoute` with that side, or that named port when near one. Onto another box, `reconnectRelation`. |
| Drag from a connection handle | `createRelation` to the box under the pointer |
| Drop from the palette | `createElement` at the snapped point, inside the group under the pointer |

**Materialisation.** In `layout auto`, the batch starts with `arrange` (scope `all`), which writes
the current position of every box and turns the mode into `assisted`. Then the gesture is applied.
Only the dragged boxes move on screen, as the proposal asks ("arrastrar una caja cambia la vista a
assisted y materializa el ajuste"). In `assisted`, a dragged free box simply gains its `place`.

### D11. Selection and keyboard

| Input | Action |
|---|---|
| Click, Shift- or Ctrl-click | select, or add and remove |
| Drag on empty space | selection rectangle (fully inside) |
| Ctrl+A, Escape | select all, clear or cancel |
| Tab, Shift+Tab | next or previous element in source order; the canvas scrolls it into view |
| Ctrl+arrows | select the nearest element in that direction |
| Arrows, Shift+arrows | nudge |
| Alt+Shift+arrows | resize the selected box by one grid step (exact sizes in the inspector) |
| Enter or F2 | edit the label; Shift+F2 renames the id |
| Delete or Backspace | delete, with the dependents dialog when needed |
| Ctrl+C, Ctrl+X, Ctrl+V, Ctrl+D | copy, cut, paste, duplicate |
| Alt+G, Alt+Shift+G | group, ungroup |
| Ctrl+Shift+arrows | align left, right, top or bottom |
| Ctrl+Alt+H, Ctrl+Alt+V | distribute horizontally or vertically |
| C | connect the selected element to… (a filtered list of targets) |
| N, D, S, O, T, G | create a node, decision, data store, note, tag or group at the viewport centre, snapped to a free grid cell |
| Wheel, Shift+wheel, Space+drag, middle drag | pan |
| Ctrl+wheel, pinch, `+`, `-` | zoom |
| Shift+0, Shift+1, Shift+2 | 100 %, fit, fit selection |
| Shift+F10 or the context-menu key | context menu |
| Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z | VS Code applies them to the document itself |

The keys avoid VS Code's global ones, which the webview passes on to the workbench: Ctrl+G (go to line), Ctrl+Shift+G (source control), Ctrl+K chords, Ctrl+Alt+arrows (move the editor to another group) and Alt+Left or Right (navigate back and forward).

**Focus and labels:**

- Every control is a button or input with a label.
- The canvas and the inspector are tab stops.
- Focus rings use the theme's `focusBorder`.
- Elements carry `aria-label` with kind and label, and a live region announces the selection and
  the results of actions.

Recorded with D5, D6 and D10 in decision 0017.

### D12. Inspector

`inspect(analysis, diagram, selection)` returns fields with their current written values and
defaults:

| Selection | Fields |
|---|---|
| nothing | diagram title, description, direction, layout, routing, theme (choices in scope), preset |
| one element | id, kind, label, description, classes, ports, x, y, width, height, and the style properties (`fill`, `stroke`, `color`, `line`, `width`, `pattern`, `icon`, `iconColor`, `iconPosition`) |
| one relation | id, label, from and to with ports, line, routing, arrowhead, the style properties, and the label position |
| several | the style properties they share, written to each one in a batch |

Each field change becomes one operation of D9, or `setPosition`, `setSize` or `setRoute`.
Colours accept `#hex` or token names, and the field offers the theme's tokens.

### D13. Clipboard

- **Copy.** `copyFragment` writes a complete source,
  `language "0.2"` and `diagram clipboard: flow { … }`, holding:
  - the selected declarations, with groups and their children;
  - the relations between copied elements;
  - their `place`, `size`, `route` and `label`;
  - their styles, rebuilt for the copied targets only.

  The fragment goes to the system clipboard as text, so it can also be pasted into a file.
- **Paste.** `pasteFragment` compiles the clipboard text. Ids that clash get the suffix `_2`,
  `_3` and so on, through `renameElement` and `renameRelation` on the fragment. Places are offset
  by two grid steps, or to the pointer for a context-menu paste, then `insertFragment` runs. Text
  that is not a fragment pastes nothing and shows a status message.
- **Duplicate** is a copy and a paste. **Cut** is a copy and a cascading removal.

### D14. Deleting

`removeElement` without cascade runs first. If it is refused with dependents, the webview lists
them and asks for confirmation, which is focusable and keyboard operable, then cascades.
Relations use `removeRelation`. A mixed selection is one batch.

### D15. Two-way selection

- Selecting on the canvas reveals the first id in the text editor without taking focus. A double
  click on empty text of a box focuses the text at that id.
- Moving the cursor in the text highlights the element or relation of the statement under it.

### D16. Export and layout commands

- **Export SVG** renders the current buffer, unsaved changes included, writes it with
  `exportFileName`, skips diagrams with errors and reports them once.
- **Arrange unplaced elements** and **Recompute layout** apply `arrange` with scope `unplaced` or
  `all`, as `meltemi-diagrams layout` does.
- **Format document** runs the formatter.

### D17. Bundling, packaging and security

`build.mjs` runs esbuild with the `@meltemi/diagrams-source` condition and produces:

- `dist/extension.cjs`, for Node with `vscode` external;
- `dist/webview.js`, for the browser, importing only `@meltemi/diagrams-editor/canvas` and DOM
  code;
- `dist/assets/`: the Fontsource font files the font reader needs, the Tabler node JSON, and
  `elk-worker.min.js`.

**Runtime wiring.** The extension builds its `ProjectSessions` with readers over `dist/assets/`
and `createElkEngine({ loadWorker })` loading the copied worker. `createRequire` paths do not
survive bundling.

**Packaging.**

- `vsce package --no-dependencies` writes `meltemi-diagrams-<version>.vsix`.
- `THIRD_PARTY_NOTICES.md` in the package lists every bundled component with its licence text
  (EPL-2.0 for elkjs, with the link to its source; OFL-1.1 for the fonts; MIT for Tabler and
  fontkit and their dependencies).
- A test checks that it matches the bundle's inputs.

**Webview security.**

- CSP `default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src 'nonce-…'`;
- `localResourceRoots` limited to `dist/` and `media/`;
- no remote resources;
- the SVG comes from our renderer, which escapes text. Inline styles are needed for the SVG's own
  `<style>` with embedded fonts.

### D18. Tests

- **`@meltemi/diagrams-editor`**: vitest unit tests for analysis, every service, the session (every
  gesture, command and state) and the canvas helpers.
- **`@meltemi/diagrams-edit`**: tests for every new operation, including the batch property test
  over the edit corpus and the operations on the valid corpus.
- **Webview**: `pnpm vscode:test-webview` builds the bundle, loads it in headless Edge or Chrome
  through `playwright-core` with a fake `acquireVsCodeApi`, and drives the following, checking
  the messages posted and the DOM:
  - pointer, wheel and keyboard input;
  - the palette, the inspector, the minimap, focus order and the stale state.
- **VS Code**: `pnpm vscode:test` runs a small runner inside VS Code (no extra framework) through
  `@vscode/test-electron`. It checks the following on the corpus:
  - activation, the language, the providers' results, the canvas opening beside the text and its
    remembered choice;
  - the commands, and an edit from the canvas undone from the text.
- **Packaging**: `pnpm vscode:package` produces the `.vsix`, and a test lists its contents.

### D19. User documentation

- `docs/editor.md` covers installation, the panes, navigation, the keyboard table, gestures and
  their text changes, modes and materialisation, the inspector, the clipboard and troubleshooting.
- The README gains "Editing in VS Code". The skill mentions the canvas and `mdg layout`.

## Risks / Trade-offs

- [Undo pressed inside the webview may not reach the document] → VS Code applies undo and redo
  of a custom text editor to its document; the VS Code tests check an undo after a canvas edit.
- [Ctrl with `=` or `-` may zoom the whole window] → The plain `+` and `-` keys and the toolbar
  always work.
- [Shutdown mistaken for hiding the canvas] → The 500 ms delay and the visibility check. Covered by
  the VS Code tests.
- [The keyboard map clashes with user keybindings] → Keys are handled only while the canvas has
  focus, and VS Code's own shortcuts (Ctrl+S, Ctrl+P, Ctrl+Shift+P) are never captured.
- [ELK in the extension host for large sheets] → About 225 ms for 500 nodes. The 120 ms debounce,
  and arrangement only for diagrams in `auto` or `assisted`.
- [Bundled assets drift from the packages] → The build copies them from the installed packages,
  and the notices test checks them.
