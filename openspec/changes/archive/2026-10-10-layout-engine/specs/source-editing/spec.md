## MODIFIED Requirements

### Requirement: Rename element
`renameElement` SHALL replace every identifier token that resolves to the element: its declaration, relation endpoints, port references (`api.east`, `bus.in`), and the targets of placement, constraint, style and animate statements. Named ports keep their names. Strings and comments MUST NOT be modified; comments that contain the old identifier SHALL be listed in the `notes` of the plan. The operation SHALL be rejected with `edit.id-conflict` when the new id is already used, and with `edit.invalid-id` when it is not a valid identifier.

#### Scenario: Rename with references everywhere
- **WHEN** `api` is declared, used in two relations, in `route create from api.east ...`, in `place api at (...)` and in `style api { }` and the operation renames it to `gateway`
- **THEN** all six references become `gateway`, the label string `"API Gateway"` is unchanged, and the plan notes the comment `// api handles auth`

#### Scenario: Rename into an existing id
- **WHEN** elements `api` and `orders` exist and the operation renames `api` to `orders`
- **THEN** the plan is rejected with `edit.id-conflict` and the text is unchanged

#### Scenario: Rename an element used by constraints
- **WHEN** `api` appears in `row api, orders` and `distance api, db 80` and is renamed to `gateway`
- **THEN** both statements name `gateway`, and the text compiles without errors

### Requirement: Remove element with dependency detection
`removeElement` without `cascade` SHALL be rejected with `edit.has-dependents` listing every relation, placement, constraint, style and animate statement that references the element, each with its range. With `cascade` the plan SHALL delete the element declaration and every dependent statement, removing a whole line when the statement owns it and the statement plus one `;` separator when it shares a line. A `style` or `animate` statement that lists other targets SHALL keep its statement and lose only the removed target and its separating comma. A constraint that keeps at least two targets SHALL lose only the removed ones; a `distance`, or a constraint left with fewer than two targets, SHALL be deleted.

#### Scenario: Removal blocked by dependents
- **WHEN** `db` is referenced by one relation and one `place` statement and the operation is `removeElement(db, cascade: false)`
- **THEN** the plan is rejected with `edit.has-dependents` and two dependents are listed with their ranges

#### Scenario: Cascading removal
- **WHEN** the same operation runs with `cascade: true`
- **THEN** the declaration, the relation and the `place` statement are deleted, the surrounding comments remain, and reparsing reports no diagnostics

#### Scenario: Implicit elements survive the removal of their relations
- **WHEN** `a` is declared only by the relation `a -> b` and `removeElement(b, cascade: true)` runs
- **THEN** the relation is replaced by `node a`, statements that place or style `a` keep working, and the plan notes that `a` was kept

#### Scenario: One target of a shared style
- **WHEN** `style obo, ciba, cimd { line dashed }` exists and `removeElement(ciba, cascade: true)` runs
- **THEN** the statement becomes `style obo, cimd { line dashed }` and its block is untouched

#### Scenario: Last target of a shared style
- **WHEN** `style obo, ciba { line dashed }` exists and both `obo` and `ciba` are removed in one cascade
- **THEN** the whole statement is deleted

#### Scenario: Constraints lose a removed element
- **WHEN** `align a, b, c top`, `row b, c` and `distance a, c 80` exist and `removeElement(c, cascade: true)` runs
- **THEN** the first becomes `align a, b top`, the other two are deleted, and the text compiles without diagnostics
