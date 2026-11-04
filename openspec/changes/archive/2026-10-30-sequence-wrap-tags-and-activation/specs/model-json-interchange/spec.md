## ADDED Requirements

### Requirement: Tags in JSON
Every element and every relation of every profile SHALL carry `tags` after `classes`: a list of `{ "text", "range" }` in source order, empty when none is written, so always empty outside sequence diagrams. Key order SHALL stay fixed and `version` stays `0.1`, since the key is added and no existing one changes. A file whose tags are refused SHALL be serialised as any file with errors.

#### Scenario: A sequence sheet with tags
- **WHEN** `corpus/valid/sequence/tags.meltemi` is serialised
- **THEN** its tagged messages and participants carry `tags` with their texts in source order and their ranges, every other element and relation carries `tags` `[]`, and the output matches the stored snapshot

#### Scenario: Stable key order with the new key
- **WHEN** the same compilation is serialised twice
- **THEN** the two strings are identical, and `tags` follows `classes` in every element and every relation

#### Scenario: Other profiles
- **WHEN** `checkout.meltemi` and `corpus/valid/free/overview.meltemi` are serialised
- **THEN** every element and relation carries `tags` `[]`, and a flow `tag` element keeps kind `tag` with `tags` `[]`

#### Scenario: A refused tag is not serialised
- **WHEN** a sequence diagram whose message block holds `tag ""` is serialised
- **THEN** `ok` is false, that diagram is omitted from `diagrams`, and `diagnostics` holds `prop.invalid-value` on `""`
