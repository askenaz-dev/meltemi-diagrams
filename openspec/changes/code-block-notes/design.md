# Design

## Context

See proposal.md for the motivation. What exists today, checked on main `56b2823` and on the
published 1.11.40 with the owner's fragment:

- **Source.** A label is a one-line string; the lexer decodes `\"`, `\\`, `\n` and `\t`
  (`packages/language/src/lexer.ts`) and `quoteString` writes them back
  (`packages/edit/src/text.ts`). Spaces and tabs survive a round trip through the canvas.
- **Layout.** `splitLines` cuts a label at `\n`; a note's width is its widest line, measured with
  its spaces (`Sizing.textNeeds`, `Sizing.noteFont` in `packages/layout/src/layout.ts`). The
  scene's `TextItem.text` is the line as written, one item per line. A flow, free or C4 note is
  drawn by `note()` in `layout.ts`: its box is its text's extent, the outline (only with `fill`,
  `stroke` or `pattern`) is that same box, so the text touches the border. A sequence note is
  drawn by `note()` in `packages/layout/src/sequence.ts`: a folded-corner path in `surface` and
  `muted`, text 8 px in, in `ink`.
- **Rendering.** Every output goes through `renderSvg` (`packages/render/src/svg.ts`): the
  canvas, the player (`system` policy), exports (`embedded` by default), PNG and PDF (the
  embedded SVG in Edge or Chrome), the MCP preview (resvg). A text item is a `<text>` element, or
  a `<path>` with `aria-label` under `outlined`. The `<text>` has no white-space attribute, so
  the viewer collapses leading and repeated spaces; the outlined path lays out every glyph and
  keeps them.
- **Fonts.** A tab has no glyph in the bundled families: it is measured with the average advance
  and reported once per diagram as `layout.unmeasured-font`. The theme has a `mono` stack, which
  tags use (`FontRole` `"mono"`).
- **Canvas.** The inline editor is a `<textarea>` with `white-space: pre`
  (`packages/canvas/src/inline.ts`, `canvas.css`): Enter and Tab commit, Shift+Enter breaks the
  line, `drawnLines` finds the drawn lines by comparing `textContent` with the label's lines. The
  note button of the palette is a plain button on flow, free and C4 (`PALETTE` in `app.ts`); box,
  node, group, relation, pen and sticky are split buttons. The Text category of the inspector
  holds the `style.*` fields named in `TEXT` (`property-tabs.ts`), built from `TEXT_STYLE_FIELDS`
  and ordered by `STRIP` (`packages/editor/src/inspector.ts`). Copy posts `copy { ids }`; the
  session answers with `clipboard: <fragment>`, which the host writes (`session.ts`).
- **Owner's rules for canvas controls** (7 November 2026): additive only, one-click actions, no
  floating selection bar; quick actions live in the context menu.

## Goals / Non-Goals

**Goals:**

- One rule for white space that every renderer of a scene follows, so the three font policies
  agree and indentation needs no workaround.
- A code note that looks like a code block when it is created, with nothing else to set.
- The text of a note is never rewritten by a format change, and what is copied is what was
  pasted.
- One code path per behaviour, shared by the VS Code webview, the web playground and the viewers.

**Non-Goals:**

- No change to the lexer, the parser, the formatter or the language version.
- No new element kind, no new diagnostic code, no new keyboard shortcut outside the inline editor.
- No inset or look change for plain notes, texts, boxes or stickies.

## Decisions

### D1. White space is preserved in every text, with `xml:space="preserve"` only where it matters

`renderSvg` adds `xml:space="preserve"` to a `<text>` element whose text starts or ends with a
space or holds two consecutive spaces, and to no other. The text content stays the scene's text,
so `drawnLines` keeps matching by `textContent` and `aria-label` paths are untouched. A drawing
without such text is the same bytes as before, so stored snapshots stand and the "no `<style>`"
rule of `flow-svg-export` holds: it is a presentation attribute, not CSS. The rule is not tied to
the code format because the layout already sizes boxes for those spaces and `outlined` already
draws them: collapsing them is a defect of two policies, not a feature of plain text.

- Alternative: replace spaces by no-break spaces when rendering. Rejected: the drawn text, the
  `aria-label`, a PDF's searchable text and a copy from a viewer would hold U+00A0, and
  `drawnLines` would stop matching.
- Alternative: `style="white-space: pre"`. Rejected: CSS, less supported outside browsers (resvg,
  Inkscape, office importers) than the SVG 1.1 attribute.
- Alternative: draw the line without its leading spaces at a shifted `x`. Rejected: repeated
  spaces inside a line (aligned columns) still collapse, and the text content differs.
- Alternative: preserve only in code notes. Rejected: the policies would still disagree for every
  other text.

### D2. Tabs advance to tab stops every four characters, expanded in the layout

