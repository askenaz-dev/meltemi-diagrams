## MODIFIED Requirements

### Requirement: Flowchart links
Links SHALL become relations, one per source and target pair of chains and `&` lists: `-->` as
`->`, `-.->` as `-->`, `==>` as `->` with `width 3`, `---`, `-.-` and `===` with `arrowhead none`,
and longer links like `--->` the same as their short form. `<-->`, `<-.->` and `<==>` SHALL become
`<->`, `<-->` and `<->` with `width 3`; `--o` and `--x` SHALL set `arrowhead circle` and
`arrowhead cross`; `o--o` and `x--x` SHALL become `<->` with that head at both ends; link curves
(`linkStyle … interpolate <curve>` and `e1@{ curve: <curve> }`) SHALL become `routing polyline`
for `linear`, `routing orthogonal` for `step`, `stepBefore` and `stepAfter`, and `routing bezier`
for the other curves. Labels in `|t|` and `-- t -->` forms
SHALL become relation labels. Link ids (`e1@-->`) SHALL be kept as relation ids, and
`e1@{ animate: true }` or `animation: fast|slow` SHALL become `animate e1 { effect flow }`.
Relations that need a style SHALL be named `e<n>` in source order when the source gives no id.

#### Scenario: Chains and lists
- **WHEN** a flowchart has `a & b --> c -->|done| d`
- **THEN** the sheet has `a -> c`, `b -> c` and `c -> d: "done"`

#### Scenario: Open link
- **WHEN** a flowchart has `a --- b`
- **THEN** the relation is named and styled with `arrowhead none`

#### Scenario: Two-way and circle ends
- **WHEN** a flowchart has `a <--> b` and `c --o d`
- **THEN** the sheet has `a <-> b`, and `c -> d` named and styled with `arrowhead circle`

### Requirement: Mermaid sequence diagrams
`sequenceDiagram` SHALL become a sequence diagram: `participant` and `actor` with `as` aliases;
`participant x@{ "type": "boundary" }` and the other participant types to the same kinds; `box
[colour] title … end` to groups; `create` before a message to `create`; `destroy` to `destroy`.
Messages SHALL map `->>` to `->`, `-->>` to `-->`, `-)` to `-> … { kind async }`, `--)` to
`--> … { kind async }`, `<<->>` to `<->`, `<<-->>` to `<-->`, and `->`, `-->`, `-x` and `--x` to the
nearest of those with `import.approximated`. `+` and `-` suffixes SHALL add `activate` of the target and `deactivate` of
the source after the message; `activate` and `deactivate` SHALL be kept. Notes `left of`,
`right of` and `over a,b` SHALL become notes. `loop`, `alt`/`else`, `opt`, `par`/`and`,
`critical`/`option` and `break` SHALL become fragments with ids `<operator><n>`, and `rect` a
`region` whose colour becomes a `fill` style. `autonumber` SHALL be kept; `autonumber off`,
`link` and `links` SHALL be dropped.

#### Scenario: Activation shorthand
- **WHEN** a sequence has `Alice->>+John: Hello` and `John-->>-Alice: Hi`
- **THEN** the sheet has `Alice -> John: "Hello"`, `activate John`, `John --> Alice: "Hi"` and
  `deactivate John`

#### Scenario: Alternatives
- **WHEN** a sequence has `alt ok … else declined … end`
- **THEN** the sheet has `alt alt1 "ok" { … } else "declined" { … }`

### Requirement: Mermaid architecture diagrams
`architecture-beta` SHALL become a flow diagram with `layout auto`: `group id(icon)[t] [in p]` to
nested groups, `service id(icon)[t] [in g]` to nodes, `junction id [in g]` to a node with an empty
label (approximated). Built-in icons SHALL map to Tabler icons (`cloud` to `tabler:cloud`,
`database` to `tabler:database`, `disk` to `tabler:device-floppy`, `internet` to `tabler:world`,
`server` to `tabler:server`) as `icon` styles; `pack:name` icons SHALL be kept when `hasIcon`
accepts them or the pack is `tabler`, and dropped otherwise with `import.unsupported-construct`.
Edges `a:L -- R:b` SHALL become named relations with `route` statements from the given sides
(`L` west, `R` east, `T` north, `B` south), `-->` and `<--` setting the arrowhead
direction, `<-->` becoming `<->`, `--` with `arrowhead none`, and `{group}` modifiers relating
the services' groups.

#### Scenario: Sides become ports
- **WHEN** an architecture diagram has `db:L -- R:server`
- **THEN** the sheet has `db -> server as e1`, `route e1 from db.west to server.east` and
  `style e1 { arrowhead none }`
