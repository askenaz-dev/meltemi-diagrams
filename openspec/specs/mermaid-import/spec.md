# mermaid-import Specification

## Purpose
Maps Mermaid flowcharts, sequence, C4, architecture and block diagrams to flow, sequence, C4 and free sheets, reporting what is approximated or dropped.

## Requirements

### Requirement: Mermaid diagram types
The Mermaid front-end SHALL read optional YAML front matter (`title`, and `config` which is
dropped, except `config.gantt.displayMode` and `config.gantt.topAxis` of a gantt), `%%{init}%%`
directives (dropped) and `%%` comments, then the diagram keyword:
`flowchart` and `graph` (flow), `sequenceDiagram` (sequence), `C4Context`, `C4Container`,
`C4Component` and `C4Dynamic` (model and view, see c4-import), `architecture-beta` and
`architecture` (flow), `block-beta` and `block` (free), `gantt` (gantt). Every other keyword
(`classDiagram`, `stateDiagram`, `erDiagram`, `pie`, `C4Deployment`, …) SHALL fail with
`import.unsupported-diagram`. `accTitle` and `accDescr` SHALL become `title` and `description` in
every type.

#### Scenario: Front matter title
- **WHEN** a flowchart has front matter `title: Checkout`
- **THEN** the diagram is `checkout` with `title "Checkout"`

#### Scenario: A gantt is imported
- **WHEN** a source starts with `gantt`
- **THEN** the import's status is not `failed`, its diagram has type `gantt`, and no
  `import.unsupported-diagram` is reported

#### Scenario: Still unsupported
- **WHEN** a source starts with `pie`
- **THEN** the import fails with `import.unsupported-diagram`, whose hint names `gantt` among the
  imported types

### Requirement: Flowchart nodes and subgraphs
A flowchart SHALL become a flow diagram with `layout auto` and the direction (`TD` and `TB` as
`TB`, `BT`, `LR`, `RL`). Nodes SHALL map by shape: `[t]` and `(t)` to `node`, `{t}` to `decision`,
`[(t)]` to `data`; `([t])` to `node` with `shape pill`, `[[t]]` with `shape framed`, `((t))` with
`shape circle`, `>t]` with `shape flag`, `{{t}}` with `shape hexagon`, `[/t/]` with
`shape parallelogram`, `[/t\]` with `shape trapezoid`, each written as `style <id> { shape … }`
after the declaration; `(((t)))` to `shape circle`, `[\t\]` to `shape parallelogram` and `[\t/]`
to `shape trapezoid` with `import.approximated` (the double ring and the mirrored forms are not
drawn); the `@{ shape: …, label: … }` syntax by the same table of shape names. Labels SHALL drop
quotes, turn `<br>` into line breaks, decode `#quot;` style entities and Markdown strings
(approximated), and drop `fa:` icon tokens (approximated). Nodes SHALL be declared once, in the
innermost subgraph that mentions them; when sibling subgraphs mention the same node, the first to
close keeps it, as Mermaid does. `subgraph id [title]`, `subgraph title` and nested subgraphs
SHALL become groups; a subgraph's `direction` SHALL be dropped.

#### Scenario: Shapes
- **WHEN** a flowchart declares `a[Start]`, `b{Paid?}`, `c[(Orders)]` and `d{{Retry}}`
- **THEN** the sheet declares `node a "Start"`, `decision b "Paid?"`, `data c "Orders"` and
  `node d "Retry"` followed by `style d { shape hexagon }`, with no `import.approximated`

#### Scenario: Mirrored shape
- **WHEN** a flowchart declares `e[\Input\]`
- **THEN** the sheet declares `node e "Input"` with `style e { shape parallelogram }` and one
  `import.approximated` for `e`

#### Scenario: Node moved into a subgraph
- **WHEN** `a --> b` comes before `subgraph backend` that mentions `b`
- **THEN** `b` is declared inside `group backend` and the relation is kept

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
direction, `<-->` becoming `<->`, `--` becoming the line token `--`, and `{group}` modifiers relating
the services' groups.

#### Scenario: Sides become ports
- **WHEN** an architecture diagram has `db:L -- R:server`
- **THEN** the sheet has `db -- server as e1` and `route e1 from db.west to server.east`, with no
  `style` statement for `e1`

#### Scenario: Arrow edge
- **WHEN** an architecture diagram has `db:L --> R:server`
- **THEN** the sheet has `db -> server as e1` with its route, and `import.unsupported-construct` is not reported

