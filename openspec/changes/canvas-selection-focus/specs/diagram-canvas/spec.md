## MODIFIED Requirements

### Requirement: Keyboard operation and focus
Every pointer action SHALL have a keyboard alternative, as listed in decision 0017 and the editor guide. Focus SHALL be visible on every control and on the focused element. Elements SHALL expose their kind and label to assistive technology. A live region SHALL announce the selection and the result of each action. The canvas SHALL not use keys that VS Code binds globally (Ctrl+G, Ctrl+Shift+G, Ctrl+K chords, Ctrl+Alt with the arrows, Alt with Left or Right, Ctrl+Alt+B), and SHALL leave undo and redo to VS Code; the inspector's fold has its header and rail buttons on every canvas and the host's own chord where the host binds one.

#### Scenario: Keyboard only
- **WHEN** a user tabs into the canvas, selects `api` with Tab, nudges it with Shift+Right and presses Delete then confirms
- **THEN** each step has a visible focus indicator and an announcement, and the text changes as with the pointer

#### Scenario: Ctrl+Alt+B reaches the host
- **WHEN** the stage has the focus and Ctrl+Alt+B is pressed
- **THEN** the canvas handles nothing and does not prevent the event, which reaches the host's page; in the playground that page folds the properties

#### Scenario: A selection announcement ends with its focus or diagram

- **GIVEN** the canvas displays the announcement for a selected note
- **WHEN** focus leaves the stage or the canvas shows a different diagram
- **THEN** the previous selection announcement SHALL be cleared
- **AND** selecting another element SHALL announce the new selection

#### Scenario: A render drops the announced selection

- **GIVEN** the canvas displays a selection announcement
- **WHEN** a render replaces or drops the selection
- **THEN** the previous selection announcement SHALL be cleared
