## MODIFIED Requirements

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