### Requirement: Mermaid block diagrams
`block-beta` SHALL become a free composition: `columns n` (or one column per item of the first
row when absent) sets a grid of cells 168 wide and 84 tall; items fill rows left to right, `:n`
spans `n` columns, `space` and `space:n` leave cells empty, and nested `block:id:span … end`
becomes an untitled group (`group id ""`) with its own columns, whose children are placed from its
interior, `groupPadding` below its top edge. Every box SHALL get a `place` at its cell's centre and a
`size` of its span's width minus 28 by 56; every group a `place` and `size` around its cells.
Shapes SHALL map to `shape` (`[t]` rectangle, `(t)` rounded, `([t])` pill, `((t))` circle,
`{t}` diamond, `[(t)]` cylinder, `{{t}}` hexagon, `[[t]]` framed, `>t]` flag, `[/t/]`
parallelogram, `[/t\]` trapezoid; `(((t)))` circle, `[\t\]` parallelogram and `[\t/]` trapezoid
approximated). Block arrows `id<["t"]>(dir)` SHALL become boxes with `shape arrow` (approximated
when the direction is not left to right). Links, `classDef`, `class` and `style` SHALL map as in
flowcharts.

#### Scenario: Spans on a grid
- **WHEN** a block diagram has `columns 3`, then `a b c`, then `d:2 e`
- **THEN** `d` is placed across the first two cells of the second row with width 308, and `e` in
  the third cell

#### Scenario: Block shapes
- **WHEN** a block diagram declares `a{{"Hex"}}` and `b[/"Lean"/]`
- **THEN** the sheet declares `box a "Hex"` with `style a { shape hexagon }` and `box b "Lean"`
  with `style b { shape parallelogram }`, without `import.approximated`

#### Scenario: Nested block
- **WHEN** a block diagram has `block:services … end` holding `a` and `b`
- **THEN** the sheet declares `group services ""` with `a` and `b` placed from 16 px below its top
  edge, and no `layout.container-margin` is reported

### Requirement: Mermaid gantt charts
`gantt` SHALL become a gantt chart: `title` (and `accTitle` when there is no title) to `title`,
`accDescr` (one line or `{ … }`) to `description`, `section <name>` to `section <id> "<name>"` with
the id from the name (`slugId`, unique), each task line `<name> : <metadata>` to a `task`, a
`milestone` (tag `milestone`) or a `marker` (tag `vert`) with the name as label, the tags `done`,
`active` and `crit` to `done`, `active` and `critical`, `click <id> href "<url>"` to `url` in the
task's block, `%%` comments to `//` comments before the next statement, and tasks before the first
section at the chart's top level. A task's id SHALL be its written id through `sanitizeId`, or
Mermaid's own `task<n>` when it has none; an id equal to a clause word (`for`, `to`, `after`…) or
taken SHALL be renamed with `import.renamed-id`. `click <id> call <callback>(…)` SHALL be dropped as
`gantt.click` (warning); an `after` or `until` id the chart does not declare SHALL be dropped as
`gantt.after` (warning); a line that cannot be read SHALL be `import.syntax` with a "Not imported"
comment, as in the other front-ends. Every construct SHALL appear in the coverage table `gantt` in
English and Spanish.

#### Scenario: The owner's roadmap
- **WHEN** `corpus/import/mermaid/gantt-roadmap.mmd` (the owner's source) is imported
- **THEN** the status is `complete` with no finding, the sheet is `corpus/import/mermaid/gantt-roadmap.meltemi` (sections `tecnologia`, `nuevo_flujo_genai_hub` and `i_d`; `task tec1 "Prueba de concepto con el equipo de Arquitectura" after tec0 for 10d`), and it validates with no diagnostic

#### Scenario: Tags and a link
- **WHEN** a task is `Deploy :crit, done, dep1, 2026-06-01, 2d` followed by `click dep1 href "https://ci.example.com"`
- **THEN** the sheet has `task dep1 "Deploy" from 2026-06-01 for 2d done critical { url "https://ci.example.com" }`

#### Scenario: A callback
- **WHEN** the chart has `click dep1 call openTicket("dep1")`
- **THEN** `gantt.click` is reported as dropped (warning) and nothing of it is written

#### Scenario: A missing predecessor
- **WHEN** a task is `Test :t1, after build, 3d` and no task is `build`
- **THEN** `gantt.after` is reported and the task follows the previous task

### Requirement: Mermaid gantt schedules
The front-end SHALL parse dates with the chart's `dateFormat` (every dayjs token Mermaid documents:
`YYYY`, `YY`, `Q`, `M`, `MM`, `MMM`, `MMMM`, `D`, `DD`, `Do`, `DDD`, `DDDD`, `X`, `x`, `H`, `HH`, `h`,
`hh`, `a`, `A`, `m`, `mm`, `s`, `ss`, `S`, `SS`, `SSS`, `Z`, `ZZ`; `YYYY-MM-DD` by default) and write
them as ISO dates, a time only when it is not midnight; zones (`Z`, `ZZ`) SHALL be dropped with
`import.approximated`, and a format without a day SHALL put dates on the import's day (the option
`today`, the machine's day by default), approximated once. Every metadata form SHALL map: a start date
to `from`, `after a b` to `after a, b`, an end date to `to` the day before (Mermaid's end is
exclusive) unless `inclusiveEndDates` is written or the end has a time, `until a b` to `until a, b`,
and a duration `ms`, `s`, `m`, `h`, `d`, `w`, `M` or `y` (decimals kept) to `s` (milliseconds rounded
up, approximated), `s`, `min`, `h`, `d`, `w` (`7n` d when the chart excludes days), and days for `M`
and `y` computed from Mermaid's schedule (approximated, naming both). A milestone SHALL be `at` its
start plus half its duration, or `after` its dependency when it has one (a duration then
approximated). The front-end SHALL replay Mermaid's scheduling (the latest end of `after`, the previous
task by default, the import's day for a start it cannot find, ends pushed past excluded days, `until`
the earliest start) and report each task whose Meltemi dates differ from Mermaid's, once, as
`import.approximated` (`gantt.schedule`) with both dates; a start date on an excluded day SHALL be
written as the next working day with that finding. A date that cannot be read SHALL be `import.syntax`
on the task, which is written without that clause.

