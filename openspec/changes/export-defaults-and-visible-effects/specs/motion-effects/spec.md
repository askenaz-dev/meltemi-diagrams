## MODIFIED Requirements

### Requirement: Effect properties
`animate <target>[, <target>…] { … }` SHALL accept `effect` (`flow`, `pulse`, `dash`, `trace`),
`duration` (100 ms to 60 s), `repeat` (`forever` or 1 to 1000), `delay` (0 to 60 s), `direction`
(`forward`, `reverse`), `particles` (1 to 8) and `color` (a quoted colour or a colour token), in
flow, free, sequence and C4 diagrams. Unwritten properties SHALL take the defaults: for the
duration, the effective theme's `flowDuration`, `dashDuration`, `pulseDuration` or
`traceDuration` when the theme writes it, else 1200 ms for flow, 1500 ms for trace and 1 s
otherwise; `repeat forever`, no delay, `forward`, one particle, and as colour the theme's accent
for flow, pulse and trace, and the target's stroke for dash. Flow particles SHALL be drawn with a
radius of `max(4, 1.5 × width)` scene units on a line of `width`, the same in the CSS and the
frame profiles. Every motion plan SHALL take the durations of the theme the diagram was laid out
with, so that the canvas preview, the animated SVG, the players and the videos plan the same
motion.
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

#### Scenario: Particles and halos in the accent
- **WHEN** a diagram under `technical.light` has `animate pay { effect flow }` on a relation stroked `#526579` and `animate api { effect pulse }` on a node stroked `#DCE5ED`
- **THEN** the motion plan colours both effects with the theme's accent, the particle's radius is 4 for a line 1.3 wide, and the animated SVG and the frame at 300 ms draw them with that colour and radius

#### Scenario: Written colour wins
- **WHEN** a diagram has `animate pay { effect flow; color danger }`
- **THEN** the particles take the theme's `danger` colour, not the accent

#### Scenario: Property that does not apply
- **WHEN** a block is `animate api { effect pulse; particles 3 }`
- **THEN** `prop.invalid-value` points at `particles`
