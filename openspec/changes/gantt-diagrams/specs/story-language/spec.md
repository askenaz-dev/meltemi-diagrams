## MODIFIED Requirements

### Requirement: Scenes and actions
A scene SHALL be `scene <id> ["Title"] { … }` with unique ids per story. It MAY start with
`view <diagram>` and `transition cut|fade|morph [over <time>]`. Actions SHALL be `reveal`, `hide`,
`highlight`, `focus` and `camera` with comma-separated targets (`focus all` and `camera all`
clear), `trace <relation>` (in a gantt chart also `trace <task>`, the chain of dependencies that drives the task), `draw <target>[, <target>…]` (pens, free lines and named relations, drawn from their first point to their last and left drawn, and gantt tasks, whose bars grow from their start to their end), each with an optional `over <time>`, `hold <time>`, and `parallel { …
}` holding actions. Targets SHALL be element ids, named relation ids and named note and fragment
ids of the scene's view (entity paths in C4 views; in gantt charts sections, tasks, milestones and markers); unknown ones SHALL be `ref.unknown-element` with
close ids as hints. `trace` on anything but a relation or a gantt task or milestone with dependencies SHALL be `story.invalid-target`, and so SHALL `draw` on anything but a pen, a free line, a named relation or a gantt task. Times SHALL use `ms` or `s` from 0 to 10 minutes; a
scene without actions SHALL be `story.empty-scene` (warning).

#### Scenario: Trace on a box
- **WHEN** a scene has `trace api` where `api` is a node
- **THEN** `story.invalid-target` says trace follows a relation

#### Scenario: Draw the strokes of a whiteboard
- **WHEN** a scene of a story for a free diagram has `draw title, arrow over 2s` where both are pens
- **THEN** it compiles without diagnostics and the timeline holds a `draw` action of 2000 ms with the two targets in order

#### Scenario: Draw on a box
- **WHEN** a scene has `draw api` where `api` is a box
- **THEN** `story.invalid-target` says draw takes pens, lines and relations

#### Scenario: A plan told section by section
- **WHEN** a story for the owner's chart has `reveal tecnologia` and `draw tec0, tec1, tec2 over 3s`
- **THEN** it compiles without diagnostics and the timeline holds a `reveal` and a `draw` of 3000 ms with the three tasks in order

#### Scenario: Trace the chain into a task
- **WHEN** a scene has `trace flu3`
- **THEN** it compiles without diagnostics and the action's targets are the arrows flu0 to flu1, flu1 to flu2 and flu2 to flu3, in that order

#### Scenario: Draw on a section
- **WHEN** a scene has `draw tecnologia` where `tecnologia` is a section
- **THEN** `story.invalid-target` says draw takes pens, lines, relations and gantt tasks
