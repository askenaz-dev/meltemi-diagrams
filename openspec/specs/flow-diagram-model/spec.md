# flow-diagram-model Specification

## Purpose
Compilation of `flow` diagrams into the typed model: elements, relations, properties, placement, styles, animations, the source map and profile gating.
## Requirements
### Requirement: Compile a flow diagram
`compile(text)` SHALL return a `Compilation` holding the CST, the diagnostics, and a `Document` with one entry per top-level block. A `diagram <id>: flow` block SHALL produce a `FlowDiagram` with its elements and relations in source order. Compilation SHALL be a pure function of the text: it MUST NOT modify the source and MUST NOT throw.

#### Scenario: Two boxes and an arrow
- **WHEN** the text is `diagram example: flow { A -> B }`
- **THEN** the document has one flow diagram with elements `A` and `B` (implicitly declared, label equal to id) and one solid relation from `A` to `B`

#### Scenario: Compilation does not touch the source
- **WHEN** the corpus file `checkout.meltemi` is compiled
- **THEN** the compilation holds no text edits and the file content is unchanged

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

### Requirement: Relations
A relation SHALL be `<ref> -> <ref>` (solid), `<ref> --> <ref>` (dashed), `<ref> <-> <ref>` (solid, two-way), `<ref> <--> <ref>` (dashed, two-way), `<ref> -- <ref>` (a solid line, no heads) or `<ref> --- <ref>` (a dashed line, no heads) with an optional label and an optional id introduced by `as`. Both endpoints MUST resolve to elements of the diagram; a qualified endpoint that does not resolve SHALL produce `ref.unknown-element`, while a bare identifier is implicitly declared. A relation SHALL record `line` (`solid` or `dashed`) and `heads` (`end` for `->` and `-->`, `both` for `<->` and `<-->`, `none` for `--` and `---`); a two-way relation SHALL keep `from` and `to` as written and record `twoWay`, which is true exactly when `heads` is `both`. `heads` SHALL be the default of the heads a relation is drawn with: `none` draws no head at either end, as the theme's `arrowhead` is drawn at the end of `->`, and a written `arrowhead` or `arrowtail` style SHALL apply to a relation of any token. A token the profile does not take (`--` and `---` in sequence diagrams and C4 views; `<->` and `<-->` in C4 views) SHALL produce `flow.arrowUnavailable` on the token, listing the tokens the profile takes. Parallel relations between the same endpoints and self-relations SHALL be allowed. Anonymous relations SHALL receive the deterministic key `<from>-><to>#<n>` where `n` counts parallel relations in source order starting at 1; the key is never written to the source. A relation id that duplicates any element or relation id SHALL produce `ref.duplicate-id`.

#### Scenario: Named and anonymous relations
- **WHEN** a diagram contains `api -> orders: "Create" as create` and two unnamed `orders -> db` relations
- **THEN** the relations are keyed `create`, `orders->db#1` and `orders->db#2`

#### Scenario: Unknown qualified endpoint
- **WHEN** a flow diagram contains `shop.api -> db`
- **THEN** `ref.unknown-element` is reported on `shop.api` with the hint that qualified references are not available in flow diagrams

#### Scenario: Relation id clashes with an element
- **WHEN** a diagram declares `api["API"]` and later `client -> api: "HTTPS" as api`
- **THEN** `ref.duplicate-id` is reported on the second `api`

#### Scenario: Two-way relation
- **WHEN** a diagram contains `api <--> cache as sync`
- **THEN** relation `sync` goes from `api` to `cache`, is dashed and two-way, and its `heads` is `both`

#### Scenario: Headless relations
- **WHEN** a flow diagram contains `api -- cache as link` and a free diagram contains `a --- b`
- **THEN** `link` is solid with `heads` `none` and `twoWay` false, `a->b#1` is dashed with `heads` `none`, no diagnostic is reported, and the scene draws no head at either end of either

#### Scenario: Heads by style on a line
- **WHEN** a flow diagram contains `a -- b as l` and `style l { arrowhead circle }`
- **THEN** `l` has `heads` `none` and the scene draws a circle at its end and nothing at its start

#### Scenario: Line tokens in a sequence diagram
- **WHEN** a sequence diagram contains `customer -- api: "Hello"`
- **THEN** `flow.arrowUnavailable` is reported on `--` with the message that it is not available here and the hint to write `->`, `-->`, `<->` or `<-->`

#### Scenario: Line tokens in a C4 view
- **WHEN** a C4 view contains `shop.web --- shop.api`
- **THEN** `flow.arrowUnavailable` is reported on `---` naming `->` and `-->`, as it is for `<->`

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

### Requirement: Style and animate blocks
`style <target>[, <target>...] { }` SHALL accept the properties:

