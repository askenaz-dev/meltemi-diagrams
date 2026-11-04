## Context

**How a diagram type is compiled today.** `DIAGRAM_TYPES` is `flow, sequence, c4, free`
(`packages/model/src/schema.ts:203`); each built-in type has a `ProfileSchema` (`:583-605`) with
its diagram properties, element kinds, block properties, statements, rule kinds and events, and
`PROFILES` and `profileOf` list the four (`:811-823`). `compile` claims the block's id, then sends
a declared type to the free profile, `flow`, `free` and `sequence` to their analyzers and `c4` to
the views pass, and reports `profile.unknown` with the list of types otherwise
(`packages/model/src/compile.ts:109-147`). The sequence analyzer is a subclass of the flow one
(`class SequenceAnalyzer extends FlowAnalyzer`, `packages/model/src/sequence.ts:150`;
`FlowAnalyzer`, `packages/model/src/flow.ts:236`) that keeps participants as `Element`s, messages
as `Relation`s and adds ordered events to the shared `FlowDiagram` (`events`, `eventsByKey`,
`scenarios`, `packages/model/src/types.ts:594-599`; `c4` beside them at `:602`). Declared types
refuse the words of the language as names (`RESERVED_WORDS`, `packages/model/src/diagram-types.ts:80-105`,
which spreads `DIAGRAM_TYPES`). Relations without an id are keyed `<from>-><to>#<n>`
(`flow.ts:1548-1551`; `types.ts:236-238`) and can be `derived` (C4 views). The model JSON writes
one shape for every diagram (`FlowDiagramJson`, `packages/model/src/json.ts:184-216`, `type` at
`:186`). Effects check their targets in `animationTargetFits` (`flow.ts:2451-2484`: `flow` and
`trace` need a connector, a relation, a free line or a pen), stories in `storyTargetKind` and
`drawTargetKind` (`packages/model/src/story.ts:542-565`).

**What the language reads.** Tokens are identifiers, strings, numbers with an optional unit,
arrows, punctuation and line breaks (`packages/language/src/tokens.ts:3-25`). A number is digits,
an optional decimal part and an identifier suffix taken as its unit, so `5d`, `2w`, `30min` and
`1.5h` already lex as numbers with units (`packages/language/src/lexer.ts:279-297`); a `-` before
a digit starts a number (`:176-201`), so `2026-06-01` is `2026`, `-06`, `-01`. Statements are
`<word> <args> [{ … }]`, with commas between arguments skipped (`packages/language/src/parser.ts:799-812`)
and arguments that are refs, strings, numbers, tuples or lists (`:814-841`). The formatter has no
type-specific rule but the `pen` lists (`packages/language/src/format.ts:43-46`).

**How a type with its own layout is drawn.** `layoutDrawing` resolves the theme, the type scale
and the text metrics, then returns `layoutSequence(...)` for sequence diagrams before anything of
the flow pipeline (`packages/layout/src/layout.ts:1202-1204`; `packages/layout/src/sequence.ts:99`),
which emits scene groups by role (`element` for heads, `lifeline`, `relation` with a `track` for
messages, `event` with `bounds` for notes and fragments; `SceneRole`,
`packages/layout/src/scene.ts:4-5`; `GroupItem`, `:129-163`), sizes the canvas with `canvasSize`
(`layout.ts:3282-3332`) and the frame with `brandFrame` (`packages/layout/src/frame.ts:46`), and
returns `LayoutResult` maps (`boxes`, `connectors`, `labels`, `events`, `shapes`, `radii`;
`layout.ts:185-253`). `layoutDiagram` then runs the label audit on every profile (`:880-976`).
Words drawn into a picture come from `drawingWords(locale)` in the content language
(`packages/layout/src/messages/index.ts:21-23`; `LayoutOptions.locale`, `layout.ts:178-182`). The
renderer has no per-type code (`packages/render/src/svg.ts:320-419`); sketch themes repaint the
roles in `SKETCHED` (`packages/render/src/sketch.ts:30-38`). Motion finds groups by role and id
(`planMotion`, `packages/motion/src/plan.ts:120-167`), stories fade `element`, `relation` and
`event` groups and draw `draw` and `trace` targets on the dash channel
(`packages/motion/src/story.ts:254-281`), and the player shows cards for `element`, `relation`
and `lifeline` groups (`packages/player/src/stage.ts:48-49`; `detailsOf`,
`packages/player/src/document.ts:86-120`).

**How the canvas edits a type.** The canvas knows the profile from `CanvasRender.profile`
(`packages/editor/src/canvas/protocol.ts:34`, filled with `diagram.type`); the palette is a table
with a `profile` per entry (`PALETTE`, `packages/canvas/src/app.ts:500-522`), the New diagram menu
and the empty-file buttons list `CREATABLE` (`:483-491`; the edit package's `CREATABLE_DIAGRAMS`,
`packages/edit/src/diagrams.ts:11`), and `[data-not-profile]` hides a button for one profile
(`:5446-5448`). Drags are a `Drag` union (`:285-418`); a sequence head drag is a plain `move`
that the session turns into `setSpacing` or `reorderParticipant` (`packages/editor/src/session.ts:1782-1794`),
and the live preview is off for sequence (`previewAction`, `app.ts:4076-4080`). `connect` becomes
`createRelation` (`session.ts:2104-2128`; `packages/edit/src/create.ts:239-282`), `remove` lists
dependents (`session.ts:2130-2177`; `removeElement`, `packages/edit/src/plan.ts:973-1174`), and
`moveElement { parent, index }` moves a declaration to a position (`packages/edit/src/types.ts:474-489`,
decision 0064). The keymap binds letters per profile (`packages/editor/src/canvas/keyboard.ts:138-224`;
sequence at `:199-209`; C, R, G, L, U and K on every profile). Inspector fields have the types
`id | text | multiline | number | enum | color | icon | classes | ports`
(`protocol.ts:351-352`). Motion tokens are `--mdg-motion-fast` 120 ms, `--mdg-motion` 160 ms,
`--mdg-motion-slow` 220 ms, `--mdg-ease` and `--mdg-pop-scale`, zeroed under reduced motion
(`packages/canvas/canvas.css:17-45`).

