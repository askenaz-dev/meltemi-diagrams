## ADDED Requirements

### Requirement: Mermaid diagram types
The Mermaid front-end SHALL read optional YAML front matter (`title`, and `config` which is
dropped), `%%{init}%%` directives (dropped) and `%%` comments, then the diagram keyword:
`flowchart` and `graph` (flow), `sequenceDiagram` (sequence), `C4Context`, `C4Container`,
`C4Component` and `C4Dynamic` (model and view, see c4-import), `architecture-beta` and
`architecture` (flow), `block-beta` and `block` (free). Every other keyword (`classDiagram`,
`stateDiagram`, `erDiagram`, `gantt`, `pie`, `C4Deployment`, …) SHALL fail with
`import.unsupported-diagram`. `accTitle` and `accDescr` SHALL become `title` and `description` in
every type.

#### Scenario: Front matter title
- **WHEN** a flowchart has front matter `title: Checkout`
- **THEN** the diagram is `checkout` with `title "Checkout"`

### Requirement: Flowchart nodes and subgraphs
A flowchart SHALL become a flow diagram with `layout auto` and the direction (`TD` and `TB` as
`TB`, `BT`, `LR`, `RL`). Nodes SHALL map by shape: `[t]` and `(t)` to `node`, `{t}` to `decision`,
`[(t)]` to `data`; `([t])`, `[[t]]`, `((t))`, `(((t)))`, `>t]`, `{{t}}`, `[/t/]`, `[\t\]`,
`[/t\]` and `[\t/]` to `node` with `import.approximated`; the `@{ shape: …, label: … }` syntax by
the same table of shape names. Labels SHALL drop quotes, turn `<br>` into line breaks, decode
`#quot;` style entities and Markdown strings (approximated), and drop `fa:` icon tokens
(approximated). Nodes SHALL be declared once, in the innermost subgraph that mentions them;
when sibling subgraphs mention the same node, the first to close keeps it, as Mermaid does.
`subgraph id [title]`, `subgraph title` and nested subgraphs SHALL become groups; a subgraph's
`direction` SHALL be dropped.

#### Scenario: Shapes
- **WHEN** a flowchart declares `a[Start]`, `b{Paid?}`, `c[(Orders)]` and `d{{Retry}}`
- **THEN** the sheet declares `node a "Start"`, `decision b "Paid?"`, `data c "Orders"` and
  `node d "Retry"`, with one `import.approximated` for `d`

#### Scenario: Node moved into a subgraph
- **WHEN** `a --> b` comes before `subgraph backend` that mentions `b`
- **THEN** `b` is declared inside `group backend` and the relation is kept

### Requirement: Flowchart links
Links SHALL become relations, one per source and target pair of chains and `&` lists: `-->` as
`->`, `-.->` as `-->`, `==>` as `->` with `width 3`, `---`, `-.-` and `===` with `arrowhead none`,
and longer links like `--->` the same as their short form. `--o`, `--x`, `o--o`, `x--x` and
`<-->` SHALL become one relation with `import.approximated`. Labels in `|t|` and `-- t -->` forms
SHALL become relation labels. Link ids (`e1@-->`) SHALL be kept as relation ids, and
`e1@{ animate: true }` or `animation: fast|slow` SHALL become `animate e1 { effect flow }`.
Relations that need a style SHALL be named `e<n>` in source order when the source gives no id.

#### Scenario: Chains and lists
- **WHEN** a flowchart has `a & b --> c -->|done| d`
- **THEN** the sheet has `a -> c`, `b -> c` and `c -> d: "done"`

#### Scenario: Open link
- **WHEN** a flowchart has `a --- b`
- **THEN** the relation is named and styled with `arrowhead none`

### Requirement: Flowchart styles
`classDef` SHALL become `class` definitions and `classDef default` a `rule` for `node`,
`decision` and `data`; `class a,b name` and `a:::name` SHALL apply classes; `style id …` SHALL
become `style` statements; `linkStyle n,m …` and `linkStyle default …` SHALL style the relations
by their source index or with `rule relation`. `fill`, `stroke` and `color` SHALL map to the same
properties with quoted CSS values, `stroke-width` to `width`, and `stroke-dasharray` to
`line dashed`. Other CSS properties SHALL be dropped with `import.unsupported-construct`, as SHALL
`click`, `callback`, `href` and interaction lines.

#### Scenario: Class definition
- **WHEN** a flowchart has `classDef hot fill:#f96,stroke:#333,stroke-width:4px` and `a:::hot`
- **THEN** the sheet has `class hot { fill "#f96"; stroke "#333"; width 4 }` and `a` applies `hot`

### Requirement: Mermaid sequence diagrams
`sequenceDiagram` SHALL become a sequence diagram: `participant` and `actor` with `as` aliases;
`participant x@{ "type": "boundary" }` and the other participant types to the same kinds; `box
[colour] title … end` to groups; `create` before a message to `create`; `destroy` to `destroy`.
Messages SHALL map `->>` to `->`, `-->>` to `-->`, `-)` to `-> … { kind async }`, `--)` to
`--> … { kind async }`, and `->`, `-->`, `-x`, `--x` and `<<->>` to the nearest of those with
`import.approximated`. `+` and `-` suffixes SHALL add `activate` of the target and `deactivate` of
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
(`L` west, `R` east, `T` north, `B` south), `-->`, `<--` and `<-->` setting the arrowhead
direction (`<-->` approximated), `--` with `arrowhead none`, and `{group}` modifiers relating
the services' groups.

#### Scenario: Sides become ports
- **WHEN** an architecture diagram has `db:L -- R:server`
- **THEN** the sheet has `db -> server as e1`, `route e1 from db.west to server.east` and
  `style e1 { arrowhead none }`

### Requirement: Mermaid block diagrams
`block-beta` SHALL become a free composition: `columns n` (or one column per item of the first
row when absent) sets a grid of cells 168 wide and 84 tall; items fill rows left to right, `:n`
spans `n` columns, `space` and `space:n` leave cells empty, and nested `block:id:span … end`
becomes a group with its own columns. Every box SHALL get a `place` at its cell's centre and a
`size` of its span's width minus 28 by 56; every group a `place` and `size` around its cells.
Shapes SHALL map to `shape` (`[t]` rectangle, `(t)` rounded, `([t])` pill, `((t))` ellipse,
`{t}` diamond, `[(t)]` cylinder; others rectangle, approximated). Block arrows `id<["t"]>(dir)`
SHALL become boxes (approximated). Links, `classDef`, `class` and `style` SHALL map as in
flowcharts.

#### Scenario: Spans on a grid
- **WHEN** a block diagram has `columns 3`, then `a b c`, then `d:2 e`
- **THEN** `d` is placed across the first two cells of the second row with width 308, and `e` in
  the third cell
