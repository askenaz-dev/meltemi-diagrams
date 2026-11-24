# Code block notes

## Why

On the Auth0 architecture map the owner pasted the body of a Post Login Action into a note and it
was drawn as ordinary text: the indentation was gone. Getting it to look like code took a
monospace `font` and no-break spaces typed by hand, and an agent that tried Markdown fences got
the fence markers drawn as text. A snippet beside the component it explains is a common need in
technical diagrams, and it has to survive pasting, saving, reopening, exporting and copying back.

Reproduced on 1.11.40 with the owner's fragment, the cause is narrower than it looks. The source
keeps every space (`"…\n  if (…"`) and the layout measures them, but the `<text>` elements of the
`embedded` and `system` font policies carry nothing that preserves white space, so the canvas, the
player, PNG and PDF collapse it, while `--fonts outlined` draws it: the three policies disagree
about the same scene. A tab has no glyph in the bundled fonts and is estimated
(`layout.unmeasured-font`). The inline editor commits on Enter and on Tab, so code can be pasted
but not typed. Copying a note puts a `.meltemi` fragment on the clipboard, never its text, and a
reader of a published drawing cannot copy the snippet at all. A framed note draws its text against
its border, with no inset.

This is a post-1.0 change outside `docs/roadmap-1.0.md`.

## What Changes

- **White space is drawn as written, in every text.** A leading, trailing or repeated space of a
  label, description, note or relation label is drawn under the three font policies, on the
  canvas and in the player, PNG, PDF and the MCP preview, as the layout already measures it. A
  tab advances to the next tab stop, every four characters, and is measured as it is drawn.
- **`textFormat plain|code` on notes.** A style property accepted in `style` statements, classes
  and rules for the notes of flow diagrams, free compositions and C4 views and for the notes of
  sequence diagrams. Without it a note is `plain`, drawn as today, so documents written before
  this change open unchanged. The label stays the one-line string it is, with `\n` and `\t`.
- **A code note is drawn as a code block.** The theme's `mono` font at the note size, left
  aligned, lines never wrapped, on a panel with an inset, in two new theme tokens (`code`,
  `codeText`). `font`, `fontSize`, `fontWeight`, `color`, `fill`, `stroke`, `width`, `line` and
  `radius` adjust it as they adjust any note. Its default size is its text plus the inset; a
  written `size` is kept, and one too small clips the text to the panel and reports
  `layout.text-overflow`.
- **Format in Properties → Text.** With notes selected, the Text category shows **Format** above
  **Font**, with **Plain text** and **Code**. Changing it never rewrites the note's text.
- **Code block from the note tool.** On flow, free and C4 palettes the note button gains a menu
  with **Note** and **Code block**; the second creates a note with `textFormat code` and opens
  its editor with the placeholder selected, ready for a paste.
- **Typing code.** In the editor of a code note Enter breaks the line and keeps its indentation,
  Tab and Shift+Tab indent and outdent, Ctrl+Enter or a click outside commits and Escape cancels.
  Every other editor keeps its keys.
- **Copy code.** The context menu of a selected code note offers **Copy code**, on canvases that
  edit and on read-only ones: the note's text as plain text, with its spaces, tabs and line
  breaks. In the player, the catalog and published pages the detail panel of a code note shows
  the text preformatted with a **Copy code** button.
- **Skill and documentation.** The skill and the language reference say when to use a code note,
  that Markdown fences are not interpreted, and that the MCP preview shows the block as exports
  do.

## Capabilities

### New Capabilities

- `code-notes`: what a note of format `code` is and how it is drawn in each profile (font, panel,
  inset, size, overflow), that its text and indentation survive edits, format changes, saving and
  every output, and what the language services know about the format.

### Modified Capabilities

- `flow-svg-export`: white space of every text is drawn as written under the three font policies,
  and tabs advance to tab stops.
- `style-classes-and-rules`: the `textFormat` property, its targets and its diagnostics.
- `theme-tokens`: the `code` and `codeText` tokens, their values in the built-in themes and their
  group in the theme panel.
- `diagram-canvas`: the keys of the inline editor in a code note, the **Format** field of the
  Text category, **Code block** in the note tool's menu, and **Copy code** in the context menu.
- `viewer-interaction`: the detail panel of a code note, with its preformatted text and
  **Copy code**, for element notes and for the notes of sequence diagrams.
- `agent-skill`: the skill and the agents guide document code notes.

## Non-goals

- Syntax highlighting by language belongs to a change of its own, `code-syntax-highlighting`. This
  change stores no language name.
- A multi-line string literal in the `.meltemi` language belongs to a change of its own,
  `multiline-strings`. The lexer, the parser and the formatter are not touched here.

## Impact

- `packages/render`: `renderSvg` marks the `<text>` elements whose white space must be kept;
  snapshots of texts without such spaces stay byte for byte.
- `packages/layout`: tab stops before measuring (`text.ts`), the code note in `layout.ts` (flow,
  free, C4) and `sequence.ts`, the two tokens in `theme.ts`, the resolved `textFormat` in
  `styles.ts`.
- `packages/model`: `textFormat` in the style properties and the two tokens in the theme table
  (`schema.ts`), with their messages in English and Spanish; the model JSON carries both.
- `packages/edit`: creating a note with its format in one edit.
- `packages/editor`: the `style.textFormat` inspector field and its place in the Text category,
  the effective font of a code note, its text place, the `copyText` message of the canvas
  protocol, completion and hover, the token group of the theme panel, the viewer data of exports.
- `packages/canvas`: the note tool's menu, the inline editor's code keys, **Copy code** in the
  context menus, the words in `messages/en.ts` and `messages/es.ts`.
- `packages/player` and `packages/catalog`: the detail panel of a code note and the selection of
  sequence notes of format `code`.
- `packages/vscode`, `packages/playground`, `packages/mcp`, `packages/acceptance`: webview and
  browser scenarios, the preview check, a conformance case and a visual baseline.
- Documentation: `docs/language/`, `docs/editor.md`, `docs/player.md` and their Spanish copies,
  `skills/meltemi-diagrams/` (synced with `pnpm skills:sync`), `CHANGELOG.md`, and decision note
  0078 written at apply.
- Drawings whose text holds leading, trailing or repeated spaces change by the width of those
  spaces under the `embedded` and `system` policies, to what `outlined` already draws. No
  dependency is added.
