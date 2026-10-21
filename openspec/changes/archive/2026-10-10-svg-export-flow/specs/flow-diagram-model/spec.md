## MODIFIED Requirements

### Requirement: Element declarations
The flow profile SHALL accept the shorthand declarations `id["Label"]` (kind `node`) and `id[("Label")]` (kind `data`), the typed declarations `node`, `decision`, `data`, `group`, `note` and `tag`, each as `<kind> <id> ["Label"] [{ ... }]`, and implicit declaration of an undeclared bare identifier used as a relation endpoint (kind `node`, label equal to id). The label SHALL default to the id; for `note` the label is the text and may contain `\n` line breaks. Element blocks SHALL accept only the property `description "<text>"`. A `group` block SHALL contain element declarations and relations and SHALL record the group path of each child. Declaring the same id twice SHALL produce `ref.duplicate-id` on the second declaration with a `related` range on the first.

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
- **THEN** `prop.unknown` is reported on `colour` with the hint that element blocks accept `description`

### Requirement: Style and animate blocks
`style <target>[, <target>...] { }` SHALL accept the properties `icon "<pack>:<name>"`, `fill "<color>"`, `stroke "<color>"`, `color "<color>"` and `line` (`solid` or `dashed`), and SHALL apply the block to every listed target. `animate <target>[, <target>...] { }` SHALL accept `effect` (one of `flow`, `pulse`, `dash`), `duration <time>` (a number with unit `ms` or `s`) and `repeat` (`forever` or a positive integer). Targets MUST resolve to an element or a named relation. Unknown properties SHALL produce `prop.unknown`; wrong value types SHALL produce `prop.invalid-value`; a property set again for the same target by a later statement SHALL produce `prop.duplicate` on the later property.

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