- `icon "<pack>:<name>"`;
- `fill`, `stroke` and `color`, each a quoted colour or a colour token name;
- `line` (`solid`, `dashed` or `dotted`);
- `width` (a number from 0 to 16);
- `radius` (a number from 0 to 64, with or without `px`), on elements and groups;
- `shape` (one of the shape names), on `node` targets;
- `pattern` (`none`, `hatch`, `dots` or `cross`);
- `arrowhead` and `arrowtail` (`none`, `triangle`, `triangleOutline`, `open`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`, `oneOrMany`, `zeroOrMany`, `zeroOrOne` or `onlyOne`);
- `routing` (`auto`, `orthogonal`, `polyline` or `bezier`) and `corners` (`sharp` or `rounded`);
- `class <id>[, <id>…]`.

It SHALL apply the block to every listed target. `animate <target>[, <target>...] { }` SHALL accept `effect` (one of `flow`, `pulse`, `dash`, `trace`), `duration <time>` (a number with unit `ms` or `s`) and `repeat` (`forever` or a positive integer). Targets MUST resolve to an element or a named relation. Unknown properties SHALL produce `prop.unknown`; wrong value types SHALL produce `prop.invalid-value`; `radius` on a relation and `shape` on a target that is not a node SHALL produce `prop.invalid-value`; a property set again for the same target by a later statement SHALL produce `prop.duplicate` on the later property. Style entries SHALL keep numbers as numbers, colour token names as `@<token>`, and classes in a separate list.

#### Scenario: Valid style and animate
- **WHEN** a diagram contains `style api { icon "tabler:server" }` and `animate request { effect flow; duration 1200ms; repeat forever }`
- **THEN** the model records icon `tabler:server` on `api` and an animation on `request` with effect `flow`, duration 1200 ms and infinite repeat

#### Scenario: One block for several targets
- **WHEN** a diagram contains `style obo, ciba, cimd { line dashed; stroke "#6a4fd0" }`
- **THEN** the model records three style entries with the same two properties, one per target, each referencing its own identifier token

#### Scenario: Property repeated for a target
- **WHEN** a diagram contains `style api { fill "#fff" }` and later `style api, db { fill "#000" }`
- **THEN** `prop.duplicate` is reported on the second `fill` with a related range on the first, and `db` still receives the fill

#### Scenario: Duration without unit
- **WHEN** an animate block contains `duration 1200`
- **THEN** `prop.invalid-value` is reported on `1200` with the hint to add `ms` or `s`

#### Scenario: Style on an unknown target
- **WHEN** a diagram contains `style gateway { fill "#fff" }` and no element `gateway`
- **THEN** `ref.unknown-element` is reported on `gateway`

#### Scenario: New properties
- **WHEN** a diagram contains `style db { fill danger; width 2; pattern hatch; class critical }`
- **THEN** the style entry of `db` has `fill` `@danger`, `width` 2 and `pattern` `hatch`, and its classes are `critical`

#### Scenario: Radius on a group and a node
- **WHEN** a diagram contains `style backend { radius 0 }` on a group and `style api { radius 20; shape hexagon }` on a node
- **THEN** the entries record `radius` 0 and 20 and `shape` `hexagon`, without diagnostics

#### Scenario: Radius out of range or on a relation
- **WHEN** a diagram contains `style api { radius 99 }` and `style request { radius 4 }` on a relation
- **THEN** `prop.invalid-value` is reported on `99` naming the range 0 to 64, and on the relation's `radius` with the hint that it applies to elements

### Requirement: Source map
Every element, relation, placement, style and animate entry in the model SHALL carry the range of its declaring statement and the range of its identifier token, so that editors and the edit layer can locate it in the text.

#### Scenario: Ranges of a declaration
- **WHEN** `client["Cliente"]` is declared on line 4 starting at column 3
- **THEN** the statement range of the element starts at line 4, column 3 and its identifier range covers exactly `client`

#### Scenario: Implicit element has the range of its first use
- **WHEN** `B` is only ever mentioned as the target of `A -> B` on line 2
- **THEN** the identifier range of `B` covers that mention on line 2

### Requirement: Profile gating
`flow`, `free`, `sequence` and `c4` diagrams SHALL compile, and `model` blocks SHALL compile. A type outside the four profiles SHALL produce `profile.unknown`. `story` and `export` blocks SHALL still be parsed and reported as `block.unsupported`. Other diagrams in the same file SHALL still compile.

#### Scenario: Unsupported profile beside a flow diagram
- **WHEN** a file contains `story purchase for checkout { … }` followed by `diagram checkout: flow { ... }`
- **THEN** `block.unsupported` is reported on `story` and the flow diagram `checkout` is compiled normally

#### Scenario: Unknown profile
- **WHEN** a file contains `diagram x: mindmap { }`
- **THEN** `profile.unknown` is reported on `mindmap` listing `flow, sequence, c4, free`

### Requirement: Relation assumptions
Relation blocks of flow, free, sequence and C4 diagrams, and relations of models, SHALL accept
`assumption "<why>"`, recorded as the relation's `assumption` (null when absent) and in the model
JSON. A C4 view relation SHALL take the assumption of its model relations when every relation it
combines is one. Layouts SHALL draw assumed relations dashed in the theme's muted colour unless a
style sets the line or colour.

#### Scenario: Inferred relation
- **WHEN** a flow diagram has `api -> cache { assumption "Reads are usually cached" }`
- **THEN** the relation's `assumption` is `Reads are usually cached` and it is drawn dashed

