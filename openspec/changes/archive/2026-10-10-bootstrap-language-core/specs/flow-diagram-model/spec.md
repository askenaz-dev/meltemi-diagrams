## ADDED Requirements

### Requirement: Compile a flow diagram
`compile(text)` SHALL return a `Compilation` holding the CST, the diagnostics, and a `Document` with one entry per top-level block. A `diagram <id>: flow` block SHALL produce a `FlowDiagram` with its elements and relations in source order. Compilation SHALL be a pure function of the text: it MUST NOT modify the source and MUST NOT throw.

#### Scenario: Two boxes and an arrow
- **WHEN** the text is `diagram example: flow { A -> B }`
- **THEN** the document has one flow diagram with elements `A` and `B` (implicitly declared, label equal to id) and one solid relation from `A` to `B`

#### Scenario: Compilation does not touch the source
- **WHEN** the corpus file `checkout.arch` is compiled
- **THEN** the compilation holds no text edits and the file content is unchanged

### Requirement: Element declarations
The flow profile SHALL accept the shorthand declarations `id["Label"]` (kind `node`) and `id[("Label")]` (kind `data`), the typed declarations `node`, `decision`, `data` and `group`, each as `<kind> <id> ["Label"] [{ ... }]`, and implicit declaration of an undeclared bare identifier used as a relation endpoint (kind `node`, label equal to id). The label SHALL default to the id. Element blocks SHALL accept only the property `description "<text>"`. A `group` block SHALL contain element declarations and relations and SHALL record the group path of each child. Declaring the same id twice SHALL produce `ref.duplicate-id` on the second declaration with a `related` range on the first.

#### Scenario: Shorthand and typed declarations
- **WHEN** a diagram contains `db[("PostgreSQL")]` and `decision approved "Approved?"`
- **THEN** `db` has kind `data` and label `PostgreSQL`, and `approved` has kind `decision` and label `Approved?`

#### Scenario: Duplicate id
- **WHEN** a diagram declares `api["API"]` on line 3 and `node api "Gateway"` on line 7
- **THEN** `ref.duplicate-id` is reported on line 7 with a related range on line 3

#### Scenario: Unknown element property
- **WHEN** an element block contains `colour "red"`
- **THEN** `prop.unknown` is reported on `colour` with the hint that element blocks accept `description`

### Requirement: Relations
A relation SHALL be `<ref> -> <ref>` (solid) or `<ref> --> <ref>` (dashed) with an optional label and an optional id introduced by `as`. Both endpoints MUST resolve to elements of the diagram; a qualified endpoint that does not resolve SHALL produce `ref.unknown-element`, while a bare identifier is implicitly declared. Parallel relations between the same endpoints and self-relations SHALL be allowed. Anonymous relations SHALL receive the deterministic key `<from>-><to>#<n>` where `n` counts parallel relations in source order starting at 1; the key is never written to the source. A relation id that duplicates any element or relation id SHALL produce `ref.duplicate-id`.

#### Scenario: Named and anonymous relations
- **WHEN** a diagram contains `api -> orders: "Create" as create` and two unnamed `orders -> db` relations
- **THEN** the relations are keyed `create`, `orders->db#1` and `orders->db#2`

#### Scenario: Unknown qualified endpoint
- **WHEN** a flow diagram contains `shop.api -> db`
- **THEN** `ref.unknown-element` is reported on `shop.api` with the hint that qualified references are not available in flow diagrams

#### Scenario: Relation id clashes with an element
- **WHEN** a diagram declares `api["API"]` and later `client -> api: "HTTPS" as api`
- **THEN** `ref.duplicate-id` is reported on the second `api`

### Requirement: Diagram properties
A flow diagram SHALL accept the properties `direction` (one of `LR`, `RL`, `TB`, `BT`; default `LR`), `layout` (one of `auto`, `assisted`, `manual`; default `auto`), `theme "<name>"`, `title "<text>"` and `description "<text>"`. An unknown property SHALL produce `prop.unknown` and a value outside the allowed set SHALL produce `prop.invalid-value` listing the allowed values. A property given twice SHALL produce `prop.duplicate` on the second occurrence.

