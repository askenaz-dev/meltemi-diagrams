# 0066. Gantt charts: a fifth diagram type, scheduled from dates

Status: accepted (gantt-diagrams change, 30 October 2026). Extends decisions 0019, 0021, 0022, 0023
and 0064, and follows the profile of decision 0019.

## Context

The owner asked on 2026-10-29: "Falta agregar diagramas gantt y soporte a importar diagramas Gantt
desde mermaid". The roadmap he keeps in Mermaid (a `gantt` of three sections, ten tasks, `after`
chains, durations in days and `excludes weekends`) could not reach Meltemi, and nothing in the
language could say "this task starts after that one and lasts ten working days":

- **The importer refused it.** `gantt` was in `MERMAID_UNSUPPORTED`, so `importMermaid` stopped with
  `import.unsupported-diagram`, and the types of its output were closed to `flow`, `free`,
  `sequence` and `c4`.
- **There were four diagram types, none with a time axis.** Free compositions place by coordinates,
  flow and C4 hand positions to ELK, and sequence diagrams order events without dates.
- **The language could not read a date.** `2026-06-01` lexed as three numbers, `2026`, `-06` and
  `-01`, and arguments were identifiers, strings, numbers, tuples and lists only.

The base was ready for a fifth type. Sequence diagrams (decision 0019) showed how a type with its
own deterministic layout plugs in: an analyzer beside the flow one, an early return in
`layoutDrawing`, elements and relations in the shared `FlowDiagram`. Render, effects, stories, the
player and every export work through scene-group conventions, with no code per type, so a chart
drawn as element and relation groups is exported, animated and explained like the others; the
canvas already moves declarations to a position (`moveElement { index }`, decision 0064).

The owner took the design's recommendation for each of its nine open questions on 30 October 2026:
the keyword `section`, the status words on the task's line, an inclusive `to`, `today` for
Mermaid's default today line, dependency arrows drawn by default, `from` beside `after` as "the
later of the two", durations in `s`, `min`, `h`, `d` and `w`, a `roadmap` template and the keys T, M,
V and G.

## Decision

- **A profile of its own, compiled into the shared model** (D1). `gantt` joins `DIAGRAM_TYPES` with
  a `GANTT_PROFILE`; `analyzeGanttDiagram` (a `GanttAnalyzer` extending `FlowAnalyzer`, as the
  sequence one does) compiles tasks, milestones and markers into `Element`s of the kinds `task`,
  `milestone` and `marker`, sections into elements of kind `section` that hold them, each `after`
  id into a `derived` relation from the predecessor keyed `<pred>-><task>#<n>`, and the chart's
  settings and calendar into `FlowDiagram.gantt`. `Element.task` holds the written schedule and the
  resolved one, so selection, styles, classes, rules, links, renames, effects, stories and the JSON
  keep working because a task is an element.
- **Dates are literals of the language** (D2). The lexer reads four digits, `-`, two digits, `-`,
  two digits and optionally `T`, two digits, `:`, two digits and optionally `:` and two digits, with
  no space, as one `Date` token; the parser takes it as an argument (`DateLiteral`), the formatter
  prints it as written, and the model checks that it names a day (`2026-02-30` is
  `prop.invalid-value`: "February 2026 has 28 days"). The time is civil: no zone, no daylight
  saving; an instant is the count of seconds since `1970-01-01T00:00` of the proleptic Gregorian
  calendar, computed with integer arithmetic in `packages/model/src/calendar.ts`. Anything else that
  starts with digits lexes as numbers, as before.
- **Four statements, with clauses and status words on one line** (D3). `section <id> ["Label"]
{ … }`, `task <id> ["Label"] [from <date>] [after <ids>] [for <duration> | to <date> | until
<ids>] [done | active] [critical] [{ … }]`, `milestone <id> ["Label"] [at <date>] [after <ids>]
[done | active] [critical]` and `marker <id> ["Label"] (at <date> | after <ids>)`. Clauses come in
  any order after the label; a clause word takes its value, a status word stands alone, a block ends
  the statement. Sections hold tasks, milestones and markers, never sections, and the three may
  stand at the top level. The word is `critical`, not Mermaid's `crit`.
