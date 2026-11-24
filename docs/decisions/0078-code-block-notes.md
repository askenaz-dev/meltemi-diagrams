# 0078 — Code block notes

## Context

A fragment of code pasted into a note lost its indentation. The source and the layout kept the
spaces, but the `<text>` elements of the `system` and `embedded` font policies let the viewer
collapse them, while `outlined` drew them: the three policies disagreed about one scene. Showing
code took a monospace `font`, no-break spaces typed by hand and a frame with no inset, and an agent
that wrote Markdown fences got them drawn as text. The change is `openspec/changes/code-block-notes`
(archived as `code-block-notes`).

## Renderers checked

Before building anything, the owner's fragment and a note of aligned columns were drawn with
`xml:space="preserve"` on the lines that hold leading or repeated spaces, on 23 November 2026:

| Renderer                                     | Indentation and columns |
| -------------------------------------------- | ----------------------- |
| Edge 158, PNG export (`--format png`)        | kept                    |
| Edge 158, PDF export (`--format pdf`)        | kept                    |
| resvg (`@resvg/resvg-wasm`), the MCP preview | kept                    |

## Decision

- **White space is drawn as written, in every text.** `renderSvg` writes `xml:space="preserve"` on
  a `<text>` whose line starts or ends with a space or holds two in a row, and on no other, so the
  SVG of every existing drawing without such text is the same bytes. It is a presentation
  attribute, not CSS, and keeps the text content, which the canvas matches its editor against.
- **Tabs reach tab stops every four characters.** `expandTabs` (layout, also the `./text` subpath
  the canvas reads through the editor) replaces a tab by the spaces that reach the next stop before
  a line is measured or placed; the label keeps its tabs, and a tab is no longer an unmeasured
  glyph.
- **`textFormat plain|code` is a style property of notes.** Style statements, classes and rules
  set it on `note` elements of flow diagrams, free compositions and C4 views and on the notes of
  sequence diagrams. Every other target refuses it with `prop.invalid-value` and a hint naming
  notes; a class gives it to notes only. Without it a note is plain, so older files draw as they
  did. `format` was not used: export profiles have it.
- **A code note is a block.** The theme's `mono` font (unless `font` is written) at the note size,
  start-anchored and never wrapped, on a panel with the note's `radius` in the new `code` token,
  outlined in `line`, the text in the new `codeText` token, inset three quarters of `padding`
  across and half of it down. Its default size is its text plus the insets; a smaller written
  `size` clips the text to the panel and reports `layout.text-overflow` with the size it needs,
  taller too. A sequence note keeps its folded corner on the same colours.
- **The canvas.** The note button is a split button whose menu has **Note** and **Code block**;
  Code block writes the note, its place and its `textFormat code` in one edit and opens its editor
  on the selected word, and can be dragged from the menu. O and the button still make a plain note.
  **Format** is the first field of the Text group, directly above Font, as two chips; Plain text
  removes the written property, writing `plain` only over a class or a rule. A code note's Font,
  Fill, Stroke and Text colour show `mono`, `code`, `line` and `codeText` as what applies. Its
  editor types code: Enter keeps the indentation, Tab and Shift+Tab indent with the text's own
  unit, Ctrl+Enter commits; each edit goes through the browser's `insertText`, as typing does.
  **Copy code** in the context menu, read-only canvases included, asks the session for the text
  (`copyText`), which every host writes as it writes a copy.
- **The viewers.** A code note's details carry its text; the panel of the player, the catalog and
  published pages shows it preformatted under **Copy code**, which selects the text where the page
  may not write to the clipboard. A code note of a sequence diagram is selected by a click and the
  arrow keys as an element is; a plain one stays out of reach.
- **The MCP preview draws code in Cascadia Mono.** resvg takes the first family of a
  `font-family` list only, and the themes' mono stack starts with `ui-monospace`, so code and tags
  were drawn in Inter. The rasteriser now puts first the first family of each list it holds, or
  Cascadia Mono for a monospace list; exported SVGs keep their lists.
- **The label stays a one-line string** with `\n`, `\t`, `\"` and `\\`.

## Alternatives considered

No-break spaces at render time would change the drawn text, the accessible names and what a viewer
copies. `white-space: pre` is CSS, less supported outside browsers. Preserving spaces only in code
notes would leave the font policies disagreeing for every other text. A block property of the note
or a new `code` kind could not be set by rules and would have needed a second kind in four
profiles. Markdown fences in labels would change the meaning of existing strings. The panel could
have reused `surface` and `ink`, but a block on a box would then have no panel. Shrinking the code
to fit, as stickies do, would make code sizes differ within a drawing. A button floating over the
block, a new shortcut or Copy code on every element were refused for the owner's rule that quick
actions live in the context menu. A remembered note kind would have made O create code blocks.
Syntax highlighting and a multi-line string literal are changes of their own.

## Notes

The Windows clipboard keeps copied text with CR LF line endings; the page writes line feeds and the
editors code is pasted into read either. The `free/code` acceptance sheet's pixel reference was
recorded with Edge 158, while the other 41 references still date from Edge 156 and pass with 158.