#### Scenario: Mermaid's dates kept
- **WHEN** the owner's source is imported
- **THEN** the sheet's tasks resolve to the dates Mermaid draws: tec0 1–5 June, tec1 8–19 June, tec2 22 June, flu0 15–17 June, flu1 18 June–1 July, flu2 2–15 July, flu3 16–29 July, sdlc0 1 July–11 August, sdlc1 3–7 August and sdlc2 10–28 August 2026

#### Scenario: Another date format and an exclusive end
- **WHEN** a chart has `dateFormat DD/MM/YYYY` and `Design :d1, 01/06/2026, 06/06/2026`
- **THEN** the sheet has `task d1 "Design" from 2026-06-01 to 2026-06-05`

#### Scenario: Weeks under exclusions
- **WHEN** a chart with `excludes weekends` has `Build :b1, 2026-06-01, 1w`
- **THEN** the sheet has `task b1 "Build" from 2026-06-01 for 7d`, the dates Mermaid draws, and no finding

#### Scenario: A month
- **WHEN** a chart has `Pilot :p1, 2026-01-31, 1M`
- **THEN** the sheet has `for 28d` and `import.approximated` names `1M` and `28d`

#### Scenario: A start on Saturday
- **WHEN** a chart with `excludes weekends` has `Kick-off :k1, 2026-06-06, 2d`
- **THEN** the sheet has `from 2026-06-08 for 2d` and `import.approximated` (`gantt.schedule`) gives
  Mermaid's start, 2026-06-06, and Meltemi's, 2026-06-08

#### Scenario: An unreadable date
- **WHEN** a chart with the default format has, after another task, `Fix :f1, 2026-13-45, 2d`
- **THEN** `import.syntax` is reported on the task, the status is `partial`, and the sheet has
  `task f1 "Fix" for 2d`, which follows the task before it

### Requirement: Mermaid gantt calendars and axes
`excludes` SHALL become `exclude` (`weekends`, weekday names and dates; several lines add up),
`weekend friday` SHALL make `weekends` Friday and Saturday (`exclude friday, saturday`), `includes`
SHALL become `include`, `weekday <day>` SHALL become `weekStart <day>` (and `weekStart sunday`,
Mermaid's default, SHALL be written when `tickInterval` is in weeks and no `weekday` is),
`tickInterval <n><unit>` SHALL become `ticks` (`millisecond` as `1s`, approximated), `axisFormat`
SHALL be kept with `%c`, `%x` and `%X` expanded to their d3 forms and `%L` and `%Z` dropped
(approximated), `topAxis` and `config.gantt.topAxis` SHALL become `axis both`,
`config.gantt.displayMode: compact` SHALL become `display compact`, `todayMarker off` SHALL write
nothing, no `todayMarker` SHALL write `today` (Mermaid draws the line by default), and a styled
`todayMarker` SHALL write `today` with `import.approximated` (`gantt.todayMarker`, the style
dropped). An `excludes` value that is not `weekends`, a weekday or a date SHALL be dropped as
`gantt.excludes` (warning).

#### Scenario: The owner's calendar
- **WHEN** the owner's source (`axisFormat %d %b`, `excludes weekends`, no `todayMarker`) is imported
- **THEN** the sheet has `axisFormat "%d %b"`, `exclude weekends` and `today`, in that order, before
  the first section

#### Scenario: A Friday weekend
- **WHEN** a chart has `excludes weekends` and `weekend friday`
- **THEN** the sheet has `exclude friday, saturday`

#### Scenario: Compact from the front matter
- **WHEN** a chart's front matter has `config:` / `gantt:` / `displayMode: compact` and `barGap: 6`
- **THEN** the sheet has `display compact` and `barGap` is reported dropped as `mermaid.config`

#### Scenario: An exclusion that is no day
- **WHEN** a chart has `excludes holidays`
- **THEN** `gantt.excludes` is reported as dropped and no `exclude` statement is written
