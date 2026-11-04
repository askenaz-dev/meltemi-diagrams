## ADDED Requirements

### Requirement: Effect properties
`animate <target>[, <target>…] { … }` SHALL accept `effect` (`flow`, `pulse`, `dash`),
`duration` (100 ms to 60 s), `repeat` (`forever` or 1 to 1000), `delay` (0 to 60 s), `direction`
(`forward`, `reverse`), `particles` (1 to 8) and `color` (a quoted colour or a colour token), in
flow, free, sequence and C4 diagrams. Unwritten properties SHALL take the defaults: duration
1200 ms for flow and 1 s otherwise, `repeat forever`, no delay, `forward`, one particle, and the
target's stroke as colour. `direction` SHALL apply to flow and dash, `particles` to flow, `color`
to flow and pulse; elsewhere they SHALL be `prop.invalid-value`. Each `AnimationEntry` SHALL carry
the written values and the JSON model SHALL include them.

#### Scenario: Defaults
- **WHEN** a diagram has `animate pay { effect flow }`
- **THEN** its animation entry has effect `flow` and no other written values, and the motion plan
  uses 1200 ms, forever, no delay, forward and one particle

#### Scenario: Property that does not apply
- **WHEN** a block is `animate api { effect pulse; particles 3 }`
- **THEN** `prop.invalid-value` points at `particles`

### Requirement: Effect targets
`flow` SHALL target relations; `dash` SHALL target relations and elements with an outline; `pulse`
SHALL target elements, relations and named notes and fragments. Any other target SHALL be
`animate.invalid-target` (error) naming what the effect accepts.

#### Scenario: Flow on a box
- **WHEN** a flow diagram has `animate api { effect flow }` where `api` is a node
- **THEN** `animate.invalid-target` says flow particles run along relations

### Requirement: Required effect
An `animate` block without `effect` SHALL be `animate.missing-effect` (error) on the statement.

#### Scenario: No effect
- **WHEN** a block is `animate pay { duration 2s }`
- **THEN** `animate.missing-effect` is reported

### Requirement: Conflicting effects
Each effect drives one channel (particles, dash, halo). Two effects of the same channel on the same
target, in one statement list or several statements, SHALL be `animate.conflict` (error) on the
second, with the first as related information. Effects of different channels on one target SHALL
be accepted.

#### Scenario: Two flows on one relation
- **WHEN** a diagram has `animate pay { effect flow }` and `animate pay, ship { effect flow }`
- **THEN** `animate.conflict` points at `pay` in the second statement

#### Scenario: Flow and dash together
- **WHEN** a diagram has `animate pay { effect flow }` and `animate pay { effect dash }`
- **THEN** there is no diagnostic
