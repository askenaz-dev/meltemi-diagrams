## ADDED Requirements

### Requirement: Motion plan
`@meltemi/diagrams-motion` SHALL export `planMotion(diagram, scene)`, which keeps the effects whose
targets are drawn in the scene, with defaults applied and colours resolved, and
`motionDuration(plan)`, the largest `delay + repeat × duration`, or `null` when an effect repeats
forever. Relation groups of the scene SHALL carry their drawn `track` and element and event groups
their `bounds`, in scene coordinates, for flow, free, sequence and C4 diagrams.

#### Scenario: Finite length
- **WHEN** a diagram has `animate a { effect pulse; duration 1s; repeat 2; delay 500ms }`
- **THEN** `motionDuration` is 2500

### Requirement: Scene at time t
`sceneAt(scene, plan, t)` SHALL return the scene at `t` milliseconds: before an effect's delay and
after its last cycle the target is drawn as without effects; in between the phase is
`((t − delay) mod duration) / duration`, linear. Flow SHALL place `particles` circles at fractions
`(phase + i/particles) mod 1` of the track's length (from the end when reversed); dash SHALL draw
the line or outline with a dash of 8, a gap of 6 and offset `−14 × phase` (positive when
reversed); pulse SHALL add a halo scaled `1 + 0.15 × phase` with opacity `0.7 × (1 − phase)` for
elements and events, or the track `width + 6` wide with opacity `0.5 × (1 − phase)` for relations.
No effect SHALL move or resize a box. The result SHALL be the same for the same input on every
run.

#### Scenario: Particle position
- **WHEN** a relation's track is a straight line 200 px long with `animate r { effect flow;
  duration 1s }` and t is 250
- **THEN** the particle's centre is 50 px from the start of the track

#### Scenario: Outside the window
- **WHEN** an effect has `delay 1s` and t is 500
- **THEN** `sceneAt` returns the static scene for that target
