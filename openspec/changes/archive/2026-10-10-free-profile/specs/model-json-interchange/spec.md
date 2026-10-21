## ADDED Requirements

### Requirement: Free diagrams in JSON
Free diagrams SHALL be serialised with the shape of flow diagrams, with `type` equal to `free`, and SHALL add:

- `layers` in the properties, back to front, with `main` included;
- for each element, `layer` (or null), `link` (`{ "binding", "diagram", "element" }`, with `binding` null for same-file links, or null) and `source` (or null);
- for each relation, `layer` (or null).

Flow diagrams SHALL also emit `layers` (always `["main"]`), `link` and `source` on elements (null when absent), and `layer` on elements and relations (always null). Key order SHALL stay fixed.

#### Scenario: Free example
- **WHEN** `corpus/valid/free/overview.meltemi` is serialised
- **THEN** its diagram has `type` `free` and `layers` `["main"]`, the `heading` element has kind `text`, and the output matches the stored snapshot
