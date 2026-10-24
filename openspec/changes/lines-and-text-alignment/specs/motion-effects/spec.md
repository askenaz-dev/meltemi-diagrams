## MODIFIED Requirements

### Requirement: Effect targets
`flow` and `trace` SHALL target relations and free `line` objects; `dash` SHALL target relations, free lines and elements with an
outline; `pulse` SHALL target elements, relations, free lines and named notes and fragments. A free line SHALL be animated as a relation is: particles, a dash, a glow and a trace along its drawn line, which its scene group carries as `track`; a group with a `track` SHALL be animated as a connector whatever its role. Any other target
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

#### Scenario: Flow on a text
- **WHEN** a free diagram has `animate t { effect flow }` where `t` is a text
- **THEN** `animate.invalid-target` says flow particles run along relations and lines
