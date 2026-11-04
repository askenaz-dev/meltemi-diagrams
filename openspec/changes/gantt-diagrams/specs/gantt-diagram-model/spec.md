## ADDED Requirements

### Requirement: Gantt charts compile
`diagram <id>: gantt { … }` SHALL compile on the `gantt` profile into the shared diagram model:
`section`, `task`, `milestone` and `marker` statements, the chart statements (`title`,
`description`, `theme`, `preset`, `canvas`, `axisFormat`, `ticks`, `weekStart`, `axis`, `labels`,
`display`, `dependencies`, `dayWidth`, `exclude`, `include`, `today`) and the blocks `style`,
`animate`, `class` and `rule`. Sections, tasks, milestones and markers SHALL be elements of the
kinds `section`, `task`, `milestone` and `marker`, a section's statements its children; each id in
an `after` list SHALL be a derived relation from that task to the one that names it, keyed
`<pred>-><task>#<n>`. `section` SHALL hold `task`, `milestone` and `marker` statements and its
block properties, never another `section`; tasks, milestones and markers MAY also stand at the
chart's top level. Element kinds of other profiles, `placement` blocks and nested sections SHALL
be refused with the diagnostics other profiles give foreign statements, naming what a chart holds.

#### Scenario: The owner's roadmap
- **WHEN** `corpus/valid/gantt/roadmap.meltemi` (three sections, ten tasks, six `after`
  references in tec1, tec2, flu1, flu2, flu3 and sdlc2) compiles
- **THEN** there are no diagnostics, the diagram has type `gantt`, 13 elements (3 of kind
  `section`, 10 of kind `task`), 6 derived relations such as `tec0->tec1#1`, and `tec1`'s group
  path is `["tecnologia"]`

#### Scenario: A participant in a chart
- **WHEN** a gantt chart declares `participant api`
- **THEN** `prop.unknown` is reported on `participant` with a hint naming `section`, `task`,
  `milestone` and `marker`

#### Scenario: A placement block
- **WHEN** a gantt chart holds `placement { place a at (0, 0) }`
- **THEN** `prop.unknown` is reported on `placement` and the rest of the chart compiles

#### Scenario: A section in a section
- **WHEN** `section a { section b { } }` is written in a chart
- **THEN** `prop.unknown` is reported on the inner `section`, naming what a section holds

### Requirement: Dates
A gantt chart SHALL take dates written as `Date` literals: `YYYY-MM-DD` (the whole day) or
`YYYY-MM-DDTHH:MM[:SS]` (that instant), in civil time with no zone, the same on every machine. A
literal that names no day of the Gregorian calendar, an hour above 23, a minute or second above 59,
or a number, string or identifier where a date is expected SHALL be `prop.invalid-value` on the
value, saying why and how dates are written. Instants SHALL be compared and added with integer
arithmetic on the civil calendar, leap years included.

#### Scenario: A day and an instant
- **WHEN** a chart has `task a from 2026-06-01 for 2d` and `task b from 2026-06-01T09:30 for 4h`
- **THEN** `a` starts at 2026-06-01T00:00 and ends at 2026-06-03T00:00, and `b` ends at
  2026-06-01T13:30

#### Scenario: A day February does not have
- **WHEN** a task is written `from 2026-02-30`
- **THEN** `prop.invalid-value` is reported on `2026-02-30` saying that February 2026 has 28 days

#### Scenario: A date written as a string
- **WHEN** a task is written `from "2026-06-01"`
- **THEN** `prop.invalid-value` is reported on the string with the hint to write the date without
  quotes, as `2026-06-01`

#### Scenario: A leap day
- **WHEN** a task is written `from 2028-02-28 for 2d` with no exclusions
- **THEN** it ends at 2028-03-01T00:00

