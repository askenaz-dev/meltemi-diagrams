## ADDED Requirements

### Requirement: Note attachments in JSON
Every element of every profile SHALL carry `attachedTo`: the id of the element a note is attached to (the entity path in a C4 view), or null. The key SHALL follow `shape` and precede `entity` in the fixed order; `version` SHALL stay `0.1`, since no existing field changes. `diagnosticsToJson` SHALL report an unknown attachment target as any `ref.unknown-element`.

#### Scenario: An attached note in JSON
- **WHEN** a flow diagram with `api["API"]` and `note limits "500 rps" on api` is serialised
- **THEN** the element `limits` has `attachedTo` `"api"`, `api` has `attachedTo` null, and in both the key follows `shape` and precedes `entity`

#### Scenario: Free and C4 notes
- **WHEN** a free diagram with `note hint "Draft"` and a C4 view with `note cache "Cached" on shop.api` are serialised
- **THEN** `hint` has kind `note` and `attachedTo` null, and `cache` has kind `note`, `entity` null and `attachedTo` `"shop.api"`

#### Scenario: Stable key order
- **WHEN** the same compilation is serialised twice
- **THEN** the two strings are identical and the stored snapshots of `corpus/valid` match

#### Scenario: An unknown target in the diagnostics
- **WHEN** a file with `note n "Text" on ghost` is serialised
- **THEN** `ok` is false and `diagnostics` holds one `ref.unknown-element` entry pointing at `ghost`
