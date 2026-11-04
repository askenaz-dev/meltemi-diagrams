## ADDED Requirements

### Requirement: Gantt charts in JSON
A gantt chart SHALL be serialised with `type` `gantt` and its sections, tasks, milestones and markers
as elements of those kinds, its dependencies as relations with `derived` true. Each element SHALL
carry `task` as its last key: for a task, milestone or marker `{ "from", "after", "end", "status",
"critical", "start", "finish", "workingDays" }`, where `from` is the written date or null, `after` the
written ids, `end` `{ "kind": "for", "amount", "unit" }`, `{ "kind": "to", "date" }`,
`{ "kind": "until", "ids" }` or null, `status` `done`, `active` or null, `start` and `finish` the
resolved instants as ISO text (`2026-06-08T00:00`) or null when unresolved, and `workingDays` a number
or null; null for every other element. Each diagram SHALL carry `gantt` as its last key: for a chart
`{ "axisFormat", "ticks", "weekStart", "axis", "labels", "display", "dependencies", "dayWidth",
"exclude": { "weekdays", "dates" }, "include", "today", "span" }` with defaults applied and `today`
`{ "date" }` (null when not pinned) or null, null for every other diagram. Key order SHALL stay fixed
and `version` stays `0.1`, since the keys are added and no existing one changes; a chart with an error
SHALL be omitted from `diagrams` as every diagram is.

#### Scenario: The owner's roadmap
- **WHEN** `corpus/valid/gantt/roadmap.meltemi` is serialised
- **THEN** tec1 has `task` `{ "from": null, "after": ["tec0"], "end": { "kind": "for", "amount": 10, "unit": "d" }, "status": null, "critical": false, "start": "2026-06-08T00:00", "finish": "2026-06-20T00:00", "workingDays": 10 }`, the diagram's `gantt.exclude.weekdays` is `["saturday", "sunday"]`, and the output matches the stored snapshot

#### Scenario: Other diagrams
- **WHEN** `checkout.meltemi` is serialised
- **THEN** every element has `task` null, the diagram has `gantt` null, and the output is otherwise
  unchanged

#### Scenario: A chart with a loop is not serialised
- **WHEN** a chart with a `gantt.cycle` error is serialised
- **THEN** `ok` is false, the chart is omitted from `diagrams`, and `diagnostics` holds the
  `gantt.cycle` entries
