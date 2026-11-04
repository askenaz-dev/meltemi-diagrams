## MODIFIED Requirements

### Requirement: Relations
A relation SHALL be `<ref> -> <ref>` (solid), `<ref> --> <ref>` (dashed), `<ref> <-> <ref>` (solid, two-way) or `<ref> <--> <ref>` (dashed, two-way) with an optional label and an optional id introduced by `as`. Both endpoints MUST resolve to elements of the diagram; a qualified endpoint that does not resolve SHALL produce `ref.unknown-element`, while a bare identifier is implicitly declared. A two-way relation SHALL keep `from` and `to` as written and record `twoWay`. Parallel relations between the same endpoints and self-relations SHALL be allowed. Anonymous relations SHALL receive the deterministic key `<from>-><to>#<n>` where `n` counts parallel relations in source order starting at 1; the key is never written to the source. A relation id that duplicates any element or relation id SHALL produce `ref.duplicate-id`.

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
- **THEN** relation `sync` goes from `api` to `cache`, is dashed and two-way

### Requirement: Style and animate blocks
`style <target>[, <target>...] { }` SHALL accept the properties:

- `icon "<pack>:<name>"`;
- `fill`, `stroke` and `color`, each a quoted colour or a colour token name;
- `line` (`solid`, `dashed` or `dotted`);
- `width` (a number from 0 to 16);
- `pattern` (`none`, `hatch`, `dots` or `cross`);
- `arrowhead` and `arrowtail` (`none`, `triangle`, `triangleOutline`, `open`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`, `oneOrMany`, `zeroOrMany`, `zeroOrOne` or `onlyOne`);
- `routing` (`auto`, `orthogonal`, `polyline` or `bezier`) and `corners` (`sharp` or `rounded`);
- `class <id>[, <id>…]`.

It SHALL apply the block to every listed target. `animate <target>[, <target>...] { }` SHALL accept `effect` (one of `flow`, `pulse`, `dash`, `trace`), `duration <time>` (a number with unit `ms` or `s`) and `repeat` (`forever` or a positive integer). Targets MUST resolve to an element or a named relation. Unknown properties SHALL produce `prop.unknown`; wrong value types SHALL produce `prop.invalid-value`; a property set again for the same target by a later statement SHALL produce `prop.duplicate` on the later property. Style entries SHALL keep numbers as numbers, colour token names as `@<token>`, and classes in a separate list.

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
