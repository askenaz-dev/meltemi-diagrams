## MODIFIED Requirements

### Requirement: Effect properties
`animate <target>[, <target>…] { … }` SHALL accept `effect` (`flow`, `pulse`, `dash`, `trace`),
`duration` (100 ms to 60 s), `repeat` (`forever` or 1 to 1000), `delay` (0 to 60 s), `direction`
(`forward`, `reverse`), `particles` (1 to 8) and `color` (a quoted colour or a colour token), in
flow, free, sequence and C4 diagrams. Unwritten properties SHALL take the defaults: for the
duration, the effective theme's `flowDuration`, `dashDuration`, `pulseDuration` or
`traceDuration` when the theme writes it, else 1200 ms for flow, 1500 ms for trace and 1 s
otherwise; `repeat forever`, no delay, `forward`, one particle, and as colour the target's stroke,
or the theme's accent for a trace. Every motion plan SHALL take the durations of the theme the
diagram was laid out with, so that the canvas preview, the animated SVG, the players and the
videos plan the same motion.
`direction` SHALL apply to flow, dash and trace, `particles` to flow, `color` to flow, pulse and
trace; elsewhere they SHALL be `prop.invalid-value`. Each `AnimationEntry` SHALL carry the written
values and the JSON model SHALL include them.

#### Scenario: Defaults
- **WHEN** a diagram has `animate pay { effect flow }`
- **THEN** its animation entry has effect `flow` and no other written values, and the motion plan
  uses 1200 ms, forever, no delay, forward and one particle

#### Scenario: Theme default
- **WHEN** the diagram's theme writes `flowDuration 800ms` and the diagram has `animate pay { effect flow }`
- **THEN** the motion plan uses 800 ms for `pay`, and an effect that writes `duration 2s` still uses 2 s

#### Scenario: Trace defaults
- **WHEN** a diagram whose theme's accent is `#1D4ED8` has `animate pay { effect trace }`
- **THEN** the motion plan uses 1500 ms, forever, forward and the colour `#1D4ED8`

#### Scenario: Property that does not apply
- **WHEN** a block is `animate api { effect pulse; particles 3 }`
- **THEN** `prop.invalid-value` points at `particles`

### Requirement: Effect targets
`flow` and `trace` SHALL target relations; `dash` SHALL target relations and elements with an
outline; `pulse` SHALL target elements, relations and named notes and fragments. Any other target
SHALL be `animate.invalid-target` (error) naming what the effect accepts.

#### Scenario: Flow on a box
- **WHEN** a flow diagram has `animate api { effect flow }` where `api` is a node
- **THEN** `animate.invalid-target` says flow particles run along relations

#### Scenario: Trace on a box
- **WHEN** a flow diagram has `animate api { effect trace }` where `api` is a node
- **THEN** `animate.invalid-target` says a trace runs along relations

### Requirement: Conflicting effects
Each effect drives one channel (particles, dash, halo, trace). Two effects of the same channel on
the same target, in one statement list or several statements, SHALL be `animate.conflict` (error)
on the second, with the first as related information. Effects of different channels on one target
SHALL be accepted.

#### Scenario: Two flows on one relation
- **WHEN** a diagram has `animate pay { effect flow }` and `animate pay, ship { effect flow }`
- **THEN** `animate.conflict` points at `pay` in the second statement

#### Scenario: Flow and dash together
- **WHEN** a diagram has `animate pay { effect flow }` and `animate pay { effect dash }`
- **THEN** there is no diagnostic

#### Scenario: Trace and pulse together
- **WHEN** a diagram has `animate pay { effect trace }` and `animate pay { effect pulse }`
- **THEN** there is no diagnostic
