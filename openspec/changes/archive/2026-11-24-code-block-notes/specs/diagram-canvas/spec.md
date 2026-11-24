# Spec Delta

## MODIFIED Requirements

### Requirement: Editing text in place
Enter or F2 on an element or relation, or a double-click, SHALL open an inline editor over the text it edits: an element's text area (its label box, a shape's inscribed area, the body of `person` and `agent`), a relation's label or, without one, its midpoint. The editor SHALL use the font, size at the current zoom, weight, colour and alignment of the drawn text, SHALL have no background, no border and no browser autocomplete, spelling or correction, SHALL hide the drawn text while open, and SHALL grow with its lines. Enter, Tab or a click outside SHALL commit with `setElementLabel` or `setRelationLabel`; Shift+Enter SHALL insert a line break, written `\n`; Escape SHALL cancel. Shift+F2 SHALL rename the id with `renameElement` or `renameRelation` in the same editor, on one line. The editor of a code note SHALL commit, break lines and indent with the keys of "Typing in a code note" instead.

#### Scenario: Edit a label
- **WHEN** the label of `api` is edited to `Orders API` and committed
- **THEN** only the label string of `api`'s declaration changes

#### Scenario: Text added to an empty shape
- **WHEN** an empty `box box1 ""` with `shape hexagon` is double-clicked, `Payments` is typed and Enter is pressed
- **THEN** the declaration reads `box box1 "Payments"`, and while typing the editor lay inside the hexagon in the drawing's font size at the current zoom

#### Scenario: Two lines
- **WHEN** `Planner`, Shift+Enter and `agent` are typed in the editor of `node1` and Enter is pressed
- **THEN** the declaration's label is `"Planner\nagent"` and the node draws two lines

#### Scenario: Cancel
- **WHEN** the editor of `api` is open, `x` is typed and Escape is pressed
- **THEN** the text is unchanged and `api`'s drawn label is shown again

#### Scenario: No autocomplete
- **WHEN** the editor is open
- **THEN** it is a text area with autocomplete, autocorrect and spellcheck off

#### Scenario: Enter in a plain note still commits
- **WHEN** Enter is pressed in the editor of a note without `textFormat code`
- **THEN** the edit is committed, as for any label

## ADDED Requirements

### Requirement: Typing in a code note
In the editor of a code note Enter SHALL insert a line break followed by the leading spaces and tabs of the caret's line; Tab SHALL insert one indentation unit at the caret, or at the start of every line the selection touches; Shift+Tab SHALL remove one unit from the start of those lines; Ctrl+Enter (Cmd+Enter on a Mac) or a click outside SHALL commit; Escape SHALL cancel. Renaming with Shift+F2 SHALL keep the keys of every rename.

#### Scenario: Typing code
- **WHEN** in the editor of a code note whose text is `if (a) {` the caret is at the end, and Enter, Tab, `return;`, Enter, Shift+Tab, `}` and Ctrl+Enter are pressed
- **THEN** the declaration's label is `"if (a) {\n  return;\n}"` and the editor stayed open until Ctrl+Enter

#### Scenario: Leaving from the keyboard
- **WHEN** the editor of a code note is open and Escape is pressed after typing
- **THEN** the text is unchanged and the block is drawn again

#### Scenario: A click outside commits
- **WHEN** a line is added in the editor of a code note and the stage is clicked
- **THEN** the label holds the added line

### Requirement: The editor of a code note
The indentation unit SHALL be a tab when a line of the text starts with a tab, otherwise the smallest run of leading spaces among its indented lines, and two spaces when no line is indented. The editor SHALL lie inside the panel's insets in the block's font, SHALL show a tab as wide as the drawing does, and SHALL name its keys in its description for assistive technology.

#### Scenario: Indenting a selection with the text's own unit
- **WHEN** a code note's text indents with four spaces, two of its lines are selected in the editor and Tab is pressed, then Shift+Tab twice
- **THEN** each of the two lines first gains four leading spaces, then loses four with each Shift+Tab until it has none, and the other lines are unchanged

#### Scenario: Text indented with tabs
- **WHEN** a line of the text starts with a tab and Tab is pressed at the start of another line
- **THEN** a tab is inserted, and it is as wide in the editor as in the drawing

#### Scenario: Over its drawing
- **WHEN** the editor of a code note opens at 100 % and at 200 % zoom
- **THEN** its first line lies over the drawn first line within one pixel, inside the panel's insets

#### Scenario: The keys are announced
- **WHEN** a screen reader focuses the editor of a code note
- **THEN** its description names Tab, Shift+Tab, Ctrl+Enter and Escape with what each does

### Requirement: Format field of notes
With only notes selected, the Text category of the properties SHALL show **Format** as the first field of its Text group, directly above **Font**, as a choice between **Plain text** and **Code** (**Formato**, **Texto normal**, **Código**), on flow diagrams, free compositions, C4 views and sequence diagrams. It SHALL show the format the notes have and no choice when they differ. A selection that holds anything else SHALL not show it.

