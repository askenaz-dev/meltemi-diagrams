# model-json-interchange Specification

## Purpose
The JSON form of compiled documents and diagnostics used for interchange and programmatic access.
## Requirements
### Requirement: JSON document shape
`toJson(compilation)` SHALL return an object with `format` equal to `model-json`, `version` equal to `0.1`, `language` equal to the header version (or null), `ok` (true when there are no error diagnostics), `diagrams`, `themes` and `diagnostics`. Each flow diagram SHALL list `id`, `type`, `properties` (including `preset` and `canvas`), `classes`, `rules`, `elements`, `relations`, `placement`, `styles` and `animations`. Elements, relations and style entries SHALL list their applied `classes` by name. Each class SHALL list `id`, `properties` and `range`; each rule `kind`, `properties` and `range`. Every element, relation and statement entry SHALL include its `range`. Each theme SHALL list `id`, `extends`, `tokens` (sorted by name, numbers as JSON numbers), `classes`, `rules` and `range`. Anonymous relations SHALL appear with their synthetic `key` and `id` null. Object keys SHALL be emitted in a fixed documented order so the output is stable across runs.

#### Scenario: Checkout corpus file
- **WHEN** `checkout.meltemi` is compiled and serialised
- **THEN** the JSON contains one diagram `checkout` with four elements, three relations keyed `request`, `create` and `save`, two `place` entries, one `route` and one `label`, each with a range, and matches the stored snapshot `checkout.model.json`

#### Scenario: Stable key order
- **WHEN** the same compilation is serialised twice
- **THEN** the two strings are identical

#### Scenario: Themes in the document
- **WHEN** a file with `theme konfio { extends "technical.light"; accent "#6a4fd0"; labelSize 14 }` is serialised
- **THEN** `themes` holds one entry with `id` `konfio`, `extends` `technical.light`, `tokens` `{ "accent": "#6a4fd0", "labelSize": 14 }`, empty `classes` and `rules`, and a `range`

#### Scenario: Classes and rules in the document
- **WHEN** a diagram with `class hot { fill danger }`, `rule data { pattern dots }` and `api["API"] { class hot }` is serialised
- **THEN** the diagram lists the class `hot` with properties `{ "fill": "@danger" }`, the rule for `data`, and `api` with classes `["hot"]`

### Requirement: Diagnostics in JSON
`diagnosticsToJson(diagnostics)` SHALL emit each diagnostic with `code`, `severity`, `message`, `range` (start and end with `offset`, `line`, `column`), `hints` and `related`, and `toJson` SHALL include the same list under `diagnostics`.

#### Scenario: File with errors
- **WHEN** a file with one `ref.unknown-element` error is serialised
- **THEN** `ok` is false, the broken diagram is omitted from `diagrams`, and `diagnostics` holds one entry with the code, message and 1-based line and column

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

### Requirement: Lines and heads in JSON
Each relation SHALL carry `heads` (`end`, `both` or `none`) after `twoWay`, in every profile; each element SHALL carry `line` after `shape`: `{ "from": { "x", "y" }, "to": { "x", "y" }, "via": [ { "x", "y" }, … ] }` for a free `line` object, null otherwise. Style entries SHALL carry `verticalAlign` as any other property, and theme `tokens` SHALL carry `sketch` when written. Key order SHALL stay fixed and `version` stays `0.1`, since the keys are added and no existing one changes.

#### Scenario: A headless relation
- **WHEN** a flow diagram with `api -- cache as link` and `api <--> db` is serialised
- **THEN** `link` has `line` `solid`, `twoWay` false and `heads` `none`, and `api->db#1` has `line` `dashed`, `twoWay` true and `heads` `both`

#### Scenario: A line object
- **WHEN** `corpus/valid/free/lines.meltemi` is serialised
- **THEN** its `line` elements have kind `line`, `shape` null and a `line` object with `from`, `to` and `via`, every box has `line` null, and the output matches the stored snapshot

#### Scenario: Stable key order with the new keys
- **WHEN** the same compilation is serialised twice
- **THEN** the two strings are identical, `heads` follows `twoWay` in every relation and `line` follows `shape` in every element

#### Scenario: A sketch token in a theme
- **WHEN** a file with `theme hand { extends "technical.light"; sketch rough }` is serialised
- **THEN** `themes` holds one entry whose `tokens` are `{ "sketch": "rough" }`

#### Scenario: A line in a flow diagram is not serialised
- **WHEN** a flow diagram containing `line l from (0, 0) to (100, 0)` is serialised
- **THEN** `ok` is false, that diagram is omitted from `diagrams`, and `diagnostics` holds `prop.unknown` on `line`

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

### Requirement: Whiteboard objects in JSON
Each element SHALL carry `pen` after `line`: `{ "points": [ { "x", "y" }, … ] }` for a pen, null otherwise; and `list` after `pen`: `{ "layout", "spacing", "align" }` for a list group (`spacing` and `align` null when not written), null otherwise. `kind` SHALL be `pen` or `sticky` for those declarations. Style entries SHALL carry `opacity` as any other property, diagram properties SHALL carry `preset` `board` when written, theme `tokens` SHALL carry `highlight`, `sticky` and `stickyText` when written, and story actions SHALL carry `draw` with its targets and time as `trace` is carried. Key order SHALL stay fixed and `version` stays `0.1`, since the keys are added and no existing one changes.

#### Scenario: A whiteboard sheet
- **WHEN** `corpus/valid/free/whiteboard.meltemi` is serialised
- **THEN** its pens have kind `pen`, `line` null and a `pen` object with their points, its stickies have kind `sticky` and `pen` null, its column groups have `list` `{ "layout": "column", … }`, every box has `pen` null and `list` null, and the output matches the stored snapshot

#### Scenario: Stable key order with the new keys
- **WHEN** the same compilation is serialised twice
- **THEN** the two strings are identical, and `pen` follows `line` and `list` follows `pen` in every element

#### Scenario: A pen in a flow diagram is not serialised
- **WHEN** a flow diagram containing `pen p [(0, 0), (10, 10)]` is serialised
- **THEN** `ok` is false, that diagram is omitted from `diagrams`, and `diagnostics` holds `prop.unknown` on `pen`

