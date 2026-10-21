## MODIFIED Requirements

### Requirement: One undo history
Every change of a file (typing, canvas edits, quick fixes, formatting, renames, imports) SHALL go
through one history per file. Ctrl+Z SHALL undo, and Ctrl+Shift+Z and Ctrl+Y redo, wherever the
focus is in the page, so that a canvas edit and the typing around it undo in order. Typing SHALL
coalesce into one step until a pause of 700 ms or a line break. In a cloud project the history
SHALL hold the person's own transactions only, grouped by the same rules, and changes that
arrive from the room SHALL never be undone by the person.

#### Scenario: Undo a canvas edit from the code
- **WHEN** the person moves an element on the canvas, focuses the code pane and presses Ctrl+Z
- **THEN** the element's previous position is back in the text and on the canvas

#### Scenario: Only one's own edits in a cloud project
- **WHEN** a remote change arrives after the person's edit and the person presses Ctrl+Z
- **THEN** the person's edit is undone and the remote change stays

### Requirement: Work kept in the browser
The page SHALL keep the anonymous project in the browser's storage after each change, text
files and images up to 512 KiB each, and open it on the next visit. It SHALL work when storage
is unavailable or full, saying that the work will not be kept. "New from template" SHALL ask
before replacing work that differs from every template. Cloud projects SHALL be kept as their
documents in IndexedDB, so a cloud project opens from there when the room cannot be reached, and
the anonymous project and the cloud projects SHALL never replace each other. The page itself
does not load without a connection (it has no service worker).

#### Scenario: Next visit
- **WHEN** the person edits a file and reloads the page
- **THEN** the edited text is open

#### Scenario: A cloud project reopens offline
- **WHEN** a signed-in person had a cloud project open, the connection to the room drops, and the person reloads the page or opens the project again
- **THEN** the project opens from IndexedDB with its last state and the status line says offline

#### Scenario: Storage full
- **WHEN** the browser refuses to store the anonymous project
- **THEN** the page keeps working and says the work will not be kept
