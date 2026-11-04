# 0017. Canvas rendering, interaction and gestures

Status: accepted (vscode-extension change, 10 October 2026)

## Context

The canvas must show exactly what the export writes. It must feel like draw.io (grid, guides,
zoom, pan, minimap, rubber band, palette, handles), and every pointer action needs a keyboard
alternative. Gestures become text edits, including in `layout auto`, where nothing is written yet.
The webview lives inside VS Code, which forwards key presses to the workbench.

## Decision

- **Rendering.**
  - The canvas shows the SVG of `renderSvg`, the export's bytes.
  - A sheet grid is inserted after its background rectangle, and the workspace grid is drawn
    behind it.
  - An overlay in screen coordinates draws selection, handles, guides and previews.
- **Coordinates.**
  - Layout reports `offset`, boxes, label boxes and connector points in diagram coordinates; a
    screen point is `pan + zoom × (point + offset)`.
  - `keepOrigin` compensates offset changes between renders, so boxes that did not move stay still.
- **Snapping.**
  - `resolveMove` snaps the dragged box to the edges and centres of other boxes within 6 screen
    pixels, and otherwise its centre to the grid (14 by default). Alt moves freely.
  - Resizing keeps the opposite edges and snaps sizes to the grid.
- **Materialisation.** In `layout auto`, a gesture that changes geometry is preceded, in the same
  batch, by `arrange` with every current position. The diagram becomes `assisted` and only what was
  moved moves.
- **One edit per action.**
  - The session plans each action as one `planBatch` against the document's version.
  - Old revisions are refused with `edit.stale-revision`.
  - Messages from the webview are validated before use.
- **Keys.**
  - Every pointer action has a key: Tab order, Ctrl+arrows, nudging, Alt+Shift resizing, Enter or
    F2 labels, Delete with a confirmation dialog, clipboard, Alt+G grouping, Ctrl+Shift+arrows
    alignment, C to connect, letters to create, zoom keys, and Shift+F10 menus.
  - Keys avoid VS Code's global ones: Ctrl+G, Ctrl+Shift+G, Ctrl+K chords, Ctrl+Alt+arrows and
    Alt+Left or Right. Undo and redo are left to VS Code.
  - Tab past the last element leaves the canvas.
- **Clipboard.** A copy is a complete `.meltemi` fragment, so it pastes into text too. A paste
  renames clashing ids with `_2`, `_3`… and offsets positions.
- **Anonymous relations.** Actions on an anonymous relation first name it `<from>_<to>` in the
  same edit.

## Alternatives considered

- **React Flow or a canvas renderer.** It would show something other than the export and need a
  second renderer.
- **Snapping corners like draw.io.** Positions are centres, so odd sizes would get fractional
  centres.
- **Writing only the dragged box in `auto`.** In `assisted` the other boxes keep their offset from
  the nearest placed box, so the whole diagram would follow the dragged one.
- **Ctrl+G and Ctrl+K as in draw.io.** VS Code takes them before the webview.

## Consequences

- The proposal's "dragging a box switches the view to `assisted` and materialises the adjustment"
  holds literally: one edit, nothing else moves.
- Every gesture has a matching keyboard action, verified by the webview tests in a headless browser
  that drive the real bundle through the same session as VS Code.
