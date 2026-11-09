## MODIFIED Requirements

### Requirement: Empty file and new diagrams
When the document has no diagram and no story is playing, the canvas SHALL show the reason and
the same ordered starter catalogue as the explorer: Flow, Sequence, C4 architecture, Gantt,
Whiteboard, Kanban and Free composition, with translated descriptions. It SHALL clear the
diagram selector, inspector, minimap and layout and stale badges of the last render. Choosing
a starter SHALL write its valid source as one undoable edit and show its new diagram. A **New
diagram** button beside the diagram selector SHALL offer the same choices for any file. The
catalogue SHALL be identical in browser and VS Code canvases and independent of the active
diagram and initial project template. Read-only canvases SHALL show neither the creation
choices nor the New diagram button.

#### Scenario: Start from an empty file
- **WHEN** the text is emptied and Flow is chosen
- **THEN** the text becomes `language "0.2"`, a blank line and `diagram diagram1: flow {` … `}`, the canvas shows the empty diagram with its palette, and the selector names `diagram1`

#### Scenario: Nothing stale is left
- **WHEN** a file showing `overview` is emptied
- **THEN** the selector, the inspector, the minimap and the layout badge no longer show `overview`

#### Scenario: Another diagram in the file
- **WHEN** New diagram › Free composition is chosen in a file declaring `overview`
- **THEN** `diagram diagram1: free {` … `}` is appended after `overview` and shown

#### Scenario: A Gantt chart from an empty file
- **WHEN** the text is emptied and Gantt is chosen in Spanish
- **THEN** the text becomes `language "0.2"`, a blank line and `diagram diagram1: gantt {` … `}`, and the canvas shows an empty timeline of four weeks with the Task, Milestone, Marker and Section tools

#### Scenario: Read-only
- **WHEN** the canvas is read-only and the file has no diagram
- **THEN** the reason is shown without creation choices

#### Scenario: Matching catalogues in both hosts
- **WHEN** the explorer dialog, canvas New diagram menu and empty-file state are opened in English and Spanish
- **THEN** they offer the same seven identities in the same order, with translated labels and descriptions, and the browser and VS Code canvas agree

#### Scenario: C4 is ready to edit
- **WHEN** C4 architecture is chosen in an empty file
- **THEN** a model and initial context view are created together with no diagnostics, and the new view is selected

#### Scenario: Add a board to an existing file
- **WHEN** Whiteboard or Kanban is chosen in a file already holding a sequence diagram, a theme and a story
- **THEN** a valid free board is appended, the existing source stays byte-identical outside the insertion and undo restores the prior text exactly

#### Scenario: Repeated C4 additions
- **WHEN** C4 architecture is added twice to a file already using default top-level names
- **THEN** each addition has fresh model and view ids, selects its own view and compiles without diagnostics

#### Scenario: An invalid creation request
- **WHEN** an incoming creation message names an unknown starter or has an invalid payload
- **THEN** the protocol ignores the malformed message without creating an edit or changing the displayed document

#### Scenario: A stale creation request
- **WHEN** a valid creation action uses a stale document revision
- **THEN** it is refused with the stale-revision diagnostic, no source changes, and the current document remains displayed