- **Ids and the words a chart reserves** (D4). `from`, `after`, `for`, `to`, `until`, `at`, `done`,
  `active` and `critical` cannot be ids, so a list of ids ends at the next clause; `after` and
  `until` name tasks and milestones, never a section or a marker; the references have the role
  `dependency`, so `renameId` rewrites them and removing a task finds them. `gantt`, `task`,
  `milestone`, `marker` and `section` join the reserved words of declared types.
- **The schedule** (D5). A start is `from` alone, the latest end of the `after` tasks alone, or the
  later of both; without either, the end of the previous task or milestone in source order, across
  sections, and the first one is `gantt.unscheduled`. A start on excluded time moves to the next
  working instant: silently when it follows from `after`, with `gantt.excluded-day` (warning) when
  `from` or `at` writes it. `for` adds working time; `to <date>` ends at the end of that day,
  inclusive, and on an excluded day at the end of the last working day before it (warning); `until`
  ends at the earliest start of what it names; a task with no end lasts one day. A milestone is its
  start; a marker is at its `at` date or the end of its latest `after` task, and is never moved or
  warned about, since it may mark a weekend. Dependencies are resolved in topological order; a loop
  is `gantt.cycle` on every reference of the loop, an end before the start (or equal to it) is
  `gantt.schedule`, and a task that cannot be dated has no dates.
- **Durations, working time and the calendar** (D6). A duration is a number above 0 with `s`,
  `min`, `h`, `d` or `w`; `1d` is 24 hours and `1w` 7 days without exclusions. With exclusions
  durations count working time: an excluded day contributes nothing, a week is the working days of a
  week, and `h`, `min` and `s` count the hours of working days. `exclude weekends | <weekday> |
<date>` (statements add up), `include <date>` and `weekStart` write the calendar. Months and years
  are not durations; the importer converts them to days, and `mo` and `y` exist as tick intervals.
- **Diagnostics** (D7). `gantt.cycle`, `gantt.unscheduled`, `gantt.schedule` and `gantt.relation`
  are errors, `gantt.excluded-day` a warning and `layout.ticks-crowded` a layout warning. Malformed
  values reuse the language's codes with precise ranges (`prop.invalid-value`, `prop.unknown`,
  `prop.duplicate`, `ref.unknown-element`), and every message names the form of its statement.
- **The model, the JSON and the calendar module** (D8). `calendar.ts` is pure: parsing, formatting,
  weekdays, working time. The model JSON gives every element `task` and every diagram `gantt` as
  their last keys, null but for charts, and stays `0.1`. The diff compares the written clauses,
  status, `critical` and the resolved dates, and says what moved a date: a task it follows, the
  calendar or the order of the tasks.
- **The time scale, the ticks and the axis format** (D9). The span of the dated statements is
  extended to whole ticks. The timeline is `dayWidth × days` wide when `dayWidth` (1 to 100,000) is
  written, and otherwise fills the canvas, 1,200 units on `document`, 1,920 on `slide`, the written
  `canvas` width, and 960 on a `board`, less the section column and the margins. The interval is the
  smallest of 1, 5, 15 and 30 s; 1, 5, 15 and 30 min; 1, 3, 6 and 12 h; 1 and 2 d; 1 and 2 w; 1, 3
  and 6 mo; 1, 2, 5 and 10 y whose spacing holds the widest label plus 12 units; `ticks` fixes it and
  labels every n-th tick (`layout.ticks-crowded`) when it is too fine. `axisFormat` is a strftime
  subset (`%a %A %b %B %d %e %H %I %j %m %M %p %q %S %U %V %w %W %y %Y %%`, each with the `-` flag);
  without it the format follows the interval, `%H:%M:%S` under a minute. An automatic axis never
  picks ticks finer than the written directives tell apart (`%b` keeps ticks a month apart, so no
  `Jan Jan Feb Feb`), and a label at an end of the axis moves in to stay on the canvas. Month and
  weekday names come from the content language.
