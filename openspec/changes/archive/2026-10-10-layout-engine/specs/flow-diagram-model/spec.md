## MODIFIED Requirements

### Requirement: Element declarations
The flow profile SHALL accept the shorthand declarations `id["Label"]` (kind `node`) and `id[("Label")]` (kind `data`), the typed declarations `node`, `decision`, `data`, `group`, `note` and `tag`, each as `<kind> <id> ["Label"] [{ ... }]`, and implicit declaration of an undeclared bare identifier used as a relation endpoint (kind `node`, label equal to id). The label SHALL default to the id; for `note` the label is the text and may contain `\n` line breaks. Element and relation blocks SHALL accept only the properties `description "<text>"` and `class <id>[, <id>…]`, and element blocks also `port <name> <side> [<n>%]` (see `layout-constraints`). A `group` block SHALL contain element declarations, relations, nested groups, `description` and `class`, and SHALL record the group path of each child. Declaring the same id twice SHALL produce `ref.duplicate-id` on the second declaration with a `related` range on the first.

#### Scenario: Shorthand and typed declarations
- **WHEN** a diagram contains `db[("PostgreSQL")]` and `decision approved "Approved?"`
- **THEN** `db` has kind `data` and label `PostgreSQL`, and `approved` has kind `decision` and label `Approved?`

#### Scenario: Annotations
- **WHEN** a diagram contains `note limits "Límites a validar\nOBO: 30 RPS"` and `tag pkce "PKCE"`
- **THEN** `limits` has kind `note` with a two-line label and `pkce` has kind `tag`

#### Scenario: Duplicate id
- **WHEN** a diagram declares `api["API"]` on line 3 and `node api "Gateway"` on line 7
- **THEN** `ref.duplicate-id` is reported on line 7 with a related range on line 3

#### Scenario: Unknown element property
- **WHEN** an element block contains `colour "red"`
- **THEN** `prop.unknown` is reported on `colour` with the hint that element blocks accept `description`, `class` and `port`

#### Scenario: Class on a group
- **WHEN** a diagram contains `group edge "Edge" { class external; api["API"] }`
- **THEN** the group `edge` has the class `external` and `api` has the group path `edge`

#### Scenario: Ports on an element
- **WHEN** a diagram declares `bus["Bus"] { port in west; port out east 30% }`
- **THEN** `bus` has the ports `in` on the west side at 50 % and `out` on the east side at 30 %

### Requirement: Diagram properties
A flow diagram SHALL accept the properties `direction` (one of `LR`, `RL`, `TB`, `BT`; default `LR`), `layout` (one of `auto`, `assisted`, `manual`; default `auto`), `theme "<name>"`, `title "<text>"`, `description "<text>"`, `preset` (`document` or `slide`), `canvas (<width>, <height>)` and `routing` (`auto`, `orthogonal`, `polyline` or `bezier`; default `auto`), and the statements `class <id> { }` and `rule <kind> { }` at its top level. An unknown property SHALL produce `prop.unknown` and a value outside the allowed set SHALL produce `prop.invalid-value` listing the allowed values. A property given twice SHALL produce `prop.duplicate` on the second occurrence.

#### Scenario: Valid properties
- **WHEN** a diagram contains `direction TB`, `layout assisted`, `theme "editorial.light"` and `preset document`
- **THEN** the diagram model records direction `TB`, layout `assisted`, theme `editorial.light` and preset `document`

#### Scenario: Invalid direction
- **WHEN** a diagram contains `direction UP`
- **THEN** `prop.invalid-value` is reported on `UP` and the message lists `LR, RL, TB, BT`

#### Scenario: Routing property
- **WHEN** a diagram contains `routing bezier`, and another `routing curved`
- **THEN** the first records routing `bezier`, and `prop.invalid-value` is reported on `curved` listing `auto, orthogonal, polyline, bezier`

### Requirement: Placement statements
A `placement { }` block SHALL accept `place <element> at (x, y)`, `size <element> (w, h)`, `route <relation> from <element>.<port> to <element>.<port> via [(x, y), ...]`, `label <relation> at <n>% offset (dx, dy)` and the constraints `align`, `row`, `column`, `order` and `distance` (see `layout-constraints`). Element targets MUST resolve (`ref.unknown-element`) and relation targets MUST resolve to a named relation (`ref.unknown-relation`). Route endpoints MUST match the source and target elements of the relation, in that order, and ports MUST be one of `north`, `south`, `east`, `west`, `auto` or a named port of that element (`placement.unknown-port` otherwise). The label percentage MUST be between 0 and 100. A second `place` or `size` for the same element, or a second `route` or `label` for the same relation, SHALL produce `placement.duplicate`.

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
- **THEN** `placement.unknown-port` is reported on `left`, listing the ports of `api`, and `prop.invalid-value` on `120%`
