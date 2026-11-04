## ADDED Requirements

### Requirement: PlantUML blocks and diagram types
The PlantUML front-end SHALL preprocess the source (plantuml-preprocessor), then read each
`@startuml [name] … @enduml` block as one diagram (a source without `@startuml` is one block). It
SHALL classify each block as C4 (C4 library included or C4 macros used), description (component,
deployment and use case elements, `[x]`, `(x)`, `:x:`, `()`), or sequence (participant
declarations, messages, activations, fragments, dividers, delays). Blocks of other kinds (`class`,
`state`, activity syntax, objects, timing) and `@startgantt`, `@startmindmap`, `@startwbs`,
`@startjson`, `@startyaml`, `@startsalt` and the like SHALL fail with
`import.unsupported-diagram`. `title` SHALL become the title; `skinparam` (and its blocks),
`hide`, `show`, `scale`, `legend … endlegend`, `header`, `footer`, `caption`, `newpage`,
`!pragma`, `allowmixing`, `sprite` and `<$sprite>` references SHALL be dropped with
`import.unsupported-construct`; `'` and `/' … '/` comments SHALL be kept.

#### Scenario: Two blocks
- **WHEN** a file holds `@startuml checkout … @enduml` and `@startuml payment … @enduml`
- **THEN** the sheet has diagrams `checkout` and `payment`

### Requirement: Component, deployment and use case diagrams
Description blocks SHALL become flow diagrams with `layout auto`. Elements declared with
`component`, `[t]`, `node`, `rectangle`, `card`, `agent`, `artifact`, `file`, `folder`, `frame`,
`package`, `cloud`, `hexagon`, `stack`, `label`, `action`, `process`, `boundary`, `control`,
`entity`, `collections` SHALL become `node`; `database`, `storage` and `queue` `data`;
`interface`, `()`, `circle`, `actor`, `person`, `:t:` and `usecase`, `(t)` `node` with
`import.approximated`. A missing or refused include SHALL be reported and the rest of the source
SHALL still be imported.
Aliases (`as x`, `"t" as x`, `x as "t"`) SHALL give ids and labels; multi-line `[ … ]` labels and
`\n` SHALL give line breaks. An element with `{ … }` SHALL become a group holding its children.
`<<stereotype>>` SHALL become the description `«stereotype»` (approximated). Colours
`#colour`, `#line:c`, `#line.dashed` and `#text:c` SHALL become `fill`, `stroke`, `line dashed`
and `color` styles.

#### Scenario: Deployment nesting
- **WHEN** a block has `node "Server" as srv { [API] as api; database "DB" as db }` and
  `api --> db : SQL`
- **THEN** the sheet has `group srv "Server"` holding `node api "API"` and `data db "DB"`, and
  `api -> db: "SQL"`

### Requirement: Description arrows and notes
Arrows SHALL be read as an optional left head, a body of `-` or `.` of any length with optional
`[#colour]`, `[hidden]`, `[dashed]`, `[bold]` and direction words (`left`, `right`, `up`, `down`
and their prefixes), and an optional right head, with an optional `: label`. A solid body SHALL
give `->`, a dotted one `-->`; no head SHALL give `arrowhead none`; a left head alone SHALL reverse
the relation; heads other than `>`, `>>` and `<` (`|>`, `*`, `o`, `#`, `+`, `0`, `(`, `)`),
both heads, direction words and multiplicity strings SHALL be approximated; `[hidden]` links SHALL
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

### Requirement: PlantUML sequence diagrams
Sequence blocks SHALL become sequence diagrams. `participant`, `actor`, `boundary`, `control`,
`entity`, `database`, `collections` and `queue` SHALL map one to one with aliases and quoted names;
`order` and colours on participants SHALL be dropped; `box "t" … end box` SHALL become a group.
Messages SHALL map `->` to `->`, `-->` to `-->`, `->>` and `-->>` to the same with `{ kind async }`;
`->x`, `->o`, `-\\`, `-/`, `<->`, `[#c]` bodies and `?`/`[`/`]` gates SHALL be approximated
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