#### Scenario: Above Font
- **WHEN** a note is selected and the Text category is opened
- **THEN** **Format** shows **Plain text** chosen, and **Font** comes directly after it

#### Scenario: Notes that differ
- **WHEN** a plain note and a code note are selected
- **THEN** **Format** is shown with neither choice marked

#### Scenario: A mixed selection
- **WHEN** a note and a box are selected
- **THEN** the Text category shows no **Format** field

### Requirement: Choosing a format
**Code** SHALL write `textFormat code` in the style of each selected note in one edit; **Plain text** SHALL remove the written `textFormat`, and SHALL write `textFormat plain` only for a note a class or a rule makes code. Neither SHALL change a label, a size or another property, each SHALL be one undo step, and a read-only canvas SHALL write nothing. With a code note and no written `font`, **Font** SHALL show the theme's monospace family.

#### Scenario: To code and back
- **WHEN** **Code** is chosen for note `snippet` whose label is `"a\n  b"`, and then **Plain text**
- **THEN** the text first gains `style snippet { textFormat code }` and then loses it, the label string is the same bytes throughout, and two undo steps restore the first state

#### Scenario: A note made code by a rule
- **WHEN** the diagram has `rule note { textFormat code }` and **Plain text** is chosen for `legend`
- **THEN** the text gains `style legend { textFormat plain }` and `legend` is drawn as a plain note

#### Scenario: The font of a code note
- **WHEN** a code note without a written `font` is selected under `technical.light`
- **THEN** **Font** shows Cascadia Mono as the inherited family

#### Scenario: Read-only
- **WHEN** a code note is selected on a read-only canvas
- **THEN** no choice of **Format** changes the document

### Requirement: Code block in the note tool's menu
On flow diagrams, free compositions and C4 views the palette's note button SHALL be a split button: its main part and O create a plain note as before, and its arrow, a right-click or a held press opens a menu with **Note** and **Code block** (**Nota**, **Bloque de código**), each creating its note at once, or where it is dropped. On a sequence diagram and on a read-only canvas the button and its menu SHALL stay hidden.

#### Scenario: The menu
- **WHEN** the arrow of the note button is pressed on a free composition
- **THEN** a menu opens with **Note** and **Code block**, and Escape closes it with the focus back on the arrow

#### Scenario: The main part still creates a note
- **WHEN** **Code block** was used and O is pressed afterwards
- **THEN** a plain `note note2 "Note"` is created, with no `textFormat`

#### Scenario: Hidden where notes cannot be placed
- **WHEN** the canvas shows a sequence diagram, or is read-only
- **THEN** neither the note button nor its menu is shown

### Requirement: Creating a code block
**Code block** SHALL write, in one edit that is one undo step, `note <id> "<word>"` with the interface's word for code, a `place` near the centre or at the drop, and `style <id> { textFormat code }`; it SHALL select the note and open its editor with the word selected, so a paste replaces it.

#### Scenario: A code block from the menu
- **WHEN** **Code block** is chosen on a free composition with the interface in English
- **THEN** the text gains `note note1 "Code"`, a `place` near the centre and `style note1 { textFormat code }`, `note1` is selected, its editor is open with `Code` selected, and one undo removes the three statements

#### Scenario: Paste into the new block
- **WHEN** a fragment of seven lines is pasted into that editor and Ctrl+Enter is pressed
- **THEN** the label is the seven lines with their indentation and the block is drawn at its text's size

#### Scenario: Dropped on the canvas
- **WHEN** **Code block** is dragged from the menu and dropped at a point of a flow diagram in manual layout
- **THEN** the note's `place` is that point and its editor opens there

### Requirement: Copy code in the context menu
With exactly one code note selected, an element or a note of a sequence diagram, the context menu SHALL offer **Copy code** (**Copiar código**), on canvases that edit and on read-only ones. It SHALL put the note's text on the clipboard as plain text, a line feed for each line break and its spaces and tabs as written, change nothing in the document and say so in the status line. Copy (Ctrl+C) SHALL keep copying the selection as a fragment.

#### Scenario: The fragment comes back as pasted
- **WHEN** **Copy code** is chosen for a code note whose text was pasted from an editor, and the clipboard is pasted into that editor
- **THEN** the pasted text equals the original, character for character, tabs included

#### Scenario: On a read-only canvas
- **WHEN** a visitor of a view-only link opens the context menu of a code note
- **THEN** **Copy code** is offered and puts the text on the clipboard

#### Scenario: Not for a plain note
- **WHEN** the context menu of a note without `textFormat code` is opened
- **THEN** it holds no **Copy code** item, and Ctrl+C copies the note as a fragment

#### Scenario: Several notes
- **WHEN** two code notes are selected and the context menu is opened
- **THEN** it holds no **Copy code** item
