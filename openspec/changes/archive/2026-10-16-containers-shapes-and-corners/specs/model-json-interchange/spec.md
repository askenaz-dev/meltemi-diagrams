## MODIFIED Requirements

### Requirement: Free diagrams in JSON
Free diagrams SHALL be serialised with the shape of flow diagrams, with `type` equal to `free`, and SHALL add:

- `layers` in the properties, back to front, with `main` included;
- for each element, `layer` (or null), `link` (`{ "binding", "diagram", "element" }`, with `binding` null for same-file links, or null), `source` (or null) and `shape` (the shape implied by the declaration, such as `cylinder` for `id[("…")]`, or null; the `shape` of a style stays in `styles`);
- for each relation, `layer` (or null).

Flow diagrams SHALL emit the same keys with their own values (`layers` is `["main"]` when the diagram declares none). Key order SHALL stay fixed; `version` stays `0.1`, since no existing field changes.

#### Scenario: Free example
- **WHEN** `corpus/valid/free/overview.meltemi` is serialised
- **THEN** its diagram has `type` `free` and `layers` `["main"]`, the `heading` element has kind `text` and `shape` null, and the output matches the stored snapshot

#### Scenario: Shorthand cylinder
- **WHEN** a flow diagram with `db[("Database")]` is serialised
- **THEN** the element `db` has `shape` `cylinder`, and a node declared with `node api "API"` has `shape` null

#### Scenario: Unknown key order
- **WHEN** the same compilation is serialised twice
- **THEN** the two strings are identical and `shape` follows `source` in every element
