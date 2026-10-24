# motion-effects Specification

## Purpose
The `animate` language: effects, properties with defaults, valid targets and one effect per channel, with their diagnostics.
## Requirements
### Requirement: Effect properties
`animate <target>[, <target>…] { … }` SHALL accept `effect` (`flow`, `pulse`, `dash`, `trace`),
`duration` (100 ms to 60 s), `repeat` (`forever` or 1 to 1000), `delay` (0 to 60 s), `direction`
(`forward`, `reverse`), `particles` (1 to 8) and `color` (a quoted colour or a colour token), in
flow, free, sequence and C4 diagrams. Unwritten properties SHALL take the defaults: for the
duration, the effective theme's `flowDuration`, `dashDuration`, `pulseDuration` or
`traceDuration` when the theme writes it, else 1200 ms for flow, 1500 ms for trace and 1 s
otherwise; `repeat forever`, no delay, `forward`, one particle, and as colour the theme's accent
for flow, pulse and trace, and the target's stroke for dash. Flow particles SHALL be drawn with a
radius of `max(4, 1.5 × width)` scene units on a line of `width`, inside their relation's group
under its label, the same in the CSS and the frame profiles. Every motion plan SHALL take the durations of the theme the diagram was laid out
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

#### Scenario: Particles pass under the label
- **WHEN** `a -> b: "Pay" as r` has `animate r { effect flow }`
- **THEN** in the frame at 600 ms and in the animated SVG the particle is an item of the relation's group placed before its label

#### Scenario: Written colour wins
- **WHEN** a diagram has `animate pay { effect flow; color danger }`
- **THEN** the particles take the theme's `danger` colour, not the accent

#### Scenario: Property that does not apply
- **WHEN** a block is `animate api { effect pulse; particles 3 }`
- **THEN** `prop.invalid-value` points at `particles`

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

### Requirement: Required effect
An `animate` block without `effect` SHALL be `animate.missing-effect` (error) on the statement.

#### Scenario: No effect
- **WHEN** a block is `animate pay { duration 2s }`
- **THEN** `animate.missing-effect` is reported

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