A new `expandTabs(line)` in `packages/layout/src/text.ts` replaces each tab by the spaces that
reach the next multiple of four characters of its line; `splitLines` callers that measure or
place text use the expanded line, so widths, the scene's `TextItem.text`, `<text>` and outlines
agree and a tab no longer reports `layout.unmeasured-font`. The label in the model keeps its
tabs, so the source, the inspector and **Copy code** return them. `expandTabs` is exported from
`@meltemi/diagrams-layout` for the canvas (`drawnLines` compares against expanded lines) and the
editor's text places. The inline editor sets `tab-size: 4`. Four is the common display width
(VS Code's default) and reads well at the note size.

- Alternative: two or eight characters. Rejected: two hides the difference from a two-space
  indent, eight makes Go or Makefile snippets too wide for a note.
- Alternative: a `tabSize` style property. Rejected: a property nobody asked for; a snippet whose
  tab width matters can be pasted with spaces.
- Alternative: tab stops only in code notes. Rejected: a tab in any other text would stay an
  unmeasured glyph.

### D3. The format is a style property named `textFormat`

`textFormat plain|code` joins `STYLE_PROPERTIES` (`packages/model/src/schema.ts`) as an enum. A
style property is settable by `style`, classes and rules (`rule note { textFormat code }`), is
what every field of the Text category already is (`style.*` in the canvas protocol), and its
absence is the default, so older documents are plain with no rule about them. `format` is not
used because export profiles already have `format svg|png|pdf`.

- Alternative: a property of the note's block (`note n "…" { format code }`). Rejected: not
  reachable by rules or classes, a second kind of field for the inspector, and sequence notes
  have no block.
- Alternative: a kind `code`. Rejected: a second note kind in four profiles (attachments, rules,
  palettes, conversion) for what is one property, and **Format** would have to convert kinds.
- Alternative: interpreting Markdown fences in a label. Rejected: labels are literal text; a
  fence would change the meaning of existing strings.

### D4. Only notes take the format

`textFormat` is accepted on `note` elements of flow diagrams, free compositions and C4 views and
on the `note` events of sequence diagrams, in `style` statements, classes and rules. On any other
target a `style` statement or a rule reports `prop.invalid-value` with the hint that it applies
to notes; a class that carries it is applied without it, as text properties are on icons.

- Alternative: also `text` objects and boxes. Rejected: a box has a shape, a description and an
  icon column whose layout a code block does not fit; a `text` object beside a note would be two
  ways to the same block.

### D5. A code note is a block: mono font, panel and inset, in two new tokens

In `layout.ts`, a note whose resolved style has `textFormat code` takes the `mono` role unless a
`font` is written, the note size and line height, weight 400, `textAlign` `left` unless written
(free only), and is drawn on a rect with the note's `radius`: fill `code`, stroke the theme's
`line` at `strokeWidth`, text in `codeText`, each overridden by the written `fill`, `stroke`,
`width`, `line`, `color`. The text is inset from the panel by three quarters of the theme's
`padding` left and right and half of it above and below (12 and 8 under the technical themes, 15
and 10 under the stage themes). An
icon sits before the first line inside the inset, as on a note. In `sequence.ts` the note keeps
its folded corner and its 8 px and 6 px insets, with `code` for the fill and `codeText` for the
text. The tokens follow `sticky` and `stickyText`: `Theme.code` and `Theme.codeText`, light
themes `#f3f5f8` and `#1f2328`, dark themes `#131c2b` and `#e6edf3` (both pairs above 12:1), shown
in the theme panel in a "Code" group, as the whiteboard tokens have theirs.

- Alternative: only the mono font, no panel. Rejected: **Code block** from the palette would
  create floating monospace text in the muted note colour, and adding a frame by hand gives the
  cramped box of today.
- Alternative: reuse `surface` and `ink`. Rejected: `surface` is the fill of boxes, so a code
  block on a box would have no panel; a theme author could not colour code apart from boxes.
- Alternative: give every framed note the inset. Rejected: it resizes notes of existing drawings.

### D6. Size follows the text; a smaller written size clips and warns

The default size is the widest expanded line plus the horizontal insets by the lines times the
line height plus the vertical insets. A written `size` is kept. When it is narrower or shorter
than the content, the text is clipped to the panel inside its insets (the `clip` that stickies
already use on text items) and `layout.text-overflow` is reported on the `size` with the size the
text needs, as for any note. Lines are never wrapped: a wrapped line of code reads as two
statements.

- Alternative: refuse a size below the content. Rejected: the canvas resize would snap back with
  no explanation, and a rule cannot refuse.
- Alternative: shrink the font to fit, as stickies do. Rejected: the size of code would differ
  from note to note in the same drawing.

### D7. The inline editor of a code note types code

`TextPlace` (canvas protocol) gains `format?: "code"`, set by the editor's text places for a code
note; the canvas passes it to `InlineOptions`. With it: Enter inserts a line break followed by
the leading white space of the current line; Tab inserts one indentation unit at the caret, or at
the start of each selected line; Shift+Tab removes one from the start of the line or lines;
Ctrl+Enter (Cmd+Enter) and a click outside commit; Escape cancels. The unit is a tab when any
line of the text starts with a tab, otherwise the smallest run of leading spaces among its
indented lines, and two spaces when no line is indented. The editor's `aria-description` names
these keys, so a keyboard user knows Tab stays inside and how to leave. Other editors are
untouched.

- Alternative: keep Enter to commit and Shift+Enter to break. Rejected: every line of code would
  need the modifier; the format is visible in the block, so the mode is not hidden.
- Alternative: Tab always inserts a tab character, or always two spaces. Rejected: either one
  mixes with what was pasted and comes back mixed on copy.
- Alternative: leave Tab committing. Rejected: indenting a line is the first thing typed in code.

### D8. Copy code is a context-menu item backed by the session

The canvas posts `copyText { id }`; the session answers
`{ messages: [status], clipboard: <label> }`, the path `copy` uses, so VS Code and the playground
write it with the clipboard they already have. The item **Copy code** is shown for exactly one
selected code note (an element or a sequence note), in the editing menus and in
`openReadOnlyMenu`, and `copyText` joins the commands a view-only canvas allows. Ctrl+C keeps
copying the element as a fragment.

- Alternative: a button on the block shown on hover. Rejected: a floating control on the canvas,
  against the owner's rule.
- Alternative: Ctrl+Shift+C. Rejected: no new shortcuts; the browser uses it for its inspector.
- Alternative: the item for every element with text. Rejected: one more item in every menu for a
  need that only snippets have.

### D9. Code block is an item of the note button's menu, not a remembered kind

The note button becomes a split button on the flow, free and C4 palettes (`splitArrow`, as the
group button). Its main part and O create a plain note, as today. The menu has **Note** and
**Code block**; each creates its note at once. A code block is one edit, one undo step: the
declaration `note <id> "<word>"` with the interface's word (**Code**, **Código**), its `place`,
and `style <id> { textFormat code }`; the create operation of `packages/edit` takes the format,
as it takes an icon. The note is selected and its editor opens with the word selected, so a paste
replaces it. Dragging the item places it where it is dropped. The button stays hidden on
sequence diagrams and read-only canvases.

- Alternative: the main part remembers the last kind, as the group button does. Rejected: O would
  sometimes create a code block; the owner called this a shortcut, not a mode.
- Alternative: a separate palette button. Rejected: a tool per format, and it is a note.

### D10. Format opens the Text group, directly above Font; Plain text removes the property

`inspector.ts` adds `{ name: "textFormat", type: "enum", options: ["plain", "code"] }` before
`font` in the text fields, shown when every selected target is a note that takes it, and `STRIP`
lists `style.textFormat` before `style.font`; `property-tabs.ts` adds it to `TEXT`. Choosing
**Code** writes `textFormat code` in the note's `style`; choosing **Plain text** removes the
property rather than writing `plain`, unless a class or rule makes the note code, in which case
it writes `textFormat plain`. The effective font shown by **Font** (`packages/editor/src/fonts.ts`)
is the theme's mono family for a code note without a written `font`.

- Alternative: a toggle in the context menu. Rejected: the owner placed it in Properties → Text.

### D11. Viewers show the text in the detail panel, and sequence code notes become selectable

The viewer data of an element gains its text format, and the data of a sequence drawing gains its
code notes by event key. In `packages/player` (used by the catalog and published pages), selecting
a code note shows its text in a `<pre>` in the page's monospace stack with `tab-size: 4`, and a
**Copy code** button that writes it with `navigator.clipboard.writeText`, falling back to
selecting the block's text when the clipboard is refused, and announcing the result in the
panel's live region. A sequence note of format `code` is selectable by pointer and by the arrow
keys as an element is; plain sequence notes stay as they are.

- Alternative: a copy button drawn over the block in the viewer. Rejected: a second floating
  affordance where the panel already holds an element's details.
- Alternative: leave sequence notes out of the viewers. Rejected: the same block would be
  copyable in one profile and not in another.

### D12. The label stays a one-line string

A code note's text is the note's label, written by `quoteString` with `\n`, `\t`, `\"` and `\\`.
Nothing in this change reads or writes another form.

- Alternative: a block literal for labels in this change. Rejected: it belongs to
  `multiline-strings` (see the proposal's non-goals); the format property does not depend on it.

## Risks / Trade-offs

- [Existing drawings with stray double or trailing spaces move by the width of a space under
  `embedded` and `system`] → It is what `outlined` and the layout already assume; the visual
  suite of `packages/acceptance` shows every baseline that changes, each reviewed before it is
  accepted.
- [A renderer that ignores `xml:space`] → Task 1.1 checks Edge, the PDF print and resvg before
  anything else is built; a renderer that fails it is named in the decision note with what its
  users should export (`--fonts outlined` keeps spaces everywhere).
- [Tab inside the editor traps keyboard focus] → Escape and Ctrl+Enter leave, and the editor's
  description names them; only code notes behave so.
- [`drawnLines` misses a line with a tab, so the editor opens off its text] → It compares against
  `expandTabs` of each line; a webview scenario edits a tabbed note.
- [A rotated code note with a clipped text] → The clip is in the group's coordinates, as for
  stickies, so it turns with the note; a layout test covers a turned, clipped note.
- [The panel colours do not suit a theme that only extends a built-in one] → The tokens are
  inherited and can be written; the theme panel shows them.
- [A long snippet makes a very wide note] → Size follows the text by design; `fontSize` and a
  written `size` are the two controls, both in the inspector.
