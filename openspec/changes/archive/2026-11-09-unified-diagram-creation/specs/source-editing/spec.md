## ADDED Requirements

### Requirement: Creation from diagram starters
Source editing SHALL accept the seven starter identities Flow, Sequence, C4, Gantt, Whiteboard, Kanban and Free composition. It SHALL create valid source in one plan, using a supplied title or a generated name, and SHALL refuse an unknown starter or invalid explicit id with `edit.invalid-value`. Starter identities SHALL remain distinct from diagram-language profiles.

#### Scenario: An empty profile starter
- **WHEN** Flow, Sequence, Gantt or Free composition is created in an empty document
- **THEN** the source has the language header and one diagram of the corresponding profile, and compiles without diagnostics

#### Scenario: Unknown starter
- **WHEN** creation names a starter outside the catalogue
- **THEN** it is refused with `edit.invalid-value` and writes nothing

#### Scenario: Invalid explicit id
- **WHEN** starter creation supplies an id that is invalid or already bound at the top level
- **THEN** it is refused with `edit.invalid-value` and writes nothing

### Requirement: Self-contained C4 starter
The C4 starter SHALL create one model with a generic person, a generic system and their uses relation, plus one context view of that model in the same document. Generated model and view names SHALL avoid every existing top-level declaration and import binding. It SHALL NOT reuse an unrelated model implicitly or require a manifest, another file or a network request.

#### Scenario: C4 in an empty document
- **WHEN** the C4 starter is applied to an empty document
- **THEN** the new model and context view resolve together and compile and lay out without diagnostics

#### Scenario: Existing top-level bindings
- **WHEN** the document already binds default starter names as models, views, themes, stories, exports or imports
- **THEN** generated names avoid all bindings and the C4 view uses the newly created model

### Requirement: Prepared free boards
Whiteboard SHALL create a free diagram with a growing board preset, a bundled sketch theme, a heading and an editable sticky. Kanban SHALL create a free board with a row container, three column lists and an editable starter sticky. Generated labels SHALL use the requested interface language. Free composition SHALL create an empty free diagram. The boards SHALL need no assets, imports or demonstration story.

#### Scenario: Whiteboard
- **WHEN** Whiteboard is chosen in Spanish
- **THEN** a free board is generated with editable Spanish heading/sticky text and a bundled sketch theme, and validation has no diagnostics

#### Scenario: Kanban
- **WHEN** Kanban is chosen in English
- **THEN** the free board holds three column lists labelled To do, Doing and Done, with a starter sticky in the first column, and validation has no diagnostics

#### Scenario: Language changes after insertion
- **WHEN** a board is created and the interface language changes afterwards
- **THEN** the inserted source text is not rewritten

### Requirement: Atomic starter insertion and inverse
Starter creation SHALL preserve all source outside its insertion, including comments and detected line endings, and add a language header only when needed. Its inverse SHALL restore the exact previous text. An unsafe source target SHALL be refused with `edit.unsafe-target`; a failed validation SHALL leave the document unchanged. Generated local identifiers and placements SHALL resolve within their new diagram.

#### Scenario: Append with comments and CRLF
- **WHEN** a starter is appended to valid CRLF source with comments after its final existing block
- **THEN** the comments remain attached to that block, inserted source uses CRLF and applying the inverse restores the original bytes

#### Scenario: Invalid source
- **WHEN** a starter cannot safely be inserted because the source has syntax errors
- **THEN** the edit is refused with `edit.unsafe-target` and no partial model, view or board appears

#### Scenario: Undo C4 and Kanban
- **WHEN** a C4 starter or Kanban is appended and then undone
- **THEN** its entire insertion disappears in one undo step and all prior source is restored exactly
