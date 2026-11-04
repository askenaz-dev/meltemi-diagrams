## MODIFIED Requirements

### Requirement: Compile a flow diagram
`compile(text)` SHALL return a `Compilation` holding the CST, the diagnostics, and a `Document` with one entry per top-level block. A `diagram <id>: flow` block SHALL produce a `FlowDiagram` with its elements and relations in source order. Compilation SHALL be a pure function of the text: it MUST NOT modify the source and MUST NOT throw.

#### Scenario: Two boxes and an arrow
- **WHEN** the text is `diagram example: flow { A -> B }`
- **THEN** the document has one flow diagram with elements `A` and `B` (implicitly declared, label equal to id) and one solid relation from `A` to `B`

#### Scenario: Compilation does not touch the source
- **WHEN** the corpus file `checkout.meltemi` is compiled
- **THEN** the compilation holds no text edits and the file content is unchanged

### Requirement: Placement statements
A `placement { }` block SHALL accept `place <element> at (x, y)`, `size <element> (w, h)`, `route <relation> from <element>.<port> to <element>.<port> via [(x, y), ...]` and `label <relation> at <n>% offset (dx, dy)`. Element targets MUST resolve (`ref.unknown-element`) and relation targets MUST resolve to a named relation (`ref.unknown-relation`). Route endpoints MUST match the source and target elements of the relation, in that order, and ports MUST be one of `north`, `south`, `east`, `west`, `auto`. The label percentage MUST be between 0 and 100. A second `place` or `size` for the same element, or a second `route` or `label` for the same relation, SHALL produce `placement.duplicate`.

#### Scenario: Valid placement
- **WHEN** the corpus file `checkout.meltemi` is compiled
- **THEN** the model records `api` at (360, 180), `orders` at (700, 180), a route for `create` from `api.east` to `orders.west` through (520, 180), and the label of `create` at 50 % with offset (0, -16)

#### Scenario: Route on an unknown relation
- **WHEN** a placement block contains `route save from orders.east to db.west via []` and no relation is named `save`
- **THEN** `ref.unknown-relation` is reported on `save` with the hint that anonymous relations need `as <id>` before they can be referenced

#### Scenario: Route endpoints do not match the relation
- **WHEN** `create` goes from `api` to `orders` and the placement says `route create from orders.west to api.east`
- **THEN** `placement.route-mismatch` is reported on the `from` reference

#### Scenario: Invalid port and percentage
- **WHEN** a placement contains `route create from api.left to orders.west via []` and `label create at 120% offset (0, 0)`
- **THEN** `prop.invalid-value` is reported on `left` and on `120%`