### Requirement: Task, milestone and marker statements
`task <id> ["Label"] [from <date>] [after <id>[, <id>…]] [for <duration> | to <date> | until
<id>[, <id>…]] [done | active] [critical] [{ … }]`, `milestone <id> ["Label"] [at <date>] [after
<id>[, <id>…]] [done | active] [critical] [{ … }]` and `marker <id> ["Label"] (at <date> | after
<id>[, <id>…]) [{ … }]` SHALL be read clause by clause after the label, in any order: a clause word
takes its value (a date, a duration, or ids up to the next clause or status word, commas optional),
a status word stands alone. The label SHALL default to the id. The block SHALL take `description`,
`class`, `link` and `url`. A word that is no clause or status of the statement SHALL be
`prop.unknown` listing them; a clause or status written twice, two end clauses or `done` with
`active` SHALL be `prop.duplicate`; a clause without its value, a marker with neither `at` nor
`after`, and an id equal to `from`, `after`, `for`, `to`, `until`, `at`, `done`, `active` or
`critical` SHALL be `prop.invalid-value`. Each statement SHALL be recorded as `Element.task` with
its clauses, their ranges and the resolved schedule.

#### Scenario: Every clause of a task
- **WHEN** a chart has `task build "Build" from 2026-06-01 after design, review for 2w done critical { url "https://example.com/build" }`
- **THEN** `build` has `from` 2026-06-01, `after` `design` and `review`, an end `for 2 w`, status
  `done`, `critical` true and the URL

#### Scenario: Two end clauses
- **WHEN** a task is written `task a from 2026-06-01 for 5d to 2026-06-09`
- **THEN** `prop.duplicate` is reported on `to`, naming `for` as the end already written

#### Scenario: A word that is not a clause
- **WHEN** a task is written `task a starts 2026-06-01`
- **THEN** `prop.unknown` is reported on `starts`, listing `from`, `after`, `for`, `to`, `until`,
  `done`, `active` and `critical`

#### Scenario: A reserved id
- **WHEN** a chart declares `task for "Forecast" from 2026-06-01`
- **THEN** `prop.invalid-value` is reported on `for` with the hint that clause words cannot be ids

#### Scenario: A marker without a date
- **WHEN** a chart declares `marker freeze "Code freeze"`
- **THEN** `prop.invalid-value` is reported on `freeze`, saying a marker needs `at <date>` or
  `after <ids>`

### Requirement: Durations
A duration SHALL be a number above 0, decimals allowed, with the unit `s`, `min`, `h`, `d` or
`w`. Without exclusions `1d` SHALL be 24 hours and `1w` 7 days. With exclusions a duration SHALL
count working time (see "Calendar"): `d` 24 working hours, `w` the working days of a week. `0d`,
a negative number, a number without a unit or with another unit SHALL be `prop.invalid-value`,
listing the units (and, for a zero, the hint to write a milestone).

#### Scenario: Hours and minutes
- **WHEN** a task is written `from 2026-06-01T09:00 for 1.5h` with no exclusions
- **THEN** it ends at 2026-06-01T10:30

#### Scenario: An unknown unit
- **WHEN** a task is written `for 5days`
- **THEN** `prop.invalid-value` is reported on `5days`, listing `s`, `min`, `h`, `d` and `w`

#### Scenario: A zero duration
- **WHEN** a task is written `for 0d`
- **THEN** `prop.invalid-value` is reported on `0d` with the hint to declare a `milestone`

### Requirement: Calendar
`exclude <item>[, <item>…]` SHALL exclude `weekends` (Saturday and Sunday), weekdays (`monday` to
`sunday`) and dates; several `exclude` statements SHALL add up. `include <date>[, …]` SHALL make
dates working days despite the exclusions. `weekStart monday … sunday` SHALL set the first day of
weekly ticks (Monday by default). With exclusions, working time SHALL skip excluded days whole: a
duration in `d` or `w` ends after that many working days (a week counting `7 − excluded weekdays`
days), and `h`, `min` and `s` count working hours. An item that is not `weekends`, a weekday or a
date SHALL be `prop.invalid-value` listing what `exclude` takes; a date in `include` that no
exclusion covers SHALL be `prop.invalid-value` saying it is already a working day.

