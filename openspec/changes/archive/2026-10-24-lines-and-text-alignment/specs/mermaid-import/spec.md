## MODIFIED Requirements

### Requirement: Flowchart links
Links SHALL become relations, one per source and target pair of chains and `&` lists: `-->` as
`->`, `-.->` as `-->`, `==>` as `->` with `width 3`, `---` as `--` (a solid line), `-.-` as `---`
(a dashed line), `===` as `--` with `width 3`,
and longer links like `--->` the same as their short form. `<-->`, `<-.->` and `<==>` SHALL become
`<->`, `<-->` and `<->` with `width 3`; `--o` and `--x` SHALL set `arrowhead circle` and
`arrowhead cross`; `o--o` and `x--x` SHALL become `<->` with that head at both ends; link curves
(`linkStyle … interpolate <curve>` and `e1@{ curve: <curve> }`) SHALL become `routing polyline`
for `linear`, `routing orthogonal` for `step`, `stepBefore` and `stepAfter`, and `routing bezier`
for the other curves. Labels in `|t|` and `-- t -->` forms
SHALL become relation labels. Link ids (`e1@-->`) SHALL be kept as relation ids, and
`e1@{ animate: true }` or `animation: fast|slow` SHALL become `animate e1 { effect flow }`.
Relations that need a style SHALL be named `e<n>` in source order when the source gives no id; a
line without a head needs none.

#### Scenario: Chains and lists
- **WHEN** a flowchart has `a & b --> c -->|done| d`
- **THEN** the sheet has `a -> c`, `b -> c` and `c -> d: "done"`

#### Scenario: Open link
- **WHEN** a flowchart has `a --- b` and `c -.- d`
- **THEN** the sheet has `a -- b` and `c --- d`, neither named nor styled

#### Scenario: Thick open link
- **WHEN** a flowchart has `a === b`
- **THEN** the sheet has `a -- b as e1` with `style e1 { width 3 }`

#### Scenario: Two-way and circle ends
- **WHEN** a flowchart has `a <--> b` and `c --o d`
- **THEN** the sheet has `a <-> b`, and `c -> d` named and styled with `arrowhead circle`

### Requirement: Mermaid architecture diagrams
`architecture-beta` SHALL become a flow diagram with `layout auto`: `group id(icon)[t] [in p]` to
nested groups, `service id(icon)[t] [in g]` to nodes, `junction id [in g]` to a node with an empty
label (approximated). Built-in icons SHALL map to Tabler icons (`cloud` to `tabler:cloud`,
`database` to `tabler:database`, `disk` to `tabler:device-floppy`, `internet` to `tabler:world`,
`server` to `tabler:server`) as `icon` styles; `pack:name` icons SHALL be kept when `hasIcon`
accepts them or the pack is `tabler`, and dropped otherwise with `import.unsupported-construct`.
Edges `a:L -- R:b` SHALL become named relations with `route` statements from the given sides
(`L` west, `R` east, `T` north, `B` south), `-->` and `<--` setting the arrowhead
direction, `<-->` becoming `<->`, `--` becoming the line token `--`, and `{group}` modifiers relating
the services' groups.

#### Scenario: Sides become ports
- **WHEN** an architecture diagram has `db:L -- R:server`
- **THEN** the sheet has `db -- server as e1` and `route e1 from db.west to server.east`, with no
  `style` statement for `e1`

#### Scenario: Arrow edge
- **WHEN** an architecture diagram has `db:L --> R:server`
- **THEN** the sheet has `db -> server as e1` with its route, and `import.unsupported-construct` is not reported