- **Rows, bars, labels and colours** (D10). A column at the left holds the section titles (wrapped
  at 280 units, at least 120 wide); each task and milestone takes a row, a bar `round(24 ×
relationLabelSize / 11)` tall on a pitch of that plus 8, with 8 above and below each section;
  sections draw a `band` at 60 % opacity every other time so the grid shows through. Bars are
  coloured by status from the theme (`accent`, `info`, `muted`), `critical` strokes in `danger` and
  fills a planned bar with it. A label goes inside its bar in `tagText` when it fits with 8 units on
  each side, else 6 units after the bar (14 when an arrow leaves it), else before it, standing left
  of the arrow that enters; it never stands across an arrow, a marker's line or the today line when
  another place is free, and the chart grows for a label that has none. `labels column` and
  `display compact` change where labels and rows go. Styles and `rule task|milestone|marker|section`
  override `fill`, `stroke`, `color`, `width`, `line` and `radius`; `shape`, `rotation`,
  `iconPosition`, `labelPosition`, `iconSize`, `routing` and the free-only properties are refused,
  and so are the text properties of [decision 0067](0067-font-families-and-text-size.md) (`font`,
  `fontSize`, `fontWeight`), which reached main while this change waited: a chart's labels keep the
  theme's font at the size of its rows, and honouring them would size each row by its label.
- **Milestones, markers, today, excluded days and arrows** (D11). A milestone is a diamond 0.8 times
  the bar's height; a marker a dashed line from a `tag` pill above the rows to the axis, drawn behind
  the bars, its pills staggered in lanes; the today line is 2 units of `danger` with the drawing
  word "Today" ("Hoy"), drawn only inside the span; excluded days are `band` columns at 60 % opacity
  when a day is wider than 2 units; a dependency arrow leaves its predecessor 8 units to the right
  and enters the successor's start, going down to the gap between the rows when the two are less
  than 16 units apart, in the theme's connector style and above the bars; `dependencies hidden`
  draws none.
- **Today** (D12). `today` draws the line at the day the picture is made and `today <date>` pins it.
  Hosts pass the day as `LayoutOptions.today`, a `YYYY-MM-DD` text; the layout never reads a clock,
  and without the day a chart's line is not drawn. The editor and the web app pass their local
  date, the command line the machine's, or `mdg export --today <date>`, which a date written in the
  chart overrides. Tests, the gallery and the acceptance suite pin it.
- **Scene groups and what editors read** (D13). An `axis` group (a new `SceneRole`: the grid, the tick
  labels, the excluded days and the today line, not repainted by sketch themes, with no pointer
  events, never faded by stories); a group per section (`element`, `bounds` its band) holding its
  tasks' groups; a group per task, milestone and marker (`element`, `bounds` the bar, diamond or
  line, `bounds.label` its label's box, `href` its URL); a group per drawn dependency (`relation`,
  its key, `track` its route). `LayoutResult.gantt` holds the timeline (`x`, `width`, `start`, `end`,
  `dayWidth`) and each row's `y`, `height` and section. The label audit checks a task's label against
  what it overlaps, not against its own bar.