#### Scenario: Ten working days
- **WHEN** a chart with `exclude weekends` has `task a from 2026-06-08 for 10d`
- **THEN** `a` ends at 2026-06-20T00:00 (the end of Friday 19 June) with 10 working days

#### Scenario: Two weeks of working days
- **WHEN** a chart with `exclude weekends` has `task a from 2026-06-01 for 2w`
- **THEN** `a` ends at 2026-06-13T00:00 (the end of Friday 12 June)

#### Scenario: A holiday and an included Saturday
- **WHEN** a chart has `exclude weekends, 2026-06-03` and `include 2026-06-06` and `task a from 2026-06-01 for 5d`
- **THEN** `a` covers 1, 2, 4, 5 and 6 June and ends at 2026-06-07T00:00

#### Scenario: Hours across a weekend
- **WHEN** a chart with `exclude weekends` has `task a from 2026-06-05T18:00 for 12h`
- **THEN** `a` ends at 2026-06-08T06:00

#### Scenario: Not a day to exclude
- **WHEN** a chart has `exclude holidays`
- **THEN** `prop.invalid-value` is reported on `holidays`, listing `weekends`, the weekdays and
  dates

### Requirement: Schedule
Tasks and milestones SHALL be scheduled in dependency order. A start SHALL be `from` alone, the
latest end of the `after` tasks alone, or the later of both; without either, the end of the
previous task or milestone in source order (across sections); a start on excluded time SHALL move
to the next working instant. A task's end SHALL be its start plus the `for` duration, the end of
the `to` day (inclusive) or the `to` instant, or the earliest start of the `until` tasks; without
an end clause a task SHALL last `1d`. A milestone SHALL be an instant (its start); a marker SHALL be
at its `at` date or the latest end of its `after` tasks. The first task or milestone with no start
and no previous one SHALL be `gantt.unscheduled` (error); an end before the start SHALL be
`gantt.schedule` (error); a written `from`, `at` or `to` on an excluded day SHALL be
`gantt.excluded-day` (warning) naming the day it moves to. The chart's span SHALL run from the
earliest start to the latest end of its tasks, milestones and markers.

#### Scenario: Following the previous task
- **WHEN** a chart has `task a from 2026-06-01 for 2d` then, in another section, `task b for 1d`
- **THEN** `b` starts at 2026-06-03T00:00

#### Scenario: The later of from and after
- **WHEN** `a` ends at 2026-06-05T00:00 and `task b from 2026-06-10 after a for 1d` is written
- **THEN** `b` starts at 2026-06-10T00:00; with `from 2026-06-02` it starts at 2026-06-05T00:00

#### Scenario: An inclusive end date
- **WHEN** a task is written `from 2026-06-01 to 2026-06-05`
- **THEN** it ends at 2026-06-06T00:00

#### Scenario: Until another task
- **WHEN** `c` starts at 2026-06-10T00:00 and `task b from 2026-06-01 until c` is written
- **THEN** `b` ends at 2026-06-10T00:00

#### Scenario: No end
- **WHEN** a task is written `task a from 2026-06-01`
- **THEN** it ends at 2026-06-02T00:00 and no diagnostic is reported

#### Scenario: Nothing to follow
- **WHEN** the first task of a chart is `task a "Kick-off" for 2d`
- **THEN** `gantt.unscheduled` is reported on `a` with the hint to write `from <date>`

#### Scenario: Ending before the start
- **WHEN** a task is written `from 2026-06-10 to 2026-06-05`
- **THEN** `gantt.schedule` is reported on `to` with both dates

#### Scenario: A start on Saturday
- **WHEN** a chart with `exclude weekends` has `task a from 2026-06-06 for 1d`
- **THEN** `gantt.excluded-day` (warning) says Saturday 2026-06-06 is excluded and the task starts
  on Monday 2026-06-08, and `a` covers 8 June

