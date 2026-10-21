## ADDED Requirements

### Requirement: JSON document shape
`toJson(compilation)` SHALL return an object with `format` equal to `model-json`, `version` equal to `0.1`, `language` equal to the header version (or null), `ok` (true when there are no error diagnostics), `diagrams` and `diagnostics`. Each flow diagram SHALL list `id`, `type`, `properties`, `elements`, `relations`, `placement`, `styles` and `animations`; every element, relation and statement entry SHALL include its `range`. Anonymous relations SHALL appear with their synthetic `key` and `id` null. Object keys SHALL be emitted in a fixed documented order so the output is stable across runs.

#### Scenario: Checkout corpus file
- **WHEN** `checkout.arch` is compiled and serialised
- **THEN** the JSON contains one diagram `checkout` with four elements, three relations keyed `request`, `create` and `save`, two `place` entries, one `route` and one `label`, each with a range, and matches the stored snapshot `checkout.model.json`

#### Scenario: Stable key order
- **WHEN** the same compilation is serialised twice
- **THEN** the two strings are identical

### Requirement: Diagnostics in JSON
`diagnosticsToJson(diagnostics)` SHALL emit each diagnostic with `code`, `severity`, `message`, `range` (start and end with `offset`, `line`, `column`), `hints` and `related`, and `toJson` SHALL include the same list under `diagnostics`.

#### Scenario: File with errors
- **WHEN** a file with one `ref.unknown-element` error is serialised
- **THEN** `ok` is false, the broken diagram is omitted from `diagrams`, and `diagnostics` holds one entry with the code, message and 1-based line and column
