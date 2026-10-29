## ADDED Requirements

### Requirement: Gantt charts are laid out without an engine
`layoutDiagram` SHALL lay out a gantt chart with its own deterministic layout, whatever the layout
mode or engine options, from the resolved schedule, the theme, the text metrics, the content locale
and `LayoutOptions.today` (a civil date; the host's day when the chart writes `today` without a
date). The same input SHALL give the same scene on every run. Tasks, milestones and markers without
dates (a loop, an unscheduled task) SHALL not be drawn and SHALL add no layout diagnostic beyond the
model's; a chart with no dated task SHALL draw an empty timeline of the four weeks starting on the
`weekStart` of `today`'s week.

#### Scenario: The same picture twice
- **WHEN** `corpus/valid/gantt/roadmap.meltemi` is laid out twice with `today` 2026-10-29
- **THEN** the two SVGs are identical byte for byte

#### Scenario: A loop is not drawn
- **WHEN** a chart has `a` and `b` in a loop and `c from 2026-06-01 for 1d`
- **THEN** the scene draws `c` only, and the layout adds no diagnostic

#### Scenario: An empty chart
- **WHEN** `diagram plan: gantt { }` is laid out with `today` 2026-10-29
- **THEN** the timeline runs from Monday 2026-10-26 to Monday 2026-11-23 with no row

