## MODIFIED Requirements

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