- **Effects and stories** (D14). `pulse` and `dash` take tasks, milestones, markers and sections;
  `flow` and `trace` take a task or milestone with dependencies and run along each incoming arrow
  (the motion plan expands the target into the arrows' groups), and are `animate.invalid-target`
  without one, naming the kind of a section or a marker. In stories `draw <task>` grows each bar from
  its start to its end as a clip over a share of the time in proportion to its width, and a task
  first shown by `draw` starts hidden; `trace <task>` lights the arrows of the chain that drives it
  (from it, the predecessor that ends last, recursively), earliest first, each over a share in
  proportion to its length; `reveal`, `hide`, `highlight`, `focus` and `camera` take sections,
  tasks, milestones and markers as elements.
- **Edit operations** (D15). `setTaskSchedule`, `setTaskStatus`, `createTask` and `setCalendar`
  write or delete exactly the clause tokens they name, keep the rest of the line, its comments and
  its block, recompile and are refused when the chart would get a new error; the kind of `createTask`
  is `elementKind`, as `createElement`'s kind names its own. `moveElement` takes `parent` and `index`
  alone on a chart, refuses an index past the last place and takes a section out with one of its two
  surrounding blank lines. `removeElement` of a task writes `from` its current start on each
  successor that loses its last start clause (and on the tasks that followed it in the file), turns
  an `until` that loses its last id into the `for` the task lasted, lists a note for each, and raises
  no `edit.has-dependents` for dependencies. Every operation that places or links boxes is refused on
  a chart with `edit.invalid-value`, `setElementProperty` takes `link` and `url` only, and a refusal
  that comes from the model's diagnostics carries its code in the new `EditRejection.diagnostic`.
- **Canvas gestures** (D16). The canvas turns x into instants from `CanvasRender.timeline`, and the
  session does the calendar arithmetic: the action `schedule { task, start?, end? }` is planned into
  `setTaskSchedule`, a start becoming `from` (removed when it equals the end of the dependencies, so
  a bar dragged onto its predecessor sticks), an end `for` in working days (weeks, hours or minutes
  when the old clause or the snap says so), `to` when the task has one, and `until` replaced with
  `for`. Bars drag by their body and their ends and snap to the smallest of 15 min, 1 h, 1 d and 1 w
  at least 6 screen pixels wide; rows drag vertically under an insertion bar (into another section
  too); a handle at a bar's end connects (`after`, a loop refused with a red flash); T, M, V and G
  create, Left and Right move a day (Shift: a week), `]` and `[` stretch, Alt+Up and Alt+Down move
  rows; a read-only canvas selects and shows cards only. The live preview runs on charts.
- **Palette, inspector and language services** (D17). The palette shows Task, Milestone, Marker and
  Section; the New diagram menu and the empty-file buttons add Gantt chart. The inspector has a
  Schedule group and the chart's fields, with the field types `date`, `duration`, `tasks` and
  `weekdays`. Completion, hover, quick fixes (`gantt.unscheduled`, `gantt.relation`,
  `gantt.excluded-day`, `gantt.cycle`), the outline and the VS Code grammar know the statements,
  the clauses and the dates.
- **The Mermaid front-end** (D18). `packages/import/src/mermaid/gantt.ts` and `dates.ts` read every
  construct Mermaid documents and replay its scheduling (`getStartDate`, `getEndDate`,
  `fixTaskDates`, inclusive ends, includes, `weekend`) to write what Mermaid draws: dates as ISO
  text, exclusive ends as inclusive `to`, `1w` under excluded weekdays as `7d`, months and years as
  days, a milestone at the middle of its span, a chart with no `todayMarker` as `today`, `click …
href` as `url`. After the self-compile it compares each task's dates under Meltemi's rules with
  Mermaid's and reports each that differs once (`import.approximated`, `gantt.schedule`, both
  dates). `click … call` is dropped and a styled `todayMarker` approximated. `ImportOptions.today`
  places what Mermaid leaves open; a re-import keeps `axisFormat`, `ticks`, `weekStart`, `axis`,
  `labels`, `display`, `dependencies` and `dayWidth`, and takes the schedule from the source.
- **The owner's chart** (D19). The source imports with no finding to `corpus/valid/gantt/roadmap.meltemi`
  and validates with `0 errors, 0 warnings`. It resolves to the dates Mermaid draws (the first task 1
  to 5 June, the last 10 to 28 August 2026) and draws on the `document` preset a timeline of thirteen
  weeks from Monday 1 June to Monday 31 August with weekly ticks (`01 jun` … `31 ago` in a Spanish
  project), three bands, ten bars, six arrows and the weekends shaded; no today line, since the day
  is outside the span. With the bundled fonts the label of `flu2` fits inside its bar, as `sdlc0`'s
  does, and `sdlc2`'s stands before its bar.
