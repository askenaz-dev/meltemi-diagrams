## ADDED Requirements

### Requirement: Gantt canvas
On a gantt chart the canvas SHALL show the palette Task (T), Milestone (M), Marker (V) and the group
button as Section (G), the Relation tool (R) and Connect (C), and SHALL receive `CanvasRender.timeline`
(the left `x`, `start`, `end` and `dayWidth`) and, for each task, milestone and marker,
`ElementInfo.task` (its start and end instants, its clauses and its row). A click on a bar, a
diamond, a marker, a section's title or an arrow SHALL select it, Shift adding to the selection; a
band selection SHALL take the bars and diamonds it touches; Tab and Shift+Tab SHALL go through the
rows in order. The keys SHALL be: T, M, V
and G to create; Left and Right to move the selection's start one day, Shift with them one week;
`]` and `[` to lengthen and shorten the selected tasks one day, Shift with them one week; Alt+Up and
Alt+Down to move the selected rows; Alt+G to put the selected tasks in a new section; Enter and F2 to
edit a label; Shift+F2 to rename; Delete to remove. A read-only canvas SHALL select, show cards and
the dates tooltip, and SHALL show no handle, start no drag and ignore every key that writes.

#### Scenario: The palette of a chart
- **WHEN** the owner's chart is shown on the canvas
- **THEN** the palette shows Task, Milestone, Marker and Section and no box, participant or pen
  tool, and T, M, V and G are announced in their tooltips

#### Scenario: Selecting rows
- **WHEN** a band is drawn across the bars of tec1, tec2 and flu0 and Tab is then pressed
- **THEN** the three are selected, and Tab selects flu1, the row after flu0

#### Scenario: A day later
- **WHEN** tec0 is selected and Right is pressed
- **THEN** tec0's line reads `from 2026-06-02`, one undo step, and tec1 and tec2 move with it

#### Scenario: Read-only
- **WHEN** the canvas is read-only and Right is pressed on tec0, or its bar is dragged
- **THEN** nothing is written and no handle is shown

### Requirement: Dragging bars and their ends
Dragging a bar horizontally SHALL move its start keeping its length; dragging its right end SHALL
move its end; dragging its left end SHALL move its start keeping its end. The canvas SHALL snap to
the smallest of 15 minutes, 1 hour, 1 day and 1 week that is at least 6 screen pixels wide at the
zoom, show a tooltip with the start, the end and the working days in the interface language, and
post `schedule { task, start?, end? }` at the release, which the session SHALL plan as
`setTaskSchedule`: the start as `from` (removed when it equals the end of the task's dependencies,
so a bar dragged onto its predecessor's end sticks to it), the end as `for` in working days (weeks
when the clause was in weeks and the length is whole weeks; hours or minutes when the snap is under
a day), as the `to` date when the task has one, and replacing `until`, the status line saying so. A
milestone or marker SHALL move as a bar without ends, writing `at`. The live preview SHALL show the
successors, arrows and axis at their new places while dragging. An end dragged before its start
SHALL stop one snap after the start; Escape SHALL cancel with nothing written.

#### Scenario: Moving a dependent bar later
- **WHEN** tec1's bar is dragged one week to the right
- **THEN** tec1 reads `after tec0 from 2026-06-15 for 10d`, tec2 moves to 2026-06-29, and the arrow
  from tec0 still ends at tec1's start

#### Scenario: Back onto the predecessor
- **WHEN** that bar is dragged back to the left past tec0's end
- **THEN** it stops at 2026-06-08 and tec1 reads `after tec0 for 10d`

#### Scenario: Stretching a bar
- **WHEN** tec0's right end (the end of Friday 5 June) is dragged to the end of Tuesday 9 June under
  `exclude weekends`
- **THEN** tec0 reads `for 7d` and the tooltip said "1 Jun → 9 Jun · 7 working days" while dragging

#### Scenario: Ending before the start
- **WHEN** tec2's right end is dragged left past its start
- **THEN** the bar stays one day long and, at the release, nothing changes since `for 1d` is written

### Requirement: Rows and sections on the canvas
Dragging a bar vertically SHALL show an insertion bar between rows and, at the release, post `move`
with the section and index under the pointer, planned as `moveElement { parent, index }`; dragging a
section's title in the column SHALL move the section. The first 6 pixels of a drag SHALL decide
whether it moves time or rows. Alt+Up and Alt+Down SHALL move the selected rows one place, into the
neighbouring section at a section's edge. A drop that is not between rows SHALL write nothing.

#### Scenario: A task into another section
- **WHEN** flu0's bar is dragged down onto the gap between sdlc0 and sdlc1
- **THEN** flu0's statement is between sdlc0 and sdlc1 inside `i_d`, its dates unchanged

#### Scenario: Alt+Up at a section's top
- **WHEN** flu0 is selected and Alt+Up is pressed
- **THEN** flu0's statement becomes the last of `tecnologia`

#### Scenario: Dropped outside the rows
- **WHEN** a bar is dragged vertically and released over the axis
- **THEN** nothing is written and the bar returns to its row

