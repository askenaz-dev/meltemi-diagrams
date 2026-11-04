## MODIFIED Requirements

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

## ADDED Requirements

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