**How Mermaid is imported.** `detectFormat` knows `gantt` only to refuse it (`MERMAID_SUPPORTED`
and `MERMAID_UNSUPPORTED`, `packages/import/src/detect.ts:19-61`, `gantt` at `:41`);
`importMermaid` reads front matter and `%%{init}%%`, refuses unsupported keywords with
`import.unsupported-diagram` and routes the rest through a `switch` whose `default` is C4
(`packages/import/src/mermaid/index.ts:36-174`). Front-ends share `splitStatements` (`%%` comments
kept for the next statement, `common.ts:40-90`), `cleanLabel` (`:143-174`), the id map
(`sanitizeId`, `slugId`, `IdMap` with `import.renamed-id`, `packages/import/src/ids.ts:16-123`) and
the reporter (`mapped`, `approximated`, `dropped` as `import.unsupported-construct`, `syntax`;
`packages/import/src/report.ts:96-250`); the writer prints one sheet type per diagram
(`packages/import/src/writer.ts:217`, `printSheet` at `:524-541`), `import.ts` compiles the result
as a self-check (`packages/import/src/import.ts:168-181`), and `mergeImport` keeps manual
adjustments, replacing `layout`, `routing`, `theme`, `preset`, `canvas` and `layers` with the
existing ones (`packages/import/src/merge.ts:34`). Coverage tables are data
(`MERMAID_COVERAGE`, `packages/import/src/coverage.ts:226-680`, the unsupported rows at `:269-271`;
Spanish cells in `coverage-es.ts`) and `pnpm import:docs` writes `docs/import/mermaid.md` and its
Spanish copy, which a test compares (`packages/import/test/import.test.ts:164-197`). The import
corpus snapshots each `corpus/import/mermaid/*.mmd` as `.meltemi` and `.report.json`
(`packages/import/test/corpus.test.ts:96-119`), and merge cases live in `corpus/import/merge/<name>/`.

**The owner's source.** Three sections, ten tasks, ids, dates, `after` chains, durations in days,
`dateFormat YYYY-MM-DD`, `axisFormat %d %b`, `excludes weekends`, labels with accents, `+`,
parentheses and a final period. Mermaid dates it as follows (its `fixTaskDates` pushes a task's end
past excluded days, so a successor starts on the next working day): tec0 1–5 June 2026, tec1 8–19
June, tec2 22 June, flu0 15–17 June, flu1 18 June–1 July, flu2 2–15 July, flu3 16–29 July,
sdlc0 1 July–11 August, sdlc1 3–7 August, sdlc2 10–28 August.

**Siblings.** `sequence-wrap-tags-and-activation` is proposed at the same time and reserves
decision 0065; it binds T on sequence and adds `tags` to elements in the model JSON. `playground-sea`
owns the playground's empty canvas. `delivery` owns releases. The changelog's open section is 1.11.0
(`CHANGELOG.md:7`).

## Goals / Non-Goals

**Goals:**

- A roadmap or project plan is a `.meltemi` sheet: sections, tasks, milestones and markers whose
  dates follow from a start, dependencies and durations in working days, validated with precise
  diagnostics, drawn deterministically, exported and animated like every other diagram.
- The owner's Mermaid roadmap, and any Mermaid gantt, imports in one command with the dates Mermaid
  draws, and every construct Mermaid documents is mapped, approximated or dropped with a finding.
- On the canvas a plan is edited the way people edit plans: drag a bar, stretch it, link two bars,
  and see the successors move, with every gesture written as a minimal change of a clause.
- English and Spanish in every word the change adds: diagnostics, drawing words, interface,
  documentation, coverage tables and the skill.

**Non-Goals:**

- Resource levelling, costs, assignees, baselines, progress percentages, start-to-start or
  finish-to-finish links and lags: a dependency is "starts after", as in Mermaid; `from` beside
  `after` is the only constraint.