- **Templates, gallery, corpus, documentation, skill and glossary** (D20). A `roadmap` template
  after `sequence` (eight templates, with a story that reveals each section, draws its bars and
  traces the chain to the launch); `gallery/gantt/launch-plan.meltemi` with a pinned `today`;
  `corpus/valid/gantt/{roadmap,constructs,calendar,times}`, `corpus/invalid/gantt.*`,
  `corpus/acceptance/gantt/{chains,long-labels,parallel,sections,thirty}` (a chart has no cycles
  or nested containers, so its five sheets are named for what a plan stresses) and
  `corpus/import/mermaid/gantt-*` with a merge case; `docs/language/gantt.md` and the pages that
  list a type, the skill's `reference/gantt.md` and the glossary (Gantt chart → diagrama de Gantt,
  task → tarea, milestone → hito, marker → marca, section → sección, dependency → dependencia,
  working day → día hábil, excluded day → día excluido, today → hoy, critical → crítica, done →
  hecha, active → en curso).
- **Order with the sibling changes** (D21). Independent of `sequence-wrap-tags-and-activation`
  (decision 0065): its keys are bound on `sequence` only, its `tags` and this change's `task` are
  new keys of elements in the model JSON, and neither modifies a requirement the other modifies.
  Independent of `playground-sea`, whose empty canvas shows whatever buttons `CREATABLE` lists.
- **Motion** (D22). Every movement uses the canvas's motion tokens and drops to zero under reduced
  motion: the dragged bar follows the pointer without a transition while the successors, arrows and
  axis glide to the preview's places over `--mdg-motion`; the date tooltip fades in over
  `--mdg-motion-fast`; reaching the predecessor's end shows a guide tick while the bar sticks; the
  connect handle fades and scales in, and a loop flashes the target in `danger` twice; a new task
  pops in with its editor and a removed one fades; stories run on the story's clock.

## Alternatives considered

- **A declared type on the free profile** (decision 0030): declared kinds are boxes placed by the
  engine, nothing would compute dates, and the registry has no statements with clauses.
- **A free composition that the importer fills with computed places**: the dates would be lost, and
  one duration changed would mean moving ten boxes by hand.
- **A separate `GanttChart` structure beside `FlowDiagram`**: every consumer (canvas, inspector,
  stories, player, diff, merge) would need a second path for selection and styles.
- **Relations written `a -> b` for dependencies**: two ways of saying "after", and an arrow in the
  text whose direction readers confuse with the timeline's.
- **Quoted dates, a `dateFormat` statement, or three number tokens joined in the model**: a date and
  a label would look alike and the grammar could not colour them; `01-06-2026` would mean June or
  January depending on a line elsewhere; the formatter and every edit would see three arguments.
- **Properties in the block (`task a { start …; duration …; status … }`)**: four lines per task,
  three times the file for the owner's chart, and nothing to read at a glance. **Mermaid's
  metadata after a colon**: positional, told apart by shape only. **`group` instead of `section`**:
  the language's word for containers, but every plan and the owner say section.
- **Mermaid's exclusive end dates, an error for a task without an end, `from` and `after` as an
  error, excluded starts kept**: `to 2026-06-06` for a task that ends on the 5th reads wrong; the
  canvas always writes an end, and a hand-written chart is better drawn one day long than not
  drawn; a dependent bar's drag would have to break the dependency; a bar over a weekend is a
  picture of work nobody does.
- **Months and years as durations, Mermaid's `m` for minutes, weeks as seven working days, a range
  of holidays**: their length depends on where they start, `m` is metres or months, `2w` meaning
  almost three calendar weeks surprises everyone, and a list of dates says the same in one line.
- **d3's automatic ticks, a fixed day width**: Sunday weeks and a dependence on d3's heuristics; a
  five-year plan would be metres wide and a one-day plan a stub.
- **Gantt-only theme tokens, Mermaid's four cycling section colours, a label column by default**:
  eight themes times five tokens for colours the existing ones name; alternating bands read the same
  and follow the theme; wider charts, and the owner's picture has labels on the bars.
- **Mermaid's default today line without a `today` statement, only pinned dates, an export-profile
  option**: every export would change daily and Git would see a new SVG each morning; the owner would
  edit the file every morning; a fourth place to say it, where the command line's flag covers CI.
