## ADDED Requirements

### Requirement: Minimal text edits for placement operations
`planEdit(compilation, operation)` SHALL translate `setPosition`, `setSize`, `setRoute` and `setLabelAnchor` into text edits that replace only the tokens that change in the existing placement statement. Every byte outside the edited token ranges MUST be identical after applying the plan. Operations that target a relation MUST name a relation; an anonymous relation key SHALL be rejected with `edit.anonymous-relation` and the hint to run `materializeRelationId` first.

#### Scenario: Move an already placed box
- **WHEN** the source contains `  place api at (360, 180) // keep near the gateway` and the operation is `setPosition(api, 400, 200)`
- **THEN** the plan contains exactly two edits replacing `360` and `180`, and the trailing comment is untouched

#### Scenario: Replace route waypoints
- **WHEN** the source contains `route create from api.east to orders.west via [(520, 180)]` and the operation sets `via` to `[(500, 180), (500, 260)]`
- **THEN** only the text between `via ` and the end of the statement changes and the `from`/`to` ports are untouched

#### Scenario: Route on an anonymous relation
- **WHEN** the operation is `setRoute` with the relation key `orders->db#1`
- **THEN** the plan is rejected with `edit.anonymous-relation` and the text is unchanged

### Requirement: Insertion of missing placement statements
When the target has no placement statement, the plan SHALL insert one as a new line at the end of the existing `placement { }` block, indented like the existing statements of the block (or the parent indentation plus the detected indent unit when the block is empty), using the detected line ending of the document. When the diagram has no `placement` block, the plan SHALL insert `placement { ... }` as the last statement of the diagram block, preceded by a blank line when the previous statement is not blank.

#### Scenario: First position for an element in an existing block
- **WHEN** the placement block already contains two `place` statements indented with four spaces and the operation is `setPosition(db, 1000, 180)`
- **THEN** one edit inserts `    place db at (1000, 180)` plus the document line ending after the last statement of the block

#### Scenario: Diagram without placement block
- **WHEN** a diagram has no `placement` block and the operation is `setPosition(api, 360, 180)`
- **THEN** one edit inserts a `placement` block containing the `place` statement before the closing `}` of the diagram, and reparsing the result yields the placement in the model

#### Scenario: CRLF and tabs are respected
- **WHEN** the document uses CRLF line endings and tab indentation
- **THEN** inserted lines end with CRLF and are indented with tabs

### Requirement: Comment and formatting preservation
Applying any edit plan SHALL preserve every comment, blank line and `;`-joined statement that is not the target of the operation. Applying a plan and reparsing SHALL yield a CST whose untouched statements have identical text.

#### Scenario: Comments around the target
- **WHEN** the target statement is preceded by a block comment, followed by a line comment, and separated from the next statement by a blank line
- **THEN** after the edit all three are present unchanged and in the same positions relative to the statement

#### Scenario: Statement joined with semicolons
- **WHEN** `place api at (1, 1); place db at (2, 2)` is on one line and the operation moves `db`
- **THEN** only the numbers of the second statement change and the `;` layout is preserved

### Requirement: Rename element
`renameElement` SHALL replace every identifier token that resolves to the element: its declaration, relation endpoints, port references (`api.east`), and the targets of placement, style and animate statements. Strings and comments MUST NOT be modified; comments that contain the old identifier SHALL be listed in the `notes` of the plan. The operation SHALL be rejected with `edit.id-conflict` when the new id is already used, and with `edit.invalid-id` when it is not a valid identifier.

#### Scenario: Rename with references everywhere
- **WHEN** `api` is declared, used in two relations, in `route create from api.east ...`, in `place api at (...)` and in `style api { }` and the operation renames it to `gateway`
- **THEN** all six references become `gateway`, the label string `"API Gateway"` is unchanged, and the plan notes the comment `// api handles auth`

#### Scenario: Rename into an existing id
- **WHEN** elements `api` and `orders` exist and the operation renames `api` to `orders`
- **THEN** the plan is rejected with `edit.id-conflict` and the text is unchanged

### Requirement: Relation label and id materialisation
`setRelationLabel` SHALL replace the label string of a relation, add `: "label"` after the target when the relation has none, or remove the `: "label"` segment when the label is set to null. `materializeRelationId` SHALL insert ` as <id>` after the label (or after the target when there is no label) and before any block or terminator; it SHALL be rejected with `edit.already-named` when the relation already has an id and with `edit.id-conflict` when the id is taken.

#### Scenario: Materialise an anonymous relation
- **WHEN** the source contains `orders -> db: "Persist"` and the operation materialises key `orders->db#1` as `save`
- **THEN** the line becomes `orders -> db: "Persist" as save` and nothing else changes

#### Scenario: Materialise a named relation
- **WHEN** the relation already reads `... as save`
- **THEN** the plan is rejected with `edit.already-named`

### Requirement: Remove element with dependency detection
`removeElement` without `cascade` SHALL be rejected with `edit.has-dependents` listing every relation, placement, style and animate statement that references the element, each with its range. With `cascade` the plan SHALL delete the element declaration and every dependent statement, removing a whole line when the statement owns it and the statement plus one `;` separator when it shares a line.

#### Scenario: Removal blocked by dependents
- **WHEN** `db` is referenced by one relation and one `place` statement and the operation is `removeElement(db, cascade: false)`
- **THEN** the plan is rejected with `edit.has-dependents` and two dependents are listed with their ranges

#### Scenario: Cascading removal
- **WHEN** the same operation runs with `cascade: true`
- **THEN** the declaration, the relation and the `place` statement are deleted, the surrounding comments remain, and reparsing reports no diagnostics

#### Scenario: Implicit elements survive the removal of their relations
- **WHEN** `a` is declared only by the relation `a -> b` and `removeElement(b, cascade: true)` runs
- **THEN** the relation is replaced by `node a`, statements that place or style `a` keep working, and the plan notes that `a` was kept

### Requirement: Inverse edits and revision checks
Every plan SHALL carry `baseRevision` and an `inverse` edit list. `applyEdits(document, plan)` SHALL reject with `edit.stale-revision` when the document revision differs from `baseRevision`, and otherwise SHALL return the new text and a new revision. Applying `inverse` to the new text MUST restore the previous text exactly.

#### Scenario: Inverse restores the original
- **WHEN** any edit fixture is applied and then its inverse is applied
- **THEN** the resulting text equals the original byte for byte

#### Scenario: Stale revision
- **WHEN** a plan is created against revision 3 and the document is now at revision 4
- **THEN** `applyEdits` rejects with `edit.stale-revision` and the document is unchanged

### Requirement: Unsafe targets are rejected
When the diagram containing the target has syntax errors, or the target cannot be located in the source map, `planEdit` SHALL reject with `edit.unsafe-target` and a message explaining what prevents the edit.

#### Scenario: Diagram with a syntax error
- **WHEN** the target diagram contains an unterminated string on another line and the operation is `setPosition`
- **THEN** the plan is rejected with `edit.unsafe-target` naming the line of the syntax error
