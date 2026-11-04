## MODIFIED Requirements

### Requirement: Effect properties
`animate <target>[, <target>…] { … }` SHALL accept `effect` (`flow`, `pulse`, `dash`),
`duration` (100 ms to 60 s), `repeat` (`forever` or 1 to 1000), `delay` (0 to 60 s), `direction`
(`forward`, `reverse`), `particles` (1 to 8) and `color` (a quoted colour or a colour token), in
flow, free, sequence and C4 diagrams. Unwritten properties SHALL take the defaults: for the
duration, the effective theme's `flowDuration`, `dashDuration` or `pulseDuration` when the theme
writes it, else 1200 ms for flow and 1 s otherwise; `repeat forever`, no delay, `forward`, one
particle, and the target's stroke as colour. Every motion plan SHALL take the durations of the
theme the diagram was laid out with, so that the canvas preview, the animated SVG, the players
and the videos plan the same motion.
`direction` SHALL apply to flow and dash, `particles` to flow, `color` to flow and pulse;
elsewhere they SHALL be `prop.invalid-value`. Each `AnimationEntry` SHALL carry the written values
and the JSON model SHALL include them.

#### Scenario: Defaults
- **WHEN** a diagram has `animate pay { effect flow }`
- **THEN** its animation entry has effect `flow` and no other written values, and the motion plan
  uses 1200 ms, forever, no delay, forward and one particle

#### Scenario: Theme default
- **WHEN** the diagram's theme writes `flowDuration 800ms` and the diagram has `animate pay { effect flow }`
- **THEN** the motion plan uses 800 ms for `pay`, and an effect that writes `duration 2s` still uses 2 s

#### Scenario: Property that does not apply
- **WHEN** a block is `animate api { effect pulse; particles 3 }`
- **THEN** `prop.invalid-value` points at `particles`
