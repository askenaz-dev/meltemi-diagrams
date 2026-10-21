## MODIFIED Requirements

### Requirement: JSON document shape
`toJson(compilation)` SHALL return an object with `format` equal to `model-json`, `version` equal to `0.1`, `language` equal to the header version (or null), `ok` (true when there are no error diagnostics), `diagrams`, `themes` and `diagnostics`. Each flow diagram SHALL list `id`, `type`, `properties`, `elements`, `relations`, `placement`, `styles` and `animations`; every element, relation and statement entry SHALL include its `range`. Each theme SHALL list `id`, `extends`, `tokens` (sorted by name) and `range`. Anonymous relations SHALL appear with their synthetic `key` and `id` null. Object keys SHALL be emitted in a fixed documented order so the output is stable across runs.

#### Scenario: Checkout corpus file
- **WHEN** `checkout.meltemi` is compiled and serialised
- **THEN** the JSON contains one diagram `checkout` with four elements, three relations keyed `request`, `create` and `save`, two `place` entries, one `route` and one `label`, each with a range, and matches the stored snapshot `checkout.model.json`

#### Scenario: Stable key order
- **WHEN** the same compilation is serialised twice
- **THEN** the two strings are identical

#### Scenario: Themes in the document
- **WHEN** a file with `theme konfio { extends "meltemi.light"; accent "#6a4fd0" }` is serialised
- **THEN** `themes` holds one entry with `id` `konfio`, `extends` `meltemi.light`, `tokens` `{ "accent": "#6a4fd0" }` and a `range`
