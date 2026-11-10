## ADDED Requirements

### Requirement: Illustrated diagram starter choices

New diagram SHALL show a distinct colored vector example for each of its seven starter choices,
with its localized name and description. A localized hint SHALL identify the drawings as examples
of what can be created. The examples SHALL load locally without network or renderer initialization.
They SHALL preserve the catalogue identities, order and document creation semantics.

#### Scenario: Recognize each diagram type

- **WHEN** New diagram is opened from any project
- **THEN** flow, sequence, C4, Gantt, whiteboard, Kanban and free composition each have a distinct
  visible illustration using the product's palette and retaining readable labels

#### Scenario: Select an illustration accessibly

- **WHEN** an author clicks an illustration or navigates its native radio choices with arrow keys
- **THEN** exactly one choice is selected, visible focus remains available and the same starter
  identity is passed on creation, while illustrations add no separate keyboard or spoken controls

#### Scenario: Use a small or dark viewport

- **WHEN** the dialog is opened in English or Spanish, light or dark, at 320 pixels or on desktop
- **THEN** previews and labels remain visible without horizontal overflow, the body can scroll,
  and Cancel/Create remain reachable with clear selected and focused states

#### Scenario: Leave the form without creating

- **WHEN** the author changes the illustrated selection and cancels or presses Escape
- **THEN** every existing file remains identical and focus returns to the explorer