### Requirement: Time scale and ticks
The timeline SHALL span the chart's span extended to whole ticks. Its width SHALL be `dayWidth ×
days` when `dayWidth` is written; otherwise the width of the preset or canvas (1,200 for
`document`, 1,920 for `slide`, the `canvas` width) minus the section column and the margins, or 960
on `board`. The tick interval SHALL be the smallest of 1, 5, 15 and 30 s; 1, 5, 15 and 30 min; 1,
3, 6 and 12 h; 1 and 2 d; 1 and 2 w; 1, 3 and 6 mo; 1, 2, 5 and 10 y whose spacing holds the widest
tick label plus 12, or `ticks` when written; weeks SHALL begin on `weekStart`, months on the 1st,
years on 1 January. Labels SHALL use `axisFormat`, or `%H:%M` under a day, `%d %b` up to two weeks,
`%b %Y` up to six months and `%Y` beyond, with month and weekday names in the content language,
under the rows (`axis bottom`), above them (`top`) or both. When the labels of a written `ticks`
would collide, every n-th SHALL be labelled and `layout.ticks-crowded` (warning) reported on
`ticks` with n.

#### Scenario: Weekly ticks in Spanish
- **WHEN** the owner's chart (1 June to 28 August 2026, no `dayWidth`, the `document` preset) is
  laid out with the content locale `es`
- **THEN** the timeline runs from 2026-06-01 to 2026-08-31, ticks are weekly on Mondays, labelled
  `01 jun`, `08 jun` … `31 ago`, and no `layout.too-large` is reported

#### Scenario: The same chart in English
- **WHEN** it is laid out with the content locale `en`
- **THEN** the labels read `01 Jun` … `31 Aug`

#### Scenario: A day in hours
- **WHEN** a chart's tasks run from 2026-06-01T09:00 to 2026-06-01T17:00
- **THEN** the ticks are hourly or coarser, labelled with `%H:%M`

#### Scenario: Daily ticks over a year
- **WHEN** a chart spanning a year writes `ticks 1d`
- **THEN** every n-th tick is labelled so that no labels collide and `layout.ticks-crowded` is
  reported on `ticks` naming n

### Requirement: Sections and rows
A column on the left SHALL hold each section's title in the theme's `groupTitleSize` and
`labelWeight`, `ink`, wrapped at 280 units, the column as wide as the widest title plus twice
`padding` and at least 120. Each task and milestone SHALL take one row in source order, bars
`round(24 × relationLabelSize / 11)` tall on a pitch of that plus 8; each section SHALL add 8 above
and below its rows; sections SHALL alternate a `band` fill across the column and the timeline, with
a `bandLine` rule between them. Tasks and milestones outside any section SHALL come first, without a
title. `display compact` SHALL put each task and milestone of a section, in source order, in the
first row of the section where its bar and label overlap nothing, adding a row otherwise. Markers
SHALL take no row.

#### Scenario: Ten rows in three bands
- **WHEN** the owner's chart is laid out with the `technical.light` theme
- **THEN** there are 10 rows of 24-unit bars on a 32-unit pitch, three section bands of which the
  first and the third are filled with `band`, and the column holds "Tecnología", "Nuevo Flujo GenAI
  Hub" and "I+D"

#### Scenario: Compact rows
- **WHEN** a section of three tasks `a` (1–5 June), `b` (8–12 June) and `c` (3–10 June) has
  `display compact` and labels that fit inside their bars
- **THEN** `a` and `b` share the first row and `c` takes the second

#### Scenario: A marker takes no row
- **WHEN** a chart of two tasks also declares a marker
- **THEN** the chart has two rows

### Requirement: Bars and labels
A task SHALL be a bar from its start to its end instant, its corners `min(radius, height / 4)`,
filled and stroked by status from the theme: `accent` (planned), `info` (active) and `muted` (done);
`critical` SHALL stroke it in `danger` at width 2 and fill a planned critical bar with `danger`.
Written `fill`, `stroke`, `color`, `width`, `line`, `pattern`, `radius` and `icon` SHALL override
them, an icon drawn at the bar's start. The label SHALL be drawn in `relationLabelSize` at weight
500: inside the bar in `tagText` when it fits with 8 units on each side; else 6 units after the bar
in `ink` when it ends inside the timeline; else 6 units before the bar; else after it, the chart
growing to hold it. Excluded time SHALL not split a bar. With `labels column`, labels SHALL be drawn
in the column under their section's title and bars SHALL carry none.

#### Scenario: Labels inside, after and before
- **WHEN** the owner's chart is laid out with the `technical.light` theme and the bundled fonts
- **THEN** `sdlc0`'s label is inside its bar in `tagText`, `sdlc2`'s is before its bar, and the
  others are after their bars in `ink`

#### Scenario: Status colours
- **WHEN** a chart has a planned task, an active one, a done one and a planned critical one
- **THEN** their bars are filled `accent`, `info`, `muted` and `danger`, and the critical one is
  stroked `danger` at width 2

#### Scenario: A label column
- **WHEN** the owner's chart writes `labels column`
- **THEN** the column lists each section's title with its tasks' labels under it and no bar holds a
  text

### Requirement: Milestones, markers, today and excluded days
A milestone SHALL be a diamond 0.8 times the bar height, centred on its instant, filled by the
status rule, its label after it. A marker SHALL be a dashed line (4 4, 1.5 units, `ink`) from the
top of the rows to the axis, its label in a `tag` pill above the rows, pills staggered so that none
collide. The today line SHALL be a 2-unit `danger` line with the drawing word "Today" ("Hoy") above
it, drawn only when the day is inside the span; the span SHALL never widen for it. Excluded days
SHALL be drawn as `band` columns at opacity 0.6 behind the rows when a day is at least 2 units wide.

#### Scenario: A milestone after a task
- **WHEN** `milestone beta "Beta" after build` follows a task that ends at 2026-06-19T00:00 and the
  timeline starts 2026-06-01 at 10 units a day
- **THEN** the diamond is centred 180 units into the timeline on its own row

#### Scenario: Today outside the span
- **WHEN** the owner's chart is laid out with `today` 2026-10-29
- **THEN** no today line is drawn and the timeline still ends on 2026-08-31

#### Scenario: Weekends too thin to shade
- **WHEN** a chart spanning three years excludes weekends at under 2 units a day
- **THEN** no excluded-day column is drawn

### Requirement: Dependency arrows
Each dependency SHALL be drawn, unless `dependencies hidden`, as an orthogonal route from the
predecessor's end (a milestone's right vertex) 8 units right, to the successor's row, into its start
(a milestone's left vertex); when the successor starts less than 16 units after that end, the route
SHALL go down to the gap between the two rows, left to 8 units before the successor's start, and into
it. Arrows SHALL use the theme's `connector`, `connectorWidth`, `arrowhead` and `corners`, drawn above
the bars, styled by `rule relation`.

#### Scenario: Six arrows
- **WHEN** the owner's chart is laid out
- **THEN** six arrows are drawn: tec0 to tec1, tec1 to tec2, flu0 to flu1, flu1 to flu2, flu2 to flu3
  and sdlc1 to sdlc2, each ending at its successor's start

#### Scenario: A tight successor
- **WHEN** `b` starts 8 units after `a` ends
- **THEN** the arrow goes down between the rows and back before entering `b`

#### Scenario: Hidden arrows
- **WHEN** the chart writes `dependencies hidden`
- **THEN** no relation group is drawn and the model still holds the derived relations

### Requirement: Scene groups and the layout result
The scene SHALL hold an `axis` group (the grid, the tick labels, the excluded days and the today line;
a new role that sketch themes do not repaint, that takes no pointer events and that stories never
fade); a group per section with role `element` and `bounds` its band, holding its tasks' groups; a
group per task, milestone and marker with role `element`, `bounds` its bar, diamond or line with
`bounds.label` the label's box, and `href` its URL; a group per drawn dependency with role `relation`,
the relation's key and the route as `track`; the frame as on every profile. `LayoutResult` SHALL hold
`gantt` (`timeline` with its left `x`, its `start` and `end` instants and `dayWidth`; `rows` with each
row's `y`, `height` and section), the bars, diamonds, markers and bands in `boxes`, the labels in
`labels` and the arrows in `connectors`. Sketch themes SHALL draw bars, diamonds, bands and arrows by
hand. The label audit SHALL check a task's label against what it overlaps, not against its bar.

#### Scenario: Editors find a bar
- **WHEN** the owner's chart is laid out
- **THEN** `boxes.get("tec1")` is the bar of tec1, `gantt.rows.get("tec1").section` is `tecnologia`,
  and the scene has a `relation` group `tec0->tec1#1` with a `track`

#### Scenario: A sketched chart
- **WHEN** the owner's chart is laid out under `sketch.light`
- **THEN** bars and arrows are drawn in two jittered passes and the grid lines of the `axis` group are
  single straight lines

#### Scenario: No label finding for a label beside its bar
- **WHEN** the owner's chart is laid out
- **THEN** no `layout.label-cut` or `layout.label-overlap` is reported
