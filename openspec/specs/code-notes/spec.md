# code-notes Specification

## Purpose
Notes that hold a fragment of code: what the `code` format of a note means in each profile, how such a note is drawn and sized, and that its text, indentation and line breaks survive edits, format changes, saving and every output.

## Requirements

### Requirement: The format of a note
A note SHALL have a text format, `plain` or `code`, taken from the `textFormat` of its resolved style: the `note` elements of flow diagrams, free compositions and C4 views and the `note` events of sequence diagrams. Without the property a note SHALL be `plain` and SHALL be drawn, sized and edited as its profile says. A note whose format is `code` is a code note.

#### Scenario: A document without the property
- **WHEN** a file written before the property existed declares `note limits "Limits to confirm\n500 rps per tenant"` and is compiled and exported
- **THEN** no diagnostic is reported for the note and its drawing is the plain note of its profile, with no panel and in the theme's body font

#### Scenario: A code note in each profile
- **WHEN** a flow diagram, a free composition and a C4 view each declare `note n "a\n  b"` with `style n { textFormat code }`, and a sequence diagram declares `note n over api "a\n  b"` with the same style
- **THEN** the four compile without diagnostics and each scene draws `n` as a code block

### Requirement: Format changes keep the text
Changing a note's format SHALL never change its label: its characters, spaces, tabs and line breaks stay as written, and changing back SHALL restore the plain drawing of the same text. Nothing in a label selects the format: a label that holds Markdown fence markers SHALL be drawn with them as text.

#### Scenario: Switching the format keeps the text
- **WHEN** `style snippet { textFormat code }` is removed from a note whose label is `"if (a) {\n\treturn;\n}"` and later written again
- **THEN** the label string of the declaration is the same bytes at each step, and the note is drawn plain, then as a code block

#### Scenario: Markdown fences are text
- **WHEN** a note's label is ```` "```js\nreturn;\n```" ```` with `textFormat code`
- **THEN** the block draws three lines, the first and the last showing the fence markers, and no diagnostic names Markdown

### Requirement: The text of a code note
A code note of a flow diagram, a free composition or a C4 view SHALL draw one text item per line of its label, an empty line keeping its height, in the theme's `mono` font at the theme's `noteSize` and weight 400 with the note's line height, in the theme's `codeText`, start-anchored at one x and never wrapped. A written `font`, `fontSize`, `fontWeight`, `color` and, in a free composition, `textAlign` SHALL replace each default.

#### Scenario: The fragment's lines
- **WHEN** a free composition declares a note whose label is the seven lines `exports.onExecutePostLogin = async (event, api) => {`, `  if (event.client.client_id !== "CLIENT_ID_WEB") {`, `    return;`, `  }`, an empty line, `  // Aplicar lógica específica de la app web.` and `};`, with `textFormat code`, under `technical.light`
- **THEN** the scene holds seven text items in the mono role at 11 px in `#1f2328`, 18 units apart and start-anchored at the same x, the second holding its two leading spaces, the third its four, and the fifth empty

#### Scenario: Styles adjust the text
- **WHEN** the note also has `style snippet { font "Roboto Mono"; fontSize 13; fontWeight 500; color "#ffffff" }`
- **THEN** the lines are measured and drawn in Roboto Mono at 13 px, weight 500, in white

#### Scenario: A long line is not wrapped
- **WHEN** one line of the label is 140 characters long
- **THEN** the scene draws it as one text item and the note is as wide as that line needs

### Requirement: The panel of a code note
Behind its text a code note SHALL draw a rect with the note's `radius`, filled with the theme's `code` and stroked with the theme's `line` at `strokeWidth`; a written `fill`, `stroke`, `width`, `line` and `radius` SHALL replace each default. The text SHALL be inset from the rect by three quarters of the theme's `padding` left and right and half of it above and below, an icon, when styled, before the first line inside the inset.

#### Scenario: The fragment's panel
- **WHEN** the seven-line code note is laid out under `technical.light` with no other style
- **THEN** the scene holds one rect filled `#f3f5f8` and stroked with the theme's `line`, the lines start 12 units right of its left edge, and the first line's box starts 8 units below its top

#### Scenario: Styles adjust the panel
- **WHEN** the note has `style snippet { fill "#0b1830"; stroke "#22d3ee"; radius 4; line dashed }`
- **THEN** the rect is `#0b1830` with a dashed `#22d3ee` stroke and radius 4, and the insets are unchanged

#### Scenario: A dark theme
- **WHEN** the note is laid out under `technical.dark` with no style
- **THEN** the rect is `#131c2b` and the text `#e6edf3`

### Requirement: The size of a code note
A code note's default size SHALL be its widest line (with its icon) plus the horizontal insets, by its line count times the line height plus the vertical insets. A written `size` SHALL be kept; when it leaves less room than the text needs, the text SHALL be clipped to the rect inside its insets and `layout.text-overflow` SHALL be reported on the `size` with the size the text needs.

#### Scenario: The default size
- **WHEN** the seven-line code note has no `size` under `technical.light`
- **THEN** its box is its widest line's width plus 24 wide and 7 × 18 + 16 tall, and the rect is that box

