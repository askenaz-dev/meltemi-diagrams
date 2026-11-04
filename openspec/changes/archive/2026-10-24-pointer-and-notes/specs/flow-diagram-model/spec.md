## ADDED Requirements

### Requirement: Note attachments
In flow and free diagrams a note declaration MAY end with `on <element>`: `note <id> "Text" on <element>`, where `<element>` is the id of another element of the diagram, of any kind, inside or outside the groups the note is in. The model SHALL record the target as the element's `attachedTo` (null without the clause) with its range, and SHALL record a reference to the target with the role `attachment`, so renames rewrite it. A target the diagram does not declare SHALL be `ref.unknown-element` on the target, with the diagram's ids as candidates; the note itself as its target SHALL be `prop.invalid-value`; a word other than `on` after the text, or anything after the target, SHALL be the declaration's "value after" error as today; `on` on a declaration that is not a note SHALL be that error too. Elements that are not notes SHALL have `attachedTo` null.

#### Scenario: An attached note
- **WHEN** a flow diagram declares `api["API"]` and `note limits "500 rps" on api`
- **THEN** it compiles without diagnostics, `limits` has kind `note`, label `500 rps` and `attachedTo` `api`, and `api` has `attachedTo` null

#### Scenario: Attached to an element in a group
- **WHEN** `group backend { api["API"] }` and, outside the group, `note n "Scales" on api` are declared
- **THEN** it compiles without diagnostics and `n` is attached to `api`

#### Scenario: Unknown target
- **WHEN** a diagram declares `note n "Text" on ghost`
- **THEN** `ref.unknown-element` is reported on `ghost` with the diagram's ids as candidates

#### Scenario: A note on itself
- **WHEN** a diagram declares `note n "Text" on n`
- **THEN** `prop.invalid-value` is reported on the target

#### Scenario: Another word after the text
- **WHEN** a diagram declares `note n "Text" at api`
- **THEN** the declaration reports the value-after error naming the form `note <id> "Text" [on <element>]`
