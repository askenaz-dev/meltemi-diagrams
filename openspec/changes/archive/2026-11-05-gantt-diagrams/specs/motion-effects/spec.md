## MODIFIED Requirements

### Requirement: Effect targets
`flow` and `trace` SHALL target relations, free `line` objects and pens, and in gantt charts tasks and milestones with dependencies; `dash` SHALL target relations, free lines, pens and elements with an
outline (gantt tasks, milestones, markers and sections among them); `pulse` SHALL target elements, relations, free lines, pens and named notes and fragments. A free line or a pen SHALL be animated as a relation is: particles, a dash, a glow and a trace along its drawn path, which its scene group carries as `track`; a group with a `track` SHALL be animated as a connector whatever its role. A `flow` or `trace` on a gantt task or milestone SHALL run along each of its incoming dependency arrows, whose relation groups carry their routes as `track`. Any other target, a gantt task or milestone without dependencies included,
SHALL be `animate.invalid-target` (error) naming what the effect accepts.

#### Scenario: Flow on a box
- **WHEN** a flow diagram has `animate api { effect flow }` where `api` is a node
- **THEN** `animate.invalid-target` says flow particles run along relations

#### Scenario: Trace on a box
- **WHEN** a flow diagram has `animate api { effect trace }` where `api` is a node
- **THEN** `animate.invalid-target` says a trace runs along relations

#### Scenario: Flow on a line
- **WHEN** a free diagram has `line l from (0, 0) to (300, 0)` and `animate l { effect flow }`
- **THEN** no diagnostic is reported, and the motion plan holds a flow effect for `l` with a track of two points and the frame at 600 ms draws a particle on it

#### Scenario: Dash and pulse on a line
- **WHEN** a free diagram has `animate l { effect dash }` and `animate l { effect pulse }` on a line
- **THEN** no diagnostic is reported, the dash animates the line's stroke and the pulse glows along its track

#### Scenario: Trace on a pen
- **WHEN** a free diagram has `pen p [(0, 0), (40, 10), (80, 0)]` and `animate p { effect trace; repeat 1 }`
- **THEN** no diagnostic is reported, the motion plan holds a trace for `p` along its track, and the frame at 40 % of its cycle (a trace grows over the first 80 %) highlights the first half of the smoothed path

#### Scenario: Flow on a text
- **WHEN** a free diagram has `animate t { effect flow }` where `t` is a text
- **THEN** `animate.invalid-target` says flow particles run along relations, lines and pens

#### Scenario: Flow into a gantt task
- **WHEN** the owner's chart has `animate flu3 { effect flow }`
- **THEN** no diagnostic is reported and the motion plan holds a flow effect along the arrow from flu2 to flu3

#### Scenario: Pulse on a milestone
- **WHEN** a gantt chart has `animate beta { effect pulse }` where `beta` is a milestone
- **THEN** no diagnostic is reported and the pulse glows around the diamond's bounds

#### Scenario: Trace on a task without dependencies
- **WHEN** the owner's chart has `animate tec0 { effect trace }`
- **THEN** `animate.invalid-target` says tec0 has no dependency arrows to trace