#### Scenario: Valid properties
- **WHEN** a diagram contains `direction TB`, `layout assisted` and `theme "studio.light"`
- **THEN** the diagram model records direction `TB`, layout `assisted` and theme `studio.light`

#### Scenario: Invalid direction
- **WHEN** a diagram contains `direction UP`
- **THEN** `prop.invalid-value` is reported on `UP` and the message lists `LR, RL, TB, BT`

### Requirement: Placement statements
A `placement { }` block SHALL accept `place <element> at (x, y)`, `size <element> (w, h)`, `route <relation> from <element>.<port> to <element>.<port> via [(x, y), ...]` and `label <relation> at <n>% offset (dx, dy)`. Element targets MUST resolve (`ref.unknown-element`) and relation targets MUST resolve to a named relation (`ref.unknown-relation`). Route endpoints MUST match the source and target elements of the relation, in that order, and ports MUST be one of `north`, `south`, `east`, `west`, `auto`. The label percentage MUST be between 0 and 100. A second `place` or `size` for the same element, or a second `route` or `label` for the same relation, SHALL produce `placement.duplicate`.

#### Scenario: Valid placement
- **WHEN** the corpus file `checkout.arch` is compiled
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

### Requirement: Style and animate blocks
`style <target> { }` SHALL accept the properties `icon "<pack>:<name>"`, `fill "<color>"`, `stroke "<color>"` and `color "<color>"`. `animate <target> { }` SHALL accept `effect` (one of `flow`, `pulse`, `dash`), `duration <time>` (a number with unit `ms` or `s`) and `repeat` (`forever` or a positive integer). Targets MUST resolve to an element or a named relation. Unknown properties SHALL produce `prop.unknown`; wrong value types SHALL produce `prop.invalid-value`.

#### Scenario: Valid style and animate
- **WHEN** a diagram contains `style api { icon "tabler:server" }` and `animate request { effect flow; duration 1200ms; repeat forever }`
- **THEN** the model records icon `tabler:server` on `api` and an animation on `request` with effect `flow`, duration 1200 ms and infinite repeat

#### Scenario: Duration without unit
- **WHEN** an animate block contains `duration 1200`
- **THEN** `prop.invalid-value` is reported on `1200` with the hint to add `ms` or `s`

#### Scenario: Style on an unknown target
- **WHEN** a diagram contains `style gateway { fill "#fff" }` and no element `gateway`
- **THEN** `ref.unknown-element` is reported on `gateway`

### Requirement: Source map
Every element, relation, placement, style and animate entry in the model SHALL carry the range of its declaring statement and the range of its identifier token, so that editors and the edit layer can locate it in the text.

#### Scenario: Ranges of a declaration
- **WHEN** `client["Cliente"]` is declared on line 4 starting at column 3
- **THEN** the statement range of the element starts at line 4, column 3 and its identifier range covers exactly `client`

#### Scenario: Implicit element has the range of its first use
- **WHEN** `B` is only ever mentioned as the target of `A -> B` on line 2
- **THEN** the identifier range of `B` covers that mention on line 2

### Requirement: Profile gating
A `diagram` block whose type is `sequence`, `c4` or `free` SHALL be parsed but SHALL produce `profile.unsupported` (error) on the type token with the message naming the profile and the version. A type outside the four profiles SHALL produce `profile.unknown`. Other diagrams in the same file SHALL still compile.

#### Scenario: Unsupported profile beside a flow diagram
- **WHEN** a file contains `diagram payment: sequence { ... }` followed by `diagram checkout: flow { ... }`
- **THEN** `profile.unsupported` is reported on `sequence` and the flow diagram `checkout` is compiled normally

#### Scenario: Unknown profile
- **WHEN** a file contains `diagram x: mindmap { }`
- **THEN** `profile.unknown` is reported on `mindmap` listing `flow, sequence, c4, free`
