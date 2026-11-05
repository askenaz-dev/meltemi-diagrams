# Gantt charts

Use `diagram <id>: gantt { }` for a plan or a roadmap: tasks scheduled on a time axis from dates,
dependencies and durations, in sections. Dates and `after` place everything: never write `place`,
`size`, `route`, `layout` or relations (`a -> b`) here, and never compute a date by hand.

## Statements

```text
section <id> ["Label"] { … }
task <id> ["Label"] [from <date>] [after <id>[, <id>…]] [for <duration> | to <date> | until <id>[, <id>…]] [done | active] [critical] [{ … }]
milestone <id> ["Label"] [at <date>] [after <id>[, <id>…]] [done | active] [critical] [{ … }]
marker <id> ["Label"] (at <date> | after <id>[, <id>…]) [{ … }]
```

A section holds tasks, milestones and markers, never another section; they may also stand at the top
level. Every statement has an id, unique in the chart; the label defaults to the id. The clauses
come after the label, in any order; a block takes `description "…"`, `class a, b`, `link d.e` and
`url "…"`. `from`, `after`, `for`, `to`, `until`, `at`, `done`, `active` and `critical` cannot be
ids. Statuses: planned (neither word), `active`, `done`; `critical` marks the critical path.

## Dates, durations and the calendar

```text
2026-06-01             // a whole day, unquoted; 2026-06-01T09:30 is an instant (civil time, no zone)
for 10d                // a number above 0 and s, min, h, d or w: for 1.5h, for 2w, for 30min
exclude weekends       // also weekdays and dates: exclude friday, 2026-12-25 (several statements add up)
include 2026-06-06     // a working day despite the exclusions
weekStart sunday       // first day of weekly ticks (monday by default)
```

With exclusions, `d` and `w` count working days (a week is `7 − excluded weekdays` days) and `h`, `min`
and `s` count the hours of working days. Months and years are not durations: write the days.

## The schedule

- A task with `from` and no `after` starts there; with `after a, b` it starts when the later of them
  ends; with both, at the later of the two (`from` is "not before").
- A task or milestone with neither follows the previous task or milestone of the file, across
  sections. The first one needs `from <date>` or `at <date>`.
- A start on an excluded day moves to the next working day (a written date warns).
- `for 5d` adds working time; `to 2026-06-05` is the last day, inclusive; `until a, b` ends when the
  first of them starts. Without an end clause a task lasts one day. A milestone is its start.
- `after` and `until` name tasks and milestones, never sections or markers. Dependencies are `after`,
  never `a -> b`.

```text
task design "Design" from 2026-06-01 for 5d
task build "Build" after design for 10d
task docs "Docs" after design from 2026-06-15      // not before 15 June, nor before design ends
milestone beta "Beta" after build
marker freeze "Code freeze" at 2026-07-01
```

## Chart settings

```text
title "Roadmap"
axisFormat "%d %b"     // strftime subset: %a %A %b %B %d %e %H %I %j %m %M %p %q %S %U %V %w %W %y %Y %%
ticks 1w               // optional: a whole number and s, min, h, d, w, mo or y; the axis chooses otherwise
axis bottom            // top | bottom | both
labels bar             // bar | column (task labels in the section column)
display normal         // normal | compact (tasks packed into the fewest rows)
dependencies shown     // shown | hidden
dayWidth 12            // units a day is wide, 1 to 100000; without it the chart fills its canvas
today                  // a line at the day the picture is made; today 2026-06-17 pins it
```

`today` draws only when the day is inside the chart's span. For a picture that does not change with
the day (CI, a committed SVG), write `today <date>` or export with
`pnpm mdg export plan.meltemi --today 2026-07-15`.

## Styles, effects and stories

```text
rule task { radius 2 }           // task, milestone, marker, section and relation (the arrows)
style beta { fill warning }      // fill, stroke, width, line, color; a task also radius
animate build { effect flow }    // flow and trace need a task or milestone that follows others
animate beta { effect pulse }    // pulse and dash take tasks, milestones, markers and sections
```

`shape`, `rotation`, `iconPosition`, `labelPosition`, `iconSize`, `routing`, `font`, `fontSize` and
`fontWeight` are refused in charts.
In a story, `reveal`, `hide`, `highlight`, `focus` and `camera` take sections, tasks, milestones and
markers; `draw a, b` grows task bars from their start; `trace live` lights the arrows of the chain
that drives a task or milestone that follows others.

## Diagnostics

| Code                   | Fix                                                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gantt.unscheduled`    | the first task or milestone has no start: write `from <date>` (`at <date>`)                                                                          |
| `gantt.schedule`       | a task ends before it starts: check `to` or `until`, or write `for <duration>`                                                                       |
| `gantt.cycle`          | `after` and `until` loop: remove one reference of the loop                                                                                           |
| `gantt.relation`       | `a -> b` in a chart: write `after a` on `b`                                                                                                          |
| `gantt.excluded-day`   | (warning) a written date falls on an excluded day: move it, or make it work with `include`                                                           |
| `prop.invalid-value`   | `2026-02-30`, a unit other than `s min h d w`, `0d`, an id that is a clause word, a section in `after`, an unknown `axisFormat` directive, `ticks 7` |
| `prop.unknown`         | a statement of another profile, a section in a section, a word that is no clause: the hint lists them                                                |
| `prop.duplicate`       | two end clauses, a clause twice, `done` with `active`, a marker with `at` and `after`, a second `today`                                              |
| `ref.unknown-element`  | `after` or `until` names no task or milestone: fix the id (the hint suggests close ones)                                                             |
| `layout.ticks-crowded` | (warning) a written `ticks` is too fine: write a longer interval or widen with `dayWidth`                                                            |

A loop or an unscheduled task has no dates and is not drawn: fix the error first.

## Converting

`pnpm mdg import plan.mmd` converts a Mermaid `gantt` and writes the dates Mermaid draws: exclusive
end dates become inclusive `to`, `1w` under excluded weekdays becomes `7d`, months and years become
days, `crit`, `done` and `active` become `critical`, `done` and `active`, the `milestone` and `vert`
tags become a `milestone` and a `marker`, `click … href` becomes `url`, and a chart with no
`todayMarker` writes `today`. A task whose dates Meltemi resolves differently is reported once with
both dates. With `--merge`, a second import keeps the chart's `axisFormat`, `ticks`, `weekStart`,
`axis`, `labels`, `display`, `dependencies`, `dayWidth` and styles, and takes the schedule from the
source. PlantUML `@startgantt` is not imported.