### Requirement: Dependencies on the canvas
A hovered or selected bar SHALL show a connect handle at its right end; dragging it onto another bar
or diamond SHALL post `connect { from, to }`, which the session SHALL plan as adding `from` to the
target's `after` list; the Relation tool and Connect SHALL do the same with two clicks. A connection
that would close a loop, or that is already written, SHALL write nothing, flash the target in
`danger` and say why in the status line. Selecting an arrow and pressing Delete SHALL remove the
predecessor from the successor's `after` list and, when it was its last start clause, write `from`
its current start.

#### Scenario: Linking two tasks
- **WHEN** tec2's handle is dragged onto flu3's bar
- **THEN** flu3 reads `after flu2, tec2 for 10d`

#### Scenario: A loop
- **WHEN** tec2's handle is dragged onto tec0's bar
- **THEN** nothing is written, tec0 flashes and the status line says tec0 already leads to tec2

#### Scenario: Removing an arrow
- **WHEN** the arrow from sdlc1 to sdlc2 is selected and Delete is pressed
- **THEN** sdlc2 reads `from 2026-08-10 for 15d` and keeps its dates

### Requirement: Creating on the canvas
T SHALL add a task after the selected task or milestone with `after <selected> for 1d`, at the end of
the last section when nothing is selected (`after` the last task, or `from` the host's day in an empty
chart); M a milestone `after` the selection; V a marker `at` the date under the pointer, or the
selection's start; G a section after the selected task's section; each with the inline editor open on
its label. With T armed, a drag on the timeline SHALL draw a bar and write a task `from` the press
`for` the dragged length in the section and at the row under the press. The new statement SHALL be
written in one undo step; creating on a chart with errors SHALL be refused as other edits are.

#### Scenario: A task after tec1
- **WHEN** tec1 is selected and T is pressed, then "Informe" is typed and Enter pressed
- **THEN** `task task1 "Informe" after tec1 for 1d` is written after tec1 and selected

#### Scenario: Drawing a task
- **WHEN** T is armed and the pointer drags from 3 August to 7 August on the row of sdlc1
- **THEN** a task `from 2026-08-03 for 5d` is written before sdlc1 in `i_d` with its editor open

#### Scenario: A chart with a loop
- **WHEN** the chart has a `gantt.cycle` error and T is pressed
- **THEN** nothing is written and the status line says the chart has errors

### Requirement: Gantt inspector
For a task the inspector SHALL show a Schedule group: Start date (field type `date`, with the time
when the chart uses times), After (field type `tasks`, chips of the chart's tasks and milestones),
End (`for`, `to`, `until` or none), Duration (field type `duration`, a number and a unit), End date,
Until, Status (planned, active, done), Critical, and read-only lines with the resolved start, end and
working days; then the id, label, description, classes, link, URL and the style strip (fill, stroke,
colour, line, width, pattern, radius). Milestones and markers SHALL show what applies to them. For the
chart it SHALL show Axis format (quick choices `%d %b`, `%b %Y`, `%Y-%m-%d`, `%H:%M`), Ticks, Week
start, Axis, Labels, Display, Dependencies, Day width (auto or a number), Excluded days (field type
`weekdays`: seven toggles with Weekends as a quick choice, and the dates), Included dates and Today
(off, today or a date). Each field SHALL write through the gantt operations; a value the model refuses
SHALL be shown refused under the field with the diagnostic's message and nothing written.

#### Scenario: Two weeks
- **WHEN** tec1's Duration is set to 2 and its unit to `w`
- **THEN** tec1 reads `for 2w` and its read-only end says 19 June 2026

#### Scenario: Excluding Fridays
- **WHEN** the chart's Excluded days toggles Friday on
- **THEN** the chart reads `exclude weekends, friday` (or `exclude friday, saturday, sunday` when
  Weekends was off) and every bar is redrawn

#### Scenario: A date that does not exist
- **WHEN** `2026-02-30` is typed into an End date field that accepts free text
- **THEN** the field shows the refusal "February 2026 has 28 days" and nothing is written

### Requirement: Gantt language services
In a gantt chart, completion SHALL offer the chart statements, `section`, `task`, `milestone` and
`marker` at the top level and in sections; the clause and status words after a label; the tasks and
milestones (never sections or markers) after `after` and `until`; the units after a duration's number;
`weekends` and the weekdays after `exclude` and `weekStart`; the directives inside `axisFormat`. Hover
SHALL show a task's dates, working days and dependencies, a date's weekday and whether it is excluded,
and a duration's resulting end. Quick fixes SHALL write `from` the host's day for `gantt.unscheduled`,
`after a` on `b` for `gantt.relation`, the next working day for `gantt.excluded-day`, and remove the
reference for `gantt.cycle`. The outline SHALL list sections with their tasks, milestones and markers.
The VS Code grammar SHALL scope `gantt`, the statements, the clause and status words and date
literals.

#### Scenario: Completing a predecessor
- **WHEN** the caret is after `task tec3 "Demo" after ` in the owner's chart
- **THEN** completion offers tec0 … sdlc2 and no section id

#### Scenario: A relation fixed
- **WHEN** the quick fix of `gantt.relation` runs on `tec2 -> flu3`
- **THEN** the relation statement is removed and flu3 reads `after flu2, tec2 for 10d`

#### Scenario: Hover on a weekend date
- **WHEN** the pointer rests on `2026-06-06` in a chart with `exclude weekends`
- **THEN** hover says Saturday, excluded