- **A story action per section, `trace` of every transitive predecessor**: `reveal` of the section
  and `draw` of its tasks say it with what exists; on a real plan it lights half the chart, and the
  driving chain is the critical path into the task.
- **Dragging a dependent bar replaces `after` with `from`, refusing such drags, dependencies drawn
  by a relation tool only**: the link would be lost by a nudge; the most common gesture of a plan;
  the connect handle is what every gantt tool offers.

## Consequences

- The language stays 0.2 and the model JSON 0.1: `Date`, `gantt` and its statements, `task` and the
  chart's `gantt` key are additive, and no valid file could contain a date as three numbers, since
  the lexer reads a date only as four digits, `-`, two digits, `-` and two digits. Every
  `.model.json` snapshot gains `task: null` on each element and `gantt: null` on each diagram.
- New diagnostics: `gantt.cycle`, `gantt.unscheduled`, `gantt.schedule`, `gantt.relation` (errors),
  `gantt.excluded-day` (warning) and `layout.ticks-crowded` (warning); the import adds the
  constructs `gantt.*` of the coverage table, in English and Spanish. The invalid corpus holds one
  sheet per gantt code but not for `prop.invalid-value`, which has its sheet; dates, durations and
  calendars are covered by the model's tests.
- New public surface: the token kind `Date` and `DateLiteral`; `GANTT_PROFILE`, `GANTT_*`
  constants, `GanttChart`, `GanttTask`, `Element.task`, `FlowDiagram.gantt` and `CivilTime`; the
  calendar functions of `@meltemi/diagrams-model`; `LayoutOptions.today`, `LayoutResult.gantt`
  and the scene role `axis`; the edit operations `setTaskSchedule`, `setTaskStatus`, `createTask`
  and `setCalendar`, `TaskEnd` and `EditRejection.diagnostic`; `ImportOptions.today`; the canvas
  action `schedule`, `CanvasRender.timeline`, `ElementInfo.task` and the field types `date`,
  `duration`, `tasks` and `weekdays`; `mdg export --today`.
- The sketch themes draw bars, diamonds, bands and arrows by hand and keep the `axis` crisp.
- Not done: PlantUML `@startgantt`, Microsoft Project, spreadsheets and issue trackers as sources;
  editable PPTX shapes; resource levelling, costs, assignees, baselines, progress percentages,
  start-to-start or finish-to-finish links and lags; time zones; an icon or a pattern on bars,
  which the language accepts as styles and the layout does not draw yet; and a font, a size or a
  weight of their own for a chart's labels.
- Sizes measured on 2026-10-30, in bytes:

  | File                                                              | Bytes            |
  | ----------------------------------------------------------------- | ---------------- |
  | the Mermaid source `corpus/import/mermaid/gantt-roadmap.mmd`      | 839              |
  | the sheet `mdg import` writes from it                             | 1,088            |
  | `corpus/valid/gantt/roadmap.meltemi` (with its two comment lines) | 1,195            |
  | `corpus/valid/gantt/roadmap.model.json`                           | 25,822           |
  | `corpus/valid/gantt/roadmap.svg` (system fonts), 1200 × 454 units | 12,925           |
  | the same SVG with embedded fonts                                  | 110,085          |
  | `gallery/gantt/launch-plan.meltemi` (source)                      | 1,300            |
  | `gallery/gantt/launch-plan.svg` embedded fonts / system fonts     | 132,899 / 13,033 |
  | the roadmap template's sheet                                      | 1,989            |
  | the roadmap template's SVG, embedded fonts / system fonts         | 130,155 / 12,093 |

  The owner's chart is 29 lines of source for ten tasks, the Mermaid source's 839 bytes becoming
  1,088 in the sheet `mdg import` writes.

- `docs/language/gantt.md`, `grammar-0.2.md`, `diagnostics.md`, `layout.md`, `styles.md`, `motion.md`,
  `stories.md`, `model-json.md`, `formatting.md`, `svg-export.md`, `export.md`, the player, the
  command line, the Mermaid track, the features and compatibility pages, the editor, web app and
  import guides and the skill describe gantt charts in English and Spanish.
