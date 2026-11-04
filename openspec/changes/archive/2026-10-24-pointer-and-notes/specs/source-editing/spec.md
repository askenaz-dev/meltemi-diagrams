## ADDED Requirements

### Requirement: Note attachment operations
`createElement` SHALL accept `attachedTo` for the kind `note` in flow and free diagrams, writing `note <id> "Text" on <element>`; an `attachedTo` with another kind SHALL be `edit.invalid-value`, and one naming no element of the diagram `edit.unsafe-target`. `attachNote { diagram, note, element }` SHALL write the `on` clause after the note's text, replace the target of an existing clause, or remove the clause when `element` is null, with a minimal edit of the declaration that keeps its block and comments; an unknown note or element SHALL be `edit.unsafe-target`, a target that is not a note or is the note itself `edit.invalid-value`. `removeElement` SHALL list every note attached to the removed element, or to an element removed with it, as a dependent of kind `attachment` named after the note, and with `cascade` SHALL strip ` on <element>` from each such note's declaration and keep the note. `renameElement` SHALL rewrite the attachment targets that name the element. Every result SHALL compile without new errors.

#### Scenario: Create an attached note
- **WHEN** `createElement { diagram: "checkout", elementKind: "note", label: "Idempotent", at: (700, 60), attachedTo: "api" }` runs
- **THEN** the diagram gains `note note1 "Idempotent" on api` and `place note1 at (700, 60)`

#### Scenario: Attach and detach
- **WHEN** `attachNote { diagram: "checkout", note: "note1", element: "db" }` runs on `note note1 "Idempotent" on api { class hot }`, then with `element: null`
- **THEN** the declaration reads `note note1 "Idempotent" on db { class hot }`, then `note note1 "Idempotent" { class hot }`

#### Scenario: Remove the element of a note
- **WHEN** `removeElement(api, cascade: false)` runs while `note note1 "Idempotent" on api` exists
- **THEN** it is rejected with `edit.has-dependents` listing an `attachment` dependent named `note1` with the declaration's range, and `removeElement(api, cascade: true)` leaves `note note1 "Idempotent"` in the diagram

#### Scenario: Rename the element
- **WHEN** `renameElement(api, gateway)` runs
- **THEN** the note reads `note note1 "Idempotent" on gateway`

#### Scenario: Attach a box
- **WHEN** `attachNote { diagram: "sheet", note: "api", element: "db" }` runs where `api` is a box
- **THEN** it is refused with `edit.invalid-value` saying only notes attach
