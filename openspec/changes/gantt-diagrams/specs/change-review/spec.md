## ADDED Requirements

### Requirement: Gantt schedules in differences
`diffDocuments` SHALL report, for a task, milestone or marker of a gantt chart, changes of its
written start, dependencies, end, status and `critical`, and changes of its resolved start or end
with both dates, also when only a predecessor or the calendar changed ("moved by tec0"); changes of
the chart's calendar, axis and view statements SHALL be reported as diagram properties. A chart that
does not compile in one of the versions SHALL be compared by its written clauses only, with no
resolved dates.

#### Scenario: A longer predecessor
- **WHEN** tec0's `for 5d` becomes `for 7d` in the owner's chart
- **THEN** the changes are tec0's end (`for 5d` → `for 7d`, 2026-06-05 → 2026-06-09) and tec1 and
  tec2 starting and ending two working days later, each "moved by tec0"

#### Scenario: A holiday
- **WHEN** `exclude weekends` becomes `exclude weekends, 2026-06-29`
- **THEN** the chart's `exclude` is reported changed and flu1, flu2 and flu3 are reported moved by the
  calendar

#### Scenario: A version with a loop
- **WHEN** the new version has a `gantt.cycle` error
- **THEN** the written changes are reported and no resolved date is reported for that version