#### Scenario: A size too small for the code
- **WHEN** `size snippet (120, 40)` is written for the seven-line note
- **THEN** `layout.text-overflow` is reported on the `size` with the size the text needs, the rect is 120 by 40, and every text item is clipped to the rect inside its insets

#### Scenario: A larger size
- **WHEN** `size snippet (640, 240)` is written
- **THEN** the rect is 640 by 240, the text keeps its insets from the top left, and no diagnostic is reported

### Requirement: A code note stays a note
A code note SHALL keep what a note of its profile has: its `on <element>` leader, `place`, layer, z-order, `rotation`, hit testing, selection, effects, `link`, `url`, and its exclusion from the label audit.

#### Scenario: A turned, attached code note
- **WHEN** a free code note is declared `on api` with `style snippet { rotation 10 }`
- **THEN** the panel and its lines turn together about the note's centre and the dotted leader joins the note to `api`

#### Scenario: A code note over a box
- **WHEN** a code note is placed over box `a`
- **THEN** no `layout.label-overlap` is reported for the note's text, as for a plain note

### Requirement: Code notes in sequence diagrams
A code note of a sequence diagram SHALL keep the folded-corner outline, the insets and the placement of a sequence note, with the theme's `code` as its default fill, `codeText` as its default text colour and `mono` as its default font, its lines never wrapped and its width following its widest line.

#### Scenario: A code note over a participant
- **WHEN** a sequence diagram has `note r over api "retry:\n  3 times"` with `style r { textFormat code }` under `technical.light`
- **THEN** the note keeps its folded corner, is filled `#f3f5f8`, and its two lines are in the mono role in `#1f2328`, the second holding its two leading spaces

#### Scenario: A rule for every note
- **WHEN** the diagram has `rule note { textFormat code }` and two notes
- **THEN** both are drawn as code notes and a note with `style n1 { fill "#fff" }` keeps its own fill

### Requirement: Code is saved as written
Committing the editor of a code note SHALL write the label with `\n` for each line break, `\t` for each tab, `\"` and `\\`, every space as typed, `\r\n` and `\r` read as one line break and trailing line breaks dropped. Reopening the file SHALL give the same label.

#### Scenario: Paste, save, reopen
- **WHEN** the seven lines of the fragment are pasted into the editor of a new code block, the edit is committed, and the file is saved and opened again
- **THEN** the declaration's label is `"exports.onExecutePostLogin = async (event, api) => {\n  if (event.client.client_id !== \"CLIENT_ID_WEB\") {\n    return;\n  }\n\n  // Aplicar lógica específica de la app web.\n};"` and the reopened canvas draws the same seven lines

#### Scenario: Windows line endings in a paste
- **WHEN** text with `\r\n` line endings and a trailing empty line is pasted and committed
- **THEN** the label holds one `\n` per line break, no `\r`, and no trailing `\n`

#### Scenario: Tabs in a paste
- **WHEN** Go code indented with tabs is pasted and committed
- **THEN** the label holds `\t` where the tabs were, and the block draws them at tab stops

### Requirement: The same block in every output
The canvas, the player, the SVG of the `system`, `embedded` and `outlined` font policies, PNG, PDF and the MCP preview SHALL draw a code note with the same indentation, repeated spaces and tab stops. Copying and pasting it on the canvas, duplicating it and converting its sheet to a free composition SHALL keep its format and its label.

#### Scenario: The three font policies agree
- **WHEN** the sheet is exported with `--fonts system`, `--fonts embedded` and `--fonts outlined`
- **THEN** in each SVG the third line's first glyph starts four character advances right of the first line's, and the three drawings place every line at the same x and baseline

#### Scenario: PNG and the MCP preview
- **WHEN** the sheet is exported with `--format png` and drawn by the MCP `preview` tool
- **THEN** both images show the second line indented by two characters and the third by four, as the SVG does

#### Scenario: Conversion keeps the format
- **WHEN** `convert --to free` is run on a flow sheet with a code note
- **THEN** the free composition declares the same note with the same label and `textFormat code`, and draws the same block

### Requirement: Language services for the text format
In the `style` block of a note, in `rule note { }` and in a class body, completion SHALL offer `textFormat` with its documentation, and after `textFormat ` the values `plain` and `code`; hover on the property and on each value SHALL describe them in the interface language. Completion SHALL not offer `textFormat` in the `style` block of a target that does not take it.

#### Scenario: Completing the value
- **WHEN** the caret is after `style snippet { textFormat ` and `snippet` is a note
- **THEN** completion lists `plain` and `code`, each with a one-line description

#### Scenario: Hover in Spanish
- **WHEN** the interface language is Spanish and the pointer rests on `textFormat`
- **THEN** the hover describes the property in Spanish and names the two values

#### Scenario: Not offered on a box
- **WHEN** the caret is inside `style api { ` and `api` is a box
- **THEN** completion does not list `textFormat`, and a written `textFormat code` there is underlined with `prop.invalid-value` and the hint that the property applies to notes