- Time zones and daylight saving: dates are civil, the same on every machine.
- Importing other gantt sources (the proposal's Non-goals).

## Decisions

### D1. A profile of its own, compiled into the shared model

`gantt` joins `DIAGRAM_TYPES` with a `GANTT_PROFILE`; `analyzeGanttDiagram` (a `GanttAnalyzer`
extending `FlowAnalyzer`, as `SequenceAnalyzer` does) compiles it into the shared `FlowDiagram`:
tasks, milestones and markers are `Element`s of the kinds `task`, `milestone` and `marker`, sections
are elements of kind `section` that hold them (`groupPath` as groups do), each `after` reference
is a `derived` relation from the predecessor to the task keyed `<pred>-><task>#<n>`, and
`FlowDiagram.gantt` holds the chart's settings and calendar. `Element.task` holds the written
schedule and the resolved one. Selection, styles, classes, rules, links, URLs, labels, renames,
the inspector's plumbing, effects, stories and the JSON keep working because a task is an element.

- *A declared type on the free profile (decision 0030)*: declared kinds are boxes placed by the
  engine; nothing would compute dates, and the registry has no statements with clauses.
- *A free composition that the importer fills with computed places*: the dates would be lost, and a
  change of one duration would mean moving ten boxes by hand.
- *A separate `GanttChart` structure beside `FlowDiagram`*: every consumer (canvas, inspector,
  stories, player, diff, merge) would need a second code path for selection and styles.
- *Relations written as `a -> b` for dependencies*: two ways of saying "after", and an arrow in the
  text whose direction readers confuse with the timeline's.

**Recommendation:** the profile, as sequence diagrams did (decision 0019).

### D2. Dates are literals of the language

The lexer reads four digits, `-`, two digits, `-`, two digits, optionally followed by `T`, two
digits, `:`, two digits and optionally `:` and two digits, with no space, as one token of kind
`Date`; the parser takes it as an argument (`DateLiteral { token, text }`), the formatter prints it
as written, and the model checks that it exists (`2026-02-30` is `prop.invalid-value`: "February
2026 has 28 days"). The time is civil: no zone, no daylight saving, the same instant on every
machine; internally an instant is the count of seconds since `1970-01-01T00:00` of the proleptic
Gregorian calendar, computed with integer arithmetic (`packages/model/src/calendar.ts`). Anything
else that starts with digits keeps lexing as today, so `(2026-06)`, `2026-6-1` and `20260601` are
numbers and the model reports them where a date is expected ("write dates as 2026-06-01").

- *Quoted dates (`from "2026-06-01"`)*: no lexer change, but a date and a label would look alike,
  completion and the grammar could not colour them, and Mermaid users write them bare.
- *A `dateFormat` statement as in Mermaid*: `01-06-2026` would mean June or January depending on a
  line elsewhere in the file; the importer converts every Mermaid format to ISO 8601 instead.
- *Joining the three number tokens in the model*: the formatter and every edit would see three
  arguments, and `2026 -06 -01` would be the same date.

**Recommendation:** the `Date` token.

### D3. Four statements, clauses and status words on one line

```text
section <id> ["Label"] { … }
task <id> ["Label"] [from <date>] [after <id>[, <id>…]] [for <duration> | to <date> | until <id>[, <id>…]] [done | active] [critical] [{ … }]
milestone <id> ["Label"] [at <date>] [after <id>[, <id>…]] [done | active] [critical] [{ … }]
marker <id> ["Label"] (at <date> | after <id>[, <id>…]) [{ … }]
```

Clauses may come in any order after the label; a statement is read word by word: a clause word
takes its value (a date, a duration or ids up to the next clause or status word), a status word
stands alone, a block ends it. Sections hold tasks, milestones and markers, not sections; tasks,
milestones and markers may also stand at the diagram's top level, before or between sections. The
block of a task, milestone or marker takes `description`, `class`, `link` and `url`; a section's
block takes those properties too besides its statements. One line per task reads like Mermaid's and
like a plan, and a gesture on the canvas changes one clause.

- *Properties in the block (`task a "A" { start 2026-06-01; duration 5d; status done }`)*: four
  lines per task, three times the file for the owner's chart, and nothing to read at a glance.
- *Mermaid's metadata after a colon (`"A": done, a, 2026-06-01, 5d`)*: positional, and `a`,
  `after a` and `5d` would be told apart by their shape only.
- *`group` instead of `section`*: the language's word for containers, but every gantt tool and
  Mermaid say section, and the owner did too (open question 1).

**Recommendation:** the four statements with clauses; `critical` rather than Mermaid's `crit`.

### D4. Ids, labels and the words a chart reserves

Every statement has an id (the canvas materialises `task1`, `milestone1`, `marker1`, `section1`);
the label defaults to the id. Inside a gantt chart, `from`, `after`, `for`, `to`, `until`, `at`,
`done`, `active` and `critical` cannot be ids (`prop.invalid-value`, with the hint to rename), so a
reference list ends unambiguously at the next clause word. `after` and `until` name tasks and
milestones; a section or a marker there is `prop.invalid-value` ("`after` names tasks and
milestones; `tec` is a section"); an unknown id is `ref.unknown-element` with the close ids as
candidates. References are recorded with the role `dependency`, so `renameId` rewrites them and
removing a task finds them. `gantt`, `task`, `milestone`, `marker` and `section` join
`RESERVED_WORDS`.

### D5. The schedule rules

- **Start.** `from <date>` alone starts there; `after a, b` starts at the latest end of `a` and `b`;
  both start at the later of the two (so `from` is "not before" beside `after`, which is what a drag
  writes, D14). Without either, a task or milestone starts where the previous task or milestone in
  source order ends, across sections, as in Mermaid; without a previous one, the task is
  `gantt.unscheduled` (error, with a quick fix writing `from` today). A start that falls on excluded
  time moves to the next working instant.
- **End.** `for <duration>` adds working time (D6); `to <date>` ends at the end of that day,
  inclusive (`from 2026-06-01 to 2026-06-05` is five days), and `to <date>T<time>` at that instant;
  `until a, b` ends at the earliest start of `a` and `b`. Without an end a task lasts one day (`1d`),
  the default the owner prefers to an error. A milestone and a marker are instants and take no end.
- **Checks.** Dependencies are resolved in topological order; a loop through `after` or `until` is
  `gantt.cycle` on every reference of the loop, with the others as related spans, and the tasks of
  the loop have no dates; an end before the start (`to` earlier than the start, `until` a task that
  starts first) is `gantt.schedule` (error); a written `from`, `at` or `to` on excluded time is
  `gantt.excluded-day` (warning: "Saturday 2026-06-06 is excluded; the task starts on Monday
  2026-06-08").
- **Resolved.** Each task gets `start` and `end` instants and `working` seconds; the chart's span is
  the earliest start to the latest end of its tasks, milestones and markers.

- *Mermaid's exclusive end dates*: `to 2026-06-06` for a task that ends on the 5th reads wrong; the
  importer converts (D17).
- *An error for a task without an end*: the canvas always writes one; a hand-written chart with a
  missing `for` is better drawn one day long with hover saying so than not drawn.
- *`from` and `after` as an error*: the drag of a dependent bar would have to break the dependency or
  be refused; "the later of" is MS Project's "start no earlier than".
- *Excluded starts kept (Mermaid draws such a bar from the Saturday)*: a bar over a weekend is a
  picture of work nobody does; the warning makes the move visible.

### D6. Durations, working time and the calendar

Durations are a number (decimals allowed, above 0) with `s`, `min`, `h`, `d` or `w`; `0d` is
`prop.invalid-value` with the hint to write a milestone, an unknown unit lists the five. Without
exclusions, `1d` is 24 hours and `1w` 7 days. With exclusions, durations count working time: an
excluded day contributes nothing, so `5d` from a Monday under `exclude weekends` ends on Friday at
midnight and `2w` is ten working days (a week is `7 − excluded weekdays` working days); `h`, `min`
and `s` count working hours the same way. The calendar is written as chart statements:
`exclude weekends | monday … sunday | <date>[, …]` (repeatable; `weekends` is Saturday and Sunday),
`include <date>[, …]` (a working day despite the exclusions, as Mermaid's `includes`), and
`weekStart monday … sunday` (Monday by default; the first day of weekly ticks). Excluded time inside
a task does not split its bar, as in Mermaid.

- *Months and years as durations*: their length depends on the start, and under exclusions nobody
  agrees whether a month counts working days; the importer converts Mermaid's `M` and `y` to days
  (D17). `mo` and `y` exist as tick intervals only.
- *Mermaid's `m` for minutes*: in a language read by people, `m` is metres or months; `min` is
  unambiguous.
- *Weeks as 7 working days under exclusions (Mermaid's arithmetic)*: `2w` meaning almost three
  calendar weeks surprises everyone; the importer writes Mermaid's weeks as days so the picture is
  kept.
- *Holiday ranges (`exclude 2026-12-24 to 2027-01-01`)*: a list of dates says the same in one
  line per run of days.

### D7. Diagnostics

New codes, in `docs/language/diagnostics.md` under "Language and profiles", English and Spanish:
`gantt.cycle`, `gantt.unscheduled`, `gantt.schedule` and `gantt.relation` (a relation statement
`a -> b` in a chart: "dependencies are written with `after`", with a quick fix that writes `after a`
on `b`) are errors; `gantt.excluded-day` is a warning; `layout.ticks-crowded` (D9) is a layout
warning. Malformed values reuse the language's codes with precise ranges: `prop.invalid-value` for an
impossible date or time, a duration with an unknown unit or not above 0, a clause without its value,
a reserved id, a section or marker in `after`, an unknown `axisFormat` directive, a `ticks` value, a
`dayWidth` out of range, an `exclude` value that is not a weekday, `weekends` or a date; `prop.unknown`
for a word that is not a clause (listing the clauses); `prop.duplicate` for a clause or status written
twice, two end clauses, or `done` with `active`; `ref.unknown-element` for an unknown id; kinds of
other profiles and nested sections are refused as other profiles refuse foreign kinds. Every
message names the form (`task <id> ["Label"] [from <date>] [after <ids>] [for <duration> | to
<date> | until <ids>]`).

### D8. The model, the JSON and the calendar module

`packages/model/src/calendar.ts` (new, pure): `parseDate(text)`, `formatDate(instant, withTime)`,
`weekday(instant)`, `addWorking(instant, seconds, calendar)`, `workingBetween(a, b, calendar)`,
`nextWorking(instant, calendar)`, `endOfDay(instant)`. `packages/model/src/gantt.ts` (new):
`analyzeGanttDiagram(node, id, lines, bag)` and `scheduleGantt(diagram)`. Types:

```ts
type CivilTime = number; // seconds since 1970-01-01T00:00, civil
interface GanttCalendar { excludedWeekdays: number[]; excludedDates: string[]; includedDates: string[]; weekStart: number }
interface GanttTask {
  from: { date: string; range: Range } | null;
  after: { id: string; range: Range }[];
  end: { kind: "for"; amount: number; unit: "s" | "min" | "h" | "d" | "w"; range: Range }
     | { kind: "to"; date: string; range: Range } | { kind: "until"; ids: { id: string; range: Range }[] } | null;
  status: "done" | "active" | null; critical: boolean;
  start: CivilTime | null; end: CivilTime | null; working: number | null; // resolved
}
interface GanttChart { calendar: GanttCalendar; axisFormat: string | null; ticks: string | null; axis: "top" | "bottom" | "both";
  labels: "bar" | "column"; display: "normal" | "compact"; dependencies: "shown" | "hidden";
  dayWidth: number | null; today: { date: string | null; range: Range } | null; span: { start: CivilTime; end: CivilTime } | null }
```

Model JSON adds `task` as the last key of every element (null but for tasks, milestones and
markers) with the written clauses and the resolved `start`, `end` (ISO text) and `workingDays`, and
`gantt` as the last key of every diagram (null but for charts). `version` stays `0.1`: keys are
added, none changes. The diff (`packages/model/src/diff.ts`) compares the clauses, status, critical
and resolved dates, for `review` (the `change-review` delta).

### D9. The time scale, the ticks and the axis format

The span (D5) is extended to whole ticks. The timeline's width is `dayWidth × days` when `dayWidth`
(1 to 100,000 units per day) is written; otherwise it fills the canvas: the `document` preset's
1,200 px, a `slide`'s 1,920 px or the written `canvas` width, minus the section column and the
margins, and 960 units on a `board`, so a chart never warns `layout.too-large` by default. Ticks are
chosen from a ladder (1, 5, 15 and 30 s; 1, 5, 15 and 30 min; 1, 3, 6 and 12 h; 1 and 2 d; 1 and
2 w; 1, 3 and 6 mo; 1, 2, 5 and 10 y): the smallest interval whose spacing holds its widest label
plus 12 units. Weeks begin on `weekStart`, months on the 1st, years on 1 January. `ticks <n><unit>`
(the units of durations plus `mo` and `y`) forces the interval; when its labels would collide, every
n-th is labelled and `layout.ticks-crowded` warns on `ticks`. `axisFormat "<format>"` is a strftime
subset: `%a %A %b %B %d %e %H %I %j %m %M %p %q %S %U %V %w %W %y %Y %%` and the `-` flag
(`%-d`); without it, the format follows the interval (`%H:%M` under a day, `%d %b` up to two weeks,
`%b %Y` for months, `%Y` for years). Month and weekday names come from `drawingWords(locale)`, so a
Spanish project draws `01 jun` and an English one `01 Jun`; an unknown directive is
`prop.invalid-value` listing them. `axis top|bottom|both` (bottom by default) places the labels.

- *d3's automatic ticks (Mermaid)*: Sunday weeks and a dependency on d3's heuristics; the ladder is
  deterministic and testable.
- *A fixed day width*: a five-year plan would be meters wide and a one-day plan a stub.

### D10. Rows, bars, labels and colours

A section column on the left holds each section's title (`groupTitleSize`, `labelWeight`, `ink`,
wrapped at 280 units), its width the widest title plus twice `padding`, at least 120. Each task
and milestone has one row (markers take none): a bar `round(24 × relationLabelSize / 11)`
units tall on a pitch of that plus 8, 8 units of padding above and below each section; sections
alternate a `band` fill across the column and the timeline with a `bandLine` rule between them.
Bars run from the start to the end instant, radius `min(radius, height / 4)`, coloured by status
from the theme: planned `accent`, active `info`, done `muted`; `critical` strokes the bar in
`danger` at width 2 and fills a planned critical bar with `danger`. `style`, `class` and
`rule task|milestone|section|marker` override `fill`, `stroke`, `color`, `width`, `line`, `pattern`,
`radius`, `icon` and `iconColor` (an icon is drawn at the bar's start); `shape`, `rotation`,
`iconPosition`, `labelPosition`, `iconSize`, `routing` and the free-only properties are
`prop.invalid-value` naming gantt charts. The label (`relationLabelSize`, weight 500) sits inside
the bar in `tagText` when it fits with 8 units each side; else 6 units after the bar in `ink` when it
ends inside the timeline; else 6 units before the bar; else after it, widening the chart.
`labels column` puts every task's label in the column under its section's title instead and leaves
the bars bare; `display compact` packs each section's tasks into the fewest rows where neither bars
nor labels overlap, in source order (Mermaid's `displayMode: compact`).

- *Gantt-only theme tokens (`taskDone`, `taskActive`…)*: eight themes times five tokens for colours
  the existing ones already name; a theme that wants other bars writes `rule task { … }`.
- *Mermaid's four cycling section colours*: alternating bands read the same and follow the theme.
- *A label column by default*: wider charts, and the owner's Mermaid picture has labels on bars.

### D11. Milestones, markers, today, excluded days and dependency arrows

A milestone is a diamond of 0.8 × the bar height centred on its instant, filled by the status rule,
its label after it. A marker is a dashed line (4 4, 1.5 units, `ink`) from the top of the rows to the
axis with its label in a `tag` pill above the rows, pills staggered when they would collide; it
takes no row. The today line is `danger`, 2 units, with the drawing word "Today" or "Hoy" above it,
drawn only inside the span. Excluded days are `band` columns at 60 % behind the rows when a day is at
least 2 units wide. A dependency arrow leaves the predecessor's end (a milestone's right vertex) 8
units to the right, goes to the successor's row and enters its start; when the successor starts less
than 16 units after, it goes down to the gap between the rows, back to 8 units before the start and
in: an orthogonal route with the theme's `corners`, `connector` colour, `connectorWidth` and
`arrowhead`, drawn above the bars. `dependencies hidden` draws none; `rule relation { … }` styles
them all.

### D12. Today

`today` draws the line at the day the drawing is made; `today <date>` pins it. Hosts pass the day as
`LayoutOptions.today`: the canvas the host's local date (VS Code's extension host, the playground's
browser), the command line the machine's local date unless `mdg export --today <date>` (and
`validate`, which reports nothing date-dependent, ignores it); tests, the gallery and the acceptance
suite pin it. A chart without `today` has no line.

- *Mermaid's default (a line unless `todayMarker off`)*: every export of every chart would change
  daily, and Git would see a new SVG each morning; the importer writes `today` for Mermaid's default
  so imported charts keep the line (open question 4).
- *Only pinned dates*: the owner would edit the file every morning.
- *An export-profile option `today`*: a fourth place to say it; the CLI flag covers CI.

### D13. Scene groups and what the editors read

`packages/layout/src/gantt.ts` (`layoutGantt(input: GanttInput): LayoutResult`, routed beside
`layoutSequence`) emits: an `axis` group (a new `SceneRole`: the grid, the tick labels, the excluded
days and the today line; not sketched, no pointer events, never faded by stories); a group per section
(role `element`, `bounds` the band) holding its tasks' groups, so revealing a section reveals its rows;
a group per task, milestone and marker (role `element`, `bounds` the bar, the diamond or the line,
`bounds.label` the label's box so the label audit checks what the label overlaps rather than "cut"
against its bar, `href` from `url`); a group per drawn dependency (role `relation`, the relation's
key, `track` the route); the frame through `brandFrame`. `LayoutResult` gains `gantt: { timeline: {
x, start, end, dayWidth }, rows: Map<id, { y, height, section }> }`; `boxes` holds bars, diamonds,
markers and bands, `labels` the task labels, `connectors` the arrows. Sketch themes draw bars,
diamonds, bands and arrows by hand (roles `element` and `relation`) and keep the grid crisp.

### D14. Effects and stories

`pulse` and `dash` take tasks, milestones, markers and sections; `flow` and `trace` take a task or a
milestone with dependencies and run along each of its incoming arrows (the motion plan expands the
target into the arrows' groups); on one without dependencies they are `animate.invalid-target`
("has no dependency arrows"). In stories, `draw <task>[, …]` grows each bar from its start to its end
(a clip on the bar's group, left to right, on the dash channel's clock) and leaves it drawn, and a
task whose first visibility action is `draw` starts hidden; `trace <task>` draws, one after another,
the arrows of the chain that drives the task (from the task, the predecessor with the latest end,
recursively, earliest first), each over a share proportional to its length; `reveal`, `hide`,
`highlight`, `focus` and `camera` take tasks, milestones, markers and sections as elements.

- *A story action per section (`reveal section by rows`)*: `reveal` of the section and `draw` of its
  tasks say it with what exists.
- *`trace` of every transitive predecessor*: on a real plan it lights half the chart; the driving
  chain is the critical path into that task.

### D15. Edit operations

`packages/edit/src/gantt.ts` (new), cases in `plan.ts`:

- `setTaskSchedule { task, from?, after?, end? }`: each field optional (absent keeps, null removes):
  `from` a date text, `after` a list of ids, `end` `{ for: "10d" } | { to: "2026-06-19" } | { until:
  ids }`. Writes, replaces or deletes exactly the clause tokens, keeping the rest of the line; a new
  start clause goes after the start clauses written (after the label when there is none), a new end
  clause after the start clauses.
- `setTaskStatus { task, status: "done" | "active" | null, critical: boolean }`: the words after the
  clauses.
- `createTask { diagram, kind: "task" | "milestone" | "marker" | "section", id?, label?, parent?,
  index?, from?, after?, end? }`: the statement at the index of the section (the end by default),
  `task1`… past the ids in use; a section gets `{` and `}`.
- `setCalendar { diagram, exclude, include }`: rewrites the `exclude` and `include` statements.
- `moveElement { parent, index }` (decision 0064) moves rows between and within sections.
- `removeElement` of a task rewrites each successor that loses its last start clause with `from`
  its current start, so nothing else moves; `edit.has-dependents` is not raised for dependencies.
- `createDiagram { type: "gantt" }` writes `diagram <id>: gantt {` and `}`.

Every edit keeps comments, recompiles and refuses new errors (`verifyNoNewErrors`), as the others do.

### D16. Canvas gestures

`CanvasRender.timeline` (from `LayoutResult.gantt`) lets the canvas turn x into instants; the
session does the calendar arithmetic. A new action `schedule { task, start?, end? }` (instants)
is planned by the session into `setTaskSchedule`: a start becomes `from` (removed when it equals
the dependencies' end, so a bar dragged back onto its predecessor sticks to it), an end becomes
`for` in working days, weeks when the old clause used weeks and the length is whole weeks, hours or
minutes when the snap is under a day, or rewrites `to` when the task has one, and replaces `until`
with `for` (the status line says so). Gestures:

- **Select**: a click on a bar, a diamond, a marker, a section's title or an arrow (hit-tested by
  the scene's roles, as `hit()` does, `app.ts:5601-5636`), Shift to add, a band selection for the
  bars it touches, Tab and Shift+Tab through the rows in order.
- **Drag a bar** horizontally: the start moves, the length stays; **drag its right end**: the end
  moves; **drag its left end**: the start moves and the end stays. Snapping: the smallest of
  15 min, 1 h, 1 d and 1 w at least 6 screen pixels wide at the current zoom. A tooltip at the
  pointer says the dates and the working days in the interface language.
- **Drag a row** vertically: an insertion bar between rows (as lists, decision 0064) and
  `moveElement { parent, index }` at the release, into another section too; a section's title in the
  column drags the whole section. The first 6 pixels decide the axis; Escape cancels.
- **Connect**: a handle at a bar's right end (hover or selection) dragged onto another bar posts
  `connect`, which the session plans as adding the source to the target's `after`; a loop is refused
  with the target flashing `danger` and the status line naming the loop. R and C work as on other
  profiles. **Delete** on a selected arrow removes the id from `after` (and writes `from` if it was
  the last start clause).
- **Create**: T, M, V and G (and the palette) add a task after the selected task with `after
  <selected> for 1d` (at the end of the last section otherwise; `from` the host's day in an empty
  chart), a milestone `after <selected>`, a marker `at` the date under the pointer or the selection's
  start, a section after the selected one; the inline editor opens. With T armed, a drag on the
  timeline draws a bar and writes `from` and `for`.
- **Keys**: Left and Right move the start one day (Shift: a week), `]` and `[` lengthen and shorten
  by a day (Shift: a week), Alt+Up and Alt+Down move the row, Enter and F2 edit the label, Shift+F2
  renames (rewriting references), Delete removes, Alt+G puts the selection in a new section.
- **Read-only**: selection, cards and the tooltip; no handle, no drag, no key that writes.

The live preview runs on gantt (`previewAction` and the session's `preview`): the dragged bar
follows the pointer and the successors, arrows, axis and canvas size come from the preview.

- *Dragging a dependent bar replaces `after` with `from`*: the link would be lost by a nudge.
- *Refusing drags of dependent bars*: the most common gesture of a plan.
- *Dependencies drawn by a relation tool only*: the connect handle is what every gantt tool offers.

### D17. Palette, inspector and language services

The palette on gantt shows Task (T), Milestone (M), Marker (V) and the group button as Section (G);
the New diagram menu and the empty-file buttons add Gantt chart (a bars glyph). The inspector shows,
for a task, a **Schedule** group: Start date (a new field type `date`, a native date input with the
time when the chart uses times), After (`tasks`: chips of the chart's tasks and milestones), End
(`for`, `to`, `until` or default), Duration (`duration`: a number and a unit), End date, Until,
Status (planned, active, done), Critical, and read-only lines with the resolved dates and working
days; then the usual id, label, description, classes, link and URL, and the style strip (fill,
stroke, colour, line, width, pattern, radius). For the chart: Axis format (with quick choices
`%d %b`, `%b %Y`, `%Y-%m-%d`, `%H:%M`), Ticks, Week start, Axis, Labels, Display, Dependencies, Day
width (auto or a number), Excluded days (`weekdays`: seven toggles, Weekends as a quick choice, and
the dates), Included dates, Today (off, today, a date). Language services: completion of the
statements in a chart and a section, of clause and status words after a label, of task ids after
`after` and `until`, of units after a duration's number, of weekdays and `weekends` after
`exclude`, of directives in `axisFormat`; hover on a task (dates, working days, dependencies), a
date (its weekday, "excluded") and a duration (the end it gives); quick fixes for
`gantt.unscheduled`, `gantt.relation`, `gantt.excluded-day` (move to the next working day) and
`gantt.cycle` (remove the reference); the outline lists sections and their tasks; the VS Code
grammar scopes the keywords and dates.

### D18. The Mermaid gantt front-end

`packages/import/src/mermaid/gantt.ts` (a `GanttReader`, routed by a `case "gantt"` before the C4
`default`) and `packages/import/src/mermaid/dates.ts` (dayjs's format tokens; Mermaid's scheduling:
`getStartDate`, `getEndDate`, `fixTaskDates`, inclusive ends, includes, `weekend`). The reader
collects the statements, replays Mermaid's schedule, writes a `GanttSheet`, and after the
self-compile compares each task's dates under Meltemi's rules with Mermaid's, reporting each that
differs once (`import.approximated`, `gantt.schedule`, both dates). Mapping:

| Mermaid | Meltemi | Status |
| --- | --- | --- |
| `title`, `accTitle` | `title` (`accTitle` when no title) | mapped |
| `accDescr` (one line or `{ }`) | `description` | mapped |
| `dateFormat` (every dayjs token) | dates written ISO 8601 | mapped; `Z`, `ZZ` approximated (zone dropped); a format without a day uses the import's day, approximated once |
| `axisFormat` | `axisFormat` (`%c`, `%x`, `%X` expanded) | mapped; `%L`, `%Z` approximated |
| `tickInterval` | `ticks` (`millisecond` → `1s` approximated) | mapped |
| `weekday` | `weekStart` (Mermaid's Sunday written when weekly ticks have none) | mapped |
| `excludes`, `includes`, `weekend` | `exclude`, `include` (`weekend friday` makes `weekends` Friday and Saturday) | mapped |
| `todayMarker` | absent: `today`; `off`: nothing; a style: `today` | mapped; a style approximated (`gantt.todayMarker`) |
| `inclusiveEndDates` | end dates written as they are | mapped |
| `topAxis`, front matter `config.gantt.topAxis` | `axis both` | mapped |
| `config.gantt.displayMode: compact` | `display compact` | mapped; other `config` dropped as today |
| `section` | `section <slug> "Name"` | mapped |
| task ids, missing ids | `sanitizeId`; Mermaid's own `task<n>`; clause words renamed (`import.renamed-id`) | mapped |
| start date, `after a b` | `from`, `after a, b` (unknown ids dropped, `gantt.after` warning) | mapped |
| end date | `to` the previous day (exclusive to inclusive), unless `inclusiveEndDates` or a time | mapped |
| `until a b` | `until a, b` | mapped |
| `ms`, `s`, `m`, `h`, `d` | `s` (rounded up, approximated), `s`, `min`, `h`, `d` | mapped |
| `w` | `w`, or `7n d` under exclusions | mapped |
| `M`, `y` | days of the replayed span | approximated |
| an unreadable duration | no end (one day) | approximated (Mermaid draws nothing) |
| `done`, `active`, `crit` | `done`, `active`, `critical` | mapped |
| `milestone` | `milestone … at` start + duration / 2; `after` kept when the start is a dependency | mapped; a duration after a dependency approximated |
| `vert` | `marker … at` / `after` | mapped |
| `click id href "url"` | `url "…"` in the task's block | mapped |
| `click id call f(args)` | — | dropped (`gantt.click`, warning) |
| `%%` comments | `//` comments | mapped |
| a task starting on an excluded day | the next working day | approximated (`gantt.schedule`) |
| an unreadable line | `// Not imported:` comment | `import.syntax` |

`MERMAID_SUPPORTED` gains `gantt`, `MERMAID_UNSUPPORTED` loses it, `ImportedType` and the writer's
`Sheet` gain the gantt shape, `ImportOptions.today` (the machine's day by default; tests pin it) feeds
the replay, `REPLACING` in `merge.ts` gains the view statements `axisFormat`, `ticks`, `weekStart`,
`axis`, `labels`, `display`, `dependencies` and `dayWidth`, and the coverage tables gain a `gantt`
section in both languages (the generated docs drop the `gantt` row of "Common").

### D19. The owner's chart

`mdg import gantt-sample.mmd` writes, with no finding:

```text
language "0.2"

diagram hoja_de_ruta_genai: gantt {
  title "Hoja de ruta GenAI"
  axisFormat "%d %b"
  exclude weekends
  today

  section tecnologia "Tecnología" {
    task tec0 "Evaluar plataformas de agentes" from 2026-06-01 for 5d
    task tec1 "Prueba de concepto con el equipo de Arquitectura" after tec0 for 10d
    task tec2 "Presentar resultados al comité Arq" after tec1 for 1d
  }

  section nuevo_flujo_genai_hub "Nuevo Flujo GenAI Hub" {
    task flu0 "Propuesta de flujo ágil de evaluación" from 2026-06-15 for 3d
    task flu1 "Interfaz Evaluación y seguimiento (WebComponent)" after flu0 for 10d
    task flu2 "Integración con LeanIX" after flu1 for 10d
    task flu3 "Marcha Blanca primeros casos de uso" after flu2 for 10d
  }

  section i_d "I+D" {
    task sdlc0 "Estándares de desarrollo Agéntico + GenAI for productivity." from 2026-07-01 for 30d
    task sdlc1 "Workshops AI-SDLC" from 2026-08-03 for 5d
    task sdlc2 "Desarrollo de Skills y Agentes (AI-SDLC)." after sdlc1 for 15d
  }
}
```

(after the importer's header comment). It validates with `0 errors, 0 warnings` and resolves to
Mermaid's dates (Context). It draws, on the `document` preset in a Spanish project: the title; a
column with "Tecnología", "Nuevo Flujo GenAI Hub" and "I+D" on alternating bands; a timeline from
Monday 1 June to Monday 31 August 2026 (13 weeks, about 10.7 units a day) with weekly ticks `01 jun`,
`08 jun` … `31 ago` and the weekends shaded; ten `accent` bars with their labels after them, but
sdlc0's, which fits inside its long bar, and sdlc2's, which goes before its bar because the bar
ends at the right edge; six arrows
(tec0 → tec1 → tec2, flu0 → flu1 → flu2 → flu3, sdlc1 → sdlc2); no today line, since 29 October
is outside the span.

### D20. Templates, gallery, corpus, documentation, skill, decision

A `roadmap` template ("Product roadmap" / "Hoja de ruta": a chart in `editorial.light` with three
sections, nine tasks with dependencies, a critical path, a milestone, a marker, `exclude weekends`,
`today`, and a story `plan` that reveals each section and draws its bars, then traces the launch;
`contents({ diagrams: 1, stories: 1 })`), after `sequence` in `TEMPLATES`: eight templates, eight
cards, sixteen thumbnails. `gallery/gantt/launch-plan.meltemi` (pinned `today`, statuses, a
milestone, a marker, a compact section) joins `GALLERY_SHEETS`. `corpus/valid/gantt/{roadmap,
constructs,calendar,times}.meltemi` with model JSON and SVG snapshots; `corpus/invalid/gantt.*`;
`corpus/acceptance/gantt/{chains,long-labels,parallel,sections,thirty}.meltemi` (gantt has no
cycles or nested containers, so its five sheets are named for what a plan stresses); the visual
references re-recorded; `PROFILES` in `packages/acceptance/src/corpus.ts` gains `gantt`.
`corpus/import/mermaid/{gantt-roadmap,gantt-constructs,gantt-times}.mmd` (the first is the owner's
source) and `corpus/import/merge/gantt/`. `docs/language/gantt.md` and its Spanish copy; the grammar,
diagnostics, layout, styles, motion, stories, model JSON and formatting pages; the editor, CLI,
playground, compatibility and features pages; `docs/tracks/from-mermaid.md`; the regenerated import
pages; all with their Spanish copies. The skill's description names gantt charts and roadmaps,
`reference/gantt.md` holds the forms, the schedule rules and the diagnostics, `reference/converting.md`
lists `gantt` among the imported types; `pnpm skills:sync`, `pnpm assist:guide`. The glossary: Gantt
chart → diagrama de Gantt, task → tarea, milestone → hito, marker → marca (the highlighter is already
"marcador"), section → sección, dependency → dependencia, working day → día hábil, excluded day →
día excluido, today → hoy, critical → crítica, done → hecha, active → en curso, timeline → línea de
tiempo. Decision 0066 records D1 to D18 as accepted; the changelog entries go to the open section at
apply time.

### D21. Order with the sibling changes

Independent of `sequence-wrap-tags-and-activation`: its keys are bound on `sequence` only, its
`tags` and this change's `task` are new keys of elements in the model JSON (whichever applies second
puts its key last), and neither modifies a requirement the other modifies. Independent of
`playground-sea`, whose empty canvas shows whatever buttons `CREATABLE` lists. If the sibling
archives first, the MODIFIED blocks here are rebased on the then-current specs before archiving.

### D22. Motion

Every movement uses the canvas's motion tokens and drops to 0 under `prefers-reduced-motion`.

- **The dragged bar** follows the pointer with no transition, snapped; the successors, arrows and
  axis glide to the preview's places over `--mdg-motion` with `--mdg-ease`, so a change in one task
  visibly ripples through the plan.
- **The date tooltip** fades in over `--mdg-motion-fast` 8 px from the pointer and updates in place;
  it fades out at the release.
- **A snap** is shown by the bar's edge settling over `--mdg-motion-fast`; reaching the
  predecessor's end shows a 2 px `guide` tick at the boundary while the bar sticks.
- **The connect handle** fades and scales in from `--mdg-pop-scale` over `--mdg-motion-fast` on hover;
  while connecting, the candidate bar gets the selection ring; a loop flashes the target's outline in
  `danger` twice over `--mdg-motion-slow`.
- **Rows** make room under the insertion bar through the preview; the bar slides between gaps over
  `--mdg-motion-fast`.
- **A new task** pops in from `--mdg-pop-scale` over `--mdg-motion` with its editor; a removed one
  fades over `--mdg-motion-fast` and the rows below close up through the next render's glide.
- **The axis**, when the span changes, cross-fades its tick labels over `--mdg-motion`.
- **Stories** are on the story's clock: `draw` grows bars linearly, `trace` draws arrows one by one.

## Risks / Trade-offs

- [The `Date` token changes the lexer of every file] → it only matches four digits, `-`, two digits,
  `-`, two digits with no spaces, which no existing statement accepts (a tuple of three numbers
  without commas is refused today); the lexer tests and the corpus round trip guard it.
- [Working-day arithmetic is easy to get wrong at boundaries] → `calendar.ts` is pure and tested
  with Mermaid's own schedule of the owner's chart, weekends, includes, hours across a weekend and
  leap years; the importer's comparison reports any task whose dates differ from Mermaid's.
- [`today` makes exports depend on the day] → it is written explicitly, `--today` pins it for CI,
  and every test, gallery and acceptance sheet pins it.
- [A chart of thousands of tasks] → the scheduler is linear in tasks and references; the layout is
  one pass; the 2 Mi character source limit and the 5,000-element and 10,000-relation limits
  (`limit.too-complex`) apply as elsewhere, tasks counting as elements and dependencies as
  relations.
- [The importer's replay of Mermaid drifts from Mermaid] → the replay follows `ganttDb.js`; the
  corpus pins the owner's chart and the constructs sheet with dates read from Mermaid's rendering.
- [Labels beside bars hit the label audit] → the label's box is the group's `bounds.label`, and the
  corpus, templates and gallery are held at zero findings as every profile is.
- [The New diagram menu, templates and profile lists are asserted in many tests] → the tasks name
  each one.

## Open Questions

1. **The section keyword.** `section` (recommended; Mermaid's and every plan's word) or `group`?
   (D3)
2. **Status words.** `done`, `active` and `critical` on the task's line (recommended), or a
   `status` property in the block? (D3)
3. **`to` dates.** Inclusive, the task's last day (recommended), or exclusive as Mermaid's? (D5)
4. **The today line from Mermaid.** Write `today` for Mermaid's default so imported charts keep the
   line (recommended), or write it only when the source styles `todayMarker`? (D12)
5. **Dependency arrows.** Drawn by default with `dependencies hidden` to turn them off
   (recommended; the owner asked for them), or hidden by default as in Mermaid? (D11)
6. **Dragging a dependent bar.** Write `from` beside `after`, "the later of" (recommended), or
   replace `after` with `from`? (D16)
7. **Durations.** `s`, `min`, `h`, `d` and `w`, with months and years converted to days by the
   importer (recommended), or months as durations too? (D6)
8. **The template.** `roadmap` with a story (recommended), or no template and the gallery sheet only?
   (D20)
9. **Keys.** T, M, V and G on gantt, Left/Right to move, `]`/`[` to stretch (recommended), or others?
   (D16)
