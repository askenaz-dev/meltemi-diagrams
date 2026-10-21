## MODIFIED Requirements

### Requirement: Description arrows and notes
Arrows SHALL be read as an optional left head, a body of `-` or `.` of any length with optional
`[#colour]`, `[hidden]`, `[dashed]`, `[bold]` and direction words (`left`, `right`, `up`, `down`
and their prefixes), and an optional right head, with an optional `: label`. A solid body SHALL
give `->`, a dotted one `-->`; no head SHALL give `arrowhead none`; a left head alone SHALL reverse
the relation; both heads SHALL give `<->` or `<-->`; the heads `|>`, `*`, `o` and `x` SHALL
become `triangleOutline`, `diamond`, `diamondOutline` and `cross` at their end (`arrowhead`, or
`arrowtail` for the left head); the heads `#`, `+`, `0`, `(` and `)`, direction words and
multiplicity strings SHALL be approximated; `[hidden]` links SHALL
be dropped (non-essential); `[#colour]` and `[bold]` SHALL become `stroke` and `width 2` styles.
`note left|right|top|bottom of x : t`, the multi-line form ending with `end note`, and
`note "t" as n` with links to it SHALL become flow `note` elements joined to their targets by a
dashed relation without arrowhead. `left to right direction` SHALL set `direction LR`, and `top to
bottom direction` `direction TB`. `together { }` SHALL be dropped, keeping its children.

#### Scenario: Reversed arrow
- **WHEN** a block has `a <.. b`
- **THEN** the sheet has `b --> a`

#### Scenario: Note on an element
- **WHEN** a block has `note right of api : Rate limited`
- **THEN** the sheet has a `note` with that text and a dashed relation without arrowhead to `api`

#### Scenario: Inheritance and composition heads
- **WHEN** a block has `a --|> b` and `c *-- d`
- **THEN** the sheet has `a -> b` styled with `arrowhead triangleOutline`, and `c -> d` styled
  with `arrowtail diamond` and `arrowhead none`

### Requirement: PlantUML sequence diagrams
Sequence blocks SHALL become sequence diagrams. `participant`, `actor`, `boundary`, `control`,
`entity`, `database`, `collections` and `queue` SHALL map one to one with aliases and quoted names;
`order` and colours on participants SHALL be dropped; `box "t" … end box` SHALL become a group.
Messages SHALL map `->` to `->`, `-->` to `-->`, `->>` and `-->>` to the same with `{ kind async }`;
`<->` and `<-->` to the same; `->x`, `->o`, `-\\`, `-/`, `[#c]` bodies and `?`/`[`/`]` gates SHALL be approximated
(gates through a participant `outside`), and left-pointing arrows SHALL be reversed. Target
suffixes `++`, `--`, `**` and `!!` SHALL add `activate`, `deactivate`, `create` and `destroy`.
`activate`, `deactivate`, `create` and `destroy` SHALL be kept; `return t` SHALL become a reply
`-->` from the last activated participant to the one that activated it, followed by `deactivate`.
Notes (`note`, `hnote`, `rnote`, `left of`, `right of`, `over a, b`, multi-line, `ref over`
approximated as notes) SHALL become notes; `alt`/`else`, `opt`, `loop`, `par`/`else`, `break`,
`critical` and `group t` SHALL become fragments with ids `<operator><n>` (`group` as `region`);
`== t ==` SHALL become `divider "t"`, `...` and `...t...` `delay`, `autonumber [n]`
`autonumber`; `|||`, `||n||`, `autonumber stop|resume`, `hide footbox`, `skinparam` and
teoz `&` SHALL be dropped or approximated with findings.

#### Scenario: Return
- **WHEN** a sequence has `a -> b ++ : pay` and later `return ok`
- **THEN** the sheet has `a -> b: "pay"`, `activate b`, `b --> a: "ok"` and `deactivate b`

#### Scenario: Divider and delay
- **WHEN** a sequence has `== Fulfilment ==` and `...2 days later...`
- **THEN** the sheet has `divider "Fulfilment"` and `delay "2 days later"`
