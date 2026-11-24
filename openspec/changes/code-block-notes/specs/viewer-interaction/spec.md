# Spec Delta

## ADDED Requirements

### Requirement: Code notes in the detail panel
In the HTML player, the catalog and published pages, selecting a code note SHALL open the detail panel with the note's text in a preformatted block: a monospace font, every space, tab and line break kept, tabs four characters wide, lines not wrapped and scrolled sideways inside the block, and text that can be selected. A plain note's panel SHALL stay as it is.

#### Scenario: The block in the panel
- **WHEN** a reader of a published flow drawing clicks a code note
- **THEN** the panel shows the note's lines with their indentation in a monospace block whose text can be selected

#### Scenario: A long line
- **WHEN** the selected code note has a line wider than the panel
- **THEN** the block scrolls sideways, the line is not wrapped, and the panel keeps its width

#### Scenario: A plain note
- **WHEN** a reader selects a note without the code format
- **THEN** the panel shows what it showed before, with no preformatted block

### Requirement: Copy code in the detail panel
Above the block the panel SHALL show a **Copy code** button (**Copiar código**) that puts the text on the clipboard as plain text, a line feed for each line break and its spaces and tabs as written, and announces the copy in a polite live region. When the page may not write to the clipboard, the button SHALL select the whole block and say that it can be copied with the keyboard.

#### Scenario: Copy from a published page
- **WHEN** a reader presses **Copy code** in the panel of a code note
- **THEN** the clipboard holds the note's text with its indentation and line breaks, the live region announces the copy, and the drawing is unchanged

#### Scenario: The clipboard is refused
- **WHEN** the page is embedded where clipboard writes are denied and **Copy code** is pressed
- **THEN** the block's text is selected, the live region says it is selected and can be copied with the keyboard, and no error is shown

#### Scenario: From the keyboard
- **WHEN** a code note is selected with the arrow keys and Enter, and Tab moves to **Copy code** and Enter presses it
- **THEN** the text is copied and the focus stays on the button

### Requirement: Selecting a code note of a sequence drawing
A code note of a sequence diagram SHALL be selectable in the viewers as an element is, by a click or tap and by the arrow keys of the stage, with the ring and the detail panel of a code note. A plain note of a sequence diagram SHALL stay as it is.

#### Scenario: A click on the note
- **WHEN** a reader clicks a code note of a sequence drawing in the player
- **THEN** the ring is drawn around the note and the panel shows its text and **Copy code**

#### Scenario: A plain sequence note
- **WHEN** a reader clicks a note of a sequence drawing that has no code format
- **THEN** no preformatted block and no **Copy code** button are shown for it