### Requirement: Dependencies
`after` and `until` SHALL name tasks and milestones of the chart, recorded as references with the
role `dependency`, so renames rewrite them and removals find them. An unknown id SHALL be
`ref.unknown-element` with the close ids as candidates; a section or a marker SHALL be
`prop.invalid-value` saying what the clause names; a loop through `after` and `until` SHALL be
`gantt.cycle` (error) on every reference of the loop, the others given as related spans, and the
tasks of the loop SHALL have no dates. A relation statement (`a -> b`) in a chart SHALL be
`gantt.relation` (error) with the hint to write `after a` on `b`.

#### Scenario: Two predecessors
- **WHEN** `a` ends at 2026-06-05T00:00, `b` at 2026-06-09T00:00, and `task c after a, b for 1d`
- **THEN** `c` starts at 2026-06-09T00:00 and the derived relations `a->c#1` and `b->c#1` exist

#### Scenario: A loop
- **WHEN** a chart has `task a after b for 1d` and `task b after a for 1d`
- **THEN** `gantt.cycle` is reported on the `b` of `a`'s clause and on the `a` of `b`'s, each
  naming the other as related, and neither task has dates

#### Scenario: An unknown task
- **WHEN** a task is written `after desing`
- **THEN** `ref.unknown-element` is reported on `desing` with `design` among the candidates

#### Scenario: A section as a predecessor
- **WHEN** a task is written `after tecnologia` where `tecnologia` is a section
- **THEN** `prop.invalid-value` says `after` names tasks and milestones and `tecnologia` is a section

#### Scenario: A relation statement
- **WHEN** a chart holds `a -> b`
- **THEN** `gantt.relation` is reported on the statement with the hint to write `after a` on `b`

### Requirement: Chart properties
A chart SHALL take `axisFormat "<format>"` (the directives `%a %A %b %B %d %e %H %I %j %m %M %p %q
%S %U %V %w %W %y %Y %%`, each optionally with the `-` flag), `ticks <n><unit>` (`s`, `min`, `h`,
`d`, `w`, `mo`, `y`), `axis top|bottom|both` (bottom), `labels bar|column` (bar),
`display normal|compact` (normal), `dependencies shown|hidden` (shown), `dayWidth <n>` (1 to
100,000), and `today [<date>]`, besides `title`, `description`, `theme`, `preset` and `canvas`. An
unknown directive, a `ticks` value of another form, a value outside its list or range, and a second
`today` SHALL be reported (`prop.invalid-value`, `prop.duplicate`) on the value with what is
accepted.

#### Scenario: The owner's settings
- **WHEN** a chart has `axisFormat "%d %b"`, `exclude weekends` and `today`
- **THEN** the chart's `gantt` holds the format, Saturday and Sunday as excluded weekdays and a
  today line without a pinned date

#### Scenario: An unknown directive
- **WHEN** a chart has `axisFormat "%d %Q"`
- **THEN** `prop.invalid-value` is reported on the string, naming `%Q` and listing the directives

#### Scenario: Ticks without a unit
- **WHEN** a chart has `ticks 7`
- **THEN** `prop.invalid-value` is reported on `7`, listing the tick units

### Requirement: Styles, links and effects in charts
Style blocks, classes and rules (`rule task`, `rule milestone`, `rule marker`, `rule section`,
`rule relation`) SHALL apply to tasks, milestones, markers, sections and dependency arrows with
`fill`, `stroke`, `color`, `width`, `line`, `pattern`, `radius`, `icon` and `iconColor` (and
`arrowhead`, `arrowtail` and `corners` on relations); `shape`, `rotation`, `iconPosition`,
`labelPosition`, `iconSize`, `routing` and the free-only properties SHALL be `prop.invalid-value`
naming gantt charts. `link` and `url` SHALL work as on elements of other profiles. `animate`
SHALL take the properties, defaults and limits of the other profiles; its targets SHALL follow
"Effect targets".

#### Scenario: A critical rule
- **WHEN** a chart has `rule task { radius 2 }` and `style launch { fill warning }`
- **THEN** both compile and `launch` resolves `fill` to `@warning` and `radius` 2

#### Scenario: A shape on a task
- **WHEN** a chart has `style a { shape ellipse }` where `a` is a task
- **THEN** `prop.invalid-value` is reported on `shape`, naming gantt charts
