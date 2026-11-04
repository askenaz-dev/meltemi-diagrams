# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: A cloud project bound to the Studio`
- TO: `### Requirement: A cloud project bound to the page`

## MODIFIED Requirements

### Requirement: A cloud project bound to the page
Opening a cloud project SHALL load its files into the page, connect to its room, and keep
them in step: typing, canvas edits, quick fixes, formatting, renames, imports, added and deleted
files SHALL become transactions of the document, merged and sent at most every 250 ms; changes
from the room SHALL update the text, the code pane (keeping the caret), the canvas and the
analysis, and SHALL not enter the person's undo. A kind 4 answer of the room to a local edit
SHALL be shown in the status line naming the limit, the local text SHALL return to the room's
state and the socket SHALL be reopened. The last file open in each project SHALL be remembered
per browser.

#### Scenario: A canvas edit reaches the room
- **WHEN** the person drags an element of a `layout manual` diagram
- **THEN** the room's `Y.Text` of that file holds the new `place` line

#### Scenario: A remote change keeps the caret
- **WHEN** the caret is on line 10 and a remote change inserts two lines above it
- **THEN** the caret stays on the same text, now on line 12, and the canvas redraws after the analysis pause

#### Scenario: A remote change does not undo locally
- **WHEN** a remote change arrives and the person presses Ctrl+Z
- **THEN** only the person's last own edit is undone and the remote change stays

#### Scenario: A refused transaction
- **WHEN** the room answers kind 4 `doc.too-large` for a local edit
- **THEN** the status line names the limit, the local text returns to the room's state and the socket is reopened
