## MODIFIED Requirements

### Requirement: Description arrows and notes
Arrows SHALL be read as an optional left head, a body of `-` or `.` of any length with optional
`[#colour]`, `[hidden]`, `[dashed]`, `[bold]` and direction words (`left`, `right`, `up`, `down`
and their prefixes), and an optional right head, with an optional `: label`. A solid body SHALL
give `->`, a dotted one `-->`; no head at either end SHALL give the line token `--` (`---` for a
dotted body); a left head alone SHALL reverse
the relation; both heads SHALL give `<->` or `<-->`; the heads `|>`, `*`, `o` and `x` SHALL
become `triangleOutline`, `diamond`, `diamondOutline` and `cross` at their end (`arrowhead`, or
`arrowtail` for the left head), and a left head of those kinds with no right head SHALL give `--`
with `arrowtail` and no `arrowhead`; the heads `#`, `+`, `0`, `(` and `)`, direction words and
multiplicity strings SHALL be approximated; `[hidden]` links SHALL
be dropped (non-essential); `[#colour]` and `[bold]` SHALL become `stroke` and `width 2` styles.
`note left|right|top|bottom of x : t`, the multi-line form ending with `end note`, and
`note "t" as n` with links to it SHALL become flow `note` elements joined to their targets by a
dashed line `---`. `left to right direction` SHALL set `direction LR`, and `top to
bottom direction` `direction TB`. `together { }` SHALL be dropped, keeping its children.

#### Scenario: Reversed arrow
- **WHEN** a block has `a <.. b`
- **THEN** the sheet has `b --> a`

#### Scenario: Note on an element
- **WHEN** a block has `note right of api : Rate limited`
- **THEN** the sheet has a `note` with that text and `note1 --- api`, neither named nor styled

#### Scenario: Inheritance and composition heads
- **WHEN** a block has `a --|> b` and `c *-- d`
- **THEN** the sheet has `a -> b` styled with `arrowhead triangleOutline`, and `c -- d` styled
  with `arrowtail diamond` and no `arrowhead`

#### Scenario: Plain line
- **WHEN** a block has `a -- b` and `c .. d`
- **THEN** the sheet has `a -- b` and `c --- d`, neither named nor styled
