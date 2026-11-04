## ADDED Requirements

### Requirement: Schedule operations
`setTaskSchedule { task, from?, after?, end? }` SHALL rewrite the schedule clauses of a task,
milestone or marker: each field absent keeps the clause, null removes it; `from` is a date text
(written as `at` on milestones and markers), `after` a list of ids, `end` one of `{ for: "<n><unit>" }`,
`{ to: "<date>" }` or `{ until: [ids] }`, replacing whatever end clause is written. Only the
clause's tokens SHALL change: a value is replaced in place, a removed clause is deleted with the
space before it, a new start clause goes after the start clauses written (after the label, or the
id when there is none) and a new end clause after the start clauses; comments, the block and the
status words SHALL be kept. A target
that is not a task, milestone or marker SHALL be refused with `edit.unsafe-target`; a malformed date
or duration, an end on a milestone or marker, or a result with new errors (a loop, an unknown id)
SHALL be refused with `edit.invalid-value` and the model's diagnostic.

#### Scenario: A start beside a dependency
- **WHEN** `setTaskSchedule { task: "tec1", from: "2026-06-15" }` runs on `task tec1 "Prueba" after tec0 for 10d // PoC`
- **THEN** the line becomes `task tec1 "Prueba" after tec0 from 2026-06-15 for 10d // PoC`

#### Scenario: A new duration
- **WHEN** `setTaskSchedule { task: "tec1", end: { for: "12d" } }` runs on the same line
- **THEN** only `10d` becomes `12d`

#### Scenario: Until becomes a duration
- **WHEN** `setTaskSchedule { task: "b", end: { for: "3d" } }` runs on `task b from 2026-06-01 until c`
- **THEN** the line becomes `task b from 2026-06-01 for 3d`

#### Scenario: A loop is refused
- **WHEN** `setTaskSchedule { task: "tec0", after: ["tec2"] }` runs where tec2 follows tec1 and tec1 follows tec0
- **THEN** the plan is refused with `edit.invalid-value` carrying `gantt.cycle`, and the text is unchanged

#### Scenario: Not a task
- **WHEN** `setTaskSchedule { task: "tecnologia", from: "2026-06-01" }` names a section
- **THEN** the plan is refused with `edit.unsafe-target`

### Requirement: Status operations
`setTaskStatus { task, status, critical }` SHALL write the status words of a task or milestone after
its clauses and before its block: `done` or `active` for `status` (null removes it) and `critical`
when true (false removes it), replacing the words written. A marker or a section SHALL be refused
with `edit.unsafe-target`.

#### Scenario: Done and critical
- **WHEN** `setTaskStatus { task: "tec0", status: "done", critical: true }` runs on `task tec0 "Evaluar" from 2026-06-01 for 5d`
- **THEN** the line becomes `task tec0 "Evaluar" from 2026-06-01 for 5d done critical`

#### Scenario: A status on a marker
- **WHEN** `setTaskStatus { task: "freeze", status: "done", critical: false }` names a marker
- **THEN** the plan is refused with `edit.unsafe-target`

### Requirement: Creating tasks, milestones, markers and sections
`createTask { diagram, kind, id?, label?, parent?, index?, from?, after?, end? }` SHALL insert a
`task`, `milestone`, `marker` or `section` statement in the section `parent` (the chart's top level
without one) before the statement at `index` (after the last by default), with the clauses given;
the id SHALL default to the first of `task1`, `milestone1`, `marker1` or `section1` (and so on) that
the file does not use, and a section SHALL be written `section <id> ["Label"] {` and `}`. A parent
that is not a section, a section inside a section, an id in use or a clause word as id, and a
diagram that is not a gantt chart SHALL be refused with `edit.invalid-value`.

#### Scenario: A task after the selection
- **WHEN** `createTask { diagram: "roadmap", kind: "task", parent: "tecnologia", index: 2, after: ["tec1"], end: { for: "1d" } }` runs on the owner's chart
- **THEN** `task task1 after tec1 for 1d` is inserted between tec1 and tec2 with tec1's indentation

#### Scenario: A section after another
- **WHEN** `createTask { diagram: "roadmap", kind: "section", label: "Operación", index: 1 }` runs
- **THEN** `section section1 "Operación" {` and `}` are written between the first and the second
  section, separated by blank lines as the sections around them are

#### Scenario: A section in a section
- **WHEN** `createTask { kind: "section", parent: "tecnologia" }` runs
- **THEN** the plan is refused with `edit.invalid-value`

### Requirement: Calendar operation
`setCalendar { diagram, exclude, include }` SHALL rewrite the chart's `exclude` and `include`
statements to the given lists (weekdays, `weekends`, dates), writing one statement for each that is
not empty after the chart's other statements and before the first section, and deleting them when
empty. An item that is not a weekday, `weekends` or a date SHALL be refused with `edit.invalid-value`.

#### Scenario: Excluding a holiday
- **WHEN** `setCalendar { diagram: "roadmap", exclude: ["weekends", "2026-06-29"], include: [] }` runs
- **THEN** the chart reads `exclude weekends, 2026-06-29` and flu1 ends a working day later

#### Scenario: A word that is no day
- **WHEN** `setCalendar { exclude: ["holidays"] }` runs
- **THEN** the plan is refused with `edit.invalid-value`

### Requirement: Rows between sections
`moveElement { element, parent, index }` SHALL move a task, milestone or marker's statement into the
section `parent` (or the top level) before the statement at `index`, re-indented, keeping its
comments, and SHALL move a section's statement among the sections; the dates SHALL follow from the
new source order. A task moved into a task, a section moved into a section, or an index out of range
SHALL be refused with `edit.invalid-value`.

#### Scenario: A task into another section
- **WHEN** `moveElement { element: "flu0", parent: "tecnologia", index: 0 }` runs on the owner's chart
- **THEN** flu0's line is the first statement of `tecnologia`, indented as tec0, and gone from its
  section

#### Scenario: A section into a section
- **WHEN** `moveElement { element: "i_d", parent: "tecnologia" }` runs
- **THEN** the plan is refused with `edit.invalid-value`

### Requirement: Removing and renaming in charts
`removeElement` of a task or milestone SHALL remove its statement and its id from every `after` and
`until` list; a task whose last start clause goes, and a task that started by following it in source
order, SHALL get `from` its current start, so that no other date changes; its styles, classes and
animations SHALL be removed as on other profiles. `removeElement` of a section SHALL remove the section
with its statements, keeping every other task's dates the same way. `renameId` SHALL rewrite every
`after` and `until` reference. An id that is not in the chart SHALL be refused with
`edit.unsafe-target`.

#### Scenario: Removing a predecessor
- **WHEN** tec0 is removed from the owner's chart
- **THEN** tec1 reads `task tec1 "Prueba de concepto con el equipo de Arquitectura" from 2026-06-08 for 10d` and every other task keeps its dates

#### Scenario: A rename
- **WHEN** `renameId` renames `sdlc1` to `workshops`
- **THEN** sdlc2 reads `after workshops` and the chart compiles without diagnostics

#### Scenario: Removing what is not there
- **WHEN** `removeElement { element: "tec9" }` runs
- **THEN** the plan is refused with `edit.unsafe-target`
