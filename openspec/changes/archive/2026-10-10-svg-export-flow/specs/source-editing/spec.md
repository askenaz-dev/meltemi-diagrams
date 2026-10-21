## MODIFIED Requirements

### Requirement: Remove element with dependency detection
`removeElement` without `cascade` SHALL be rejected with `edit.has-dependents` listing every relation, placement, style and animate statement that references the element, each with its range. With `cascade` the plan SHALL delete the element declaration and every dependent statement, removing a whole line when the statement owns it and the statement plus one `;` separator when it shares a line. A `style` or `animate` statement that lists other targets SHALL keep its statement and lose only the removed target and its separating comma.

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
