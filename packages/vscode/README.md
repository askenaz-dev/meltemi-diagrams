# Meltemi Diagrams for VS Code

Diagrams as code for the Meltemi family. Write `.meltemi` files and edit them on a canvas beside
the code. Every move on the canvas is a small change to the text, so comments, formatting, undo and
Git keep working.

## The language

- **Language features:**
  - highlighting and diagnostics as you type;
  - completion (keywords, ids, ports, values, themes, classes and icons) and hover;
  - outline and breadcrumbs, go to definition, find references and highlights;
  - rename of elements and relations;
  - formatting and semantic colours.
- **Quick fixes:**
  - arrange unplaced elements;
  - switch `layout auto` to `assisted`;
  - declare a missing element or port;
  - size a box to fit its text;
  - correct a mistyped word, theme, class or icon.

## The canvas

Opening a `.meltemi` file shows the canvas beside the code. Close it and it stays closed, in this
and later sessions, until you open it again with **Open Canvas to the Side**. The setting
`meltemi.canvas.openWithText` changes this.

- **Navigation:**
  - a 14 px grid with snapping and alignment guides (hold Alt to move freely);
  - zoom with Ctrl and the wheel or a pinch;
  - pan with the wheel, Space+drag or the middle button;
  - fit and a minimap.
- **Selection:** click, Shift- or Ctrl-click, a rectangle, Ctrl+A, and Tab through elements.
- **Create:** use the palette (or N, D, S, O, T, G), drag from a connection handle to another box,
  or press C to connect the selected element.
- **Edit:**
  - move, nudge (arrows; Shift for a grid step) and resize;
  - group (Alt+G), align (Ctrl+Shift+arrows) and distribute;
  - add, move and remove route bends; drag a route's end to another side, port or box;
  - edit labels in place (Enter);
  - delete with confirmation of what depends on the selection;
  - copy, cut, paste and duplicate.
- **Inspector:** label, kind, description, ports, position, size, every style property, route
  kind, line and arrowhead.
- **Automatic layout:** in `layout auto` the boxes are arranged by ELK. Moving one writes every
  position and switches the diagram to `layout assisted`, so nothing else moves.

Commands: **Export SVG**, **Arrange Unplaced Elements**, **Recompute Layout**, **Format Document**,
**Open Canvas**, **Open Canvas to the Side** and **Show Source**.

The language reference, the keyboard table and the editor guide are in the repository under
`docs/`.

## Languages

The extension speaks English and Spanish. Command titles and setting descriptions follow VS Code's
display language. The canvas and the extension's messages follow `meltemi.language`: `auto` (the
default) follows VS Code's display language, `en` and `es` choose one; open canvases change at
once. Exported files keep the language of their project (`locale` in `project.json`), whatever the
interface's.

## Licences

The extension is MIT. It bundles fonts under the SIL Open Font License, the Tabler icons (MIT),
fontkit (MIT) and elkjs, used unmodified under the Eclipse Public License 2.0. Their notices are in
`THIRD_PARTY_NOTICES.md`.
