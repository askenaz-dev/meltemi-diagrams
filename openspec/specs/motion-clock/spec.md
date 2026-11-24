# motion-clock Specification

## Purpose
Effects evaluated on a deterministic clock: the motion plan against the drawn scene and the scene at any time t.

## Requirements

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
Trace SHALL draw, inside the relation's group before its label, the track (reversed when
`direction reverse`) `width + 2` wide with a dash `L L` and offset `L × (1 − g)`, where L is the
track's length and `g = min(1, phase / 0.8)`, and a dot of radius `width + 3` at the fraction g of
the track, both with opacity 1 until phase 0.8 and `(1 − phase) / 0.2` after it.
No effect SHALL move or resize a box. The result SHALL be the same for the same input on every
run.

#### Scenario: Particle position
- **WHEN** a relation's track is a straight line 200 px long with `animate r { effect flow;
  duration 1s }` and t is 250
- **THEN** the particle's centre is 50 px from the start of the track

#### Scenario: Trace halfway
- **WHEN** a relation's track is a straight line 200 px long with `animate r { effect trace;
  duration 1s }` and t is 400
- **THEN** the trace's dash offset is 100, its dot's centre is 100 px from the start of the track
  and its opacity is 1

#### Scenario: Trace fading
- **WHEN** the same relation is drawn at t 900
- **THEN** the whole track is lit (offset 0) with opacity 0.5

#### Scenario: Outside the window
- **WHEN** an effect has `delay 1s` and t is 500
- **THEN** `sceneAt` returns the static scene for that target

### Requirement: State at time t
`motionStateAt(plan, t)` SHALL return what `sceneAt(scene, plan, t)` draws of each effect, in the
plan's order: its target, role, effect and timing, its `phase` (`null` outside its window) and
its `marks`, the centre of each `flow` particle and of a `trace`'s head with `along`, the share of
the track travelled in the effect's direction. It SHALL give `atMs` and `loopMs`. Marks and frames
SHALL share their arithmetic; the result SHALL be deterministic.

#### Scenario: A particle
- **WHEN** a relation's track is a straight line 200 px long with `animate r { effect flow; duration 1s }` and t is 250
- **THEN** the state has one effect on `r` with `phase` 0.25 and one mark 50 px from the start of the track with `along` 0.25, the centre of the circle `sceneAt` draws

#### Scenario: Several particles, reversed
- **WHEN** the effect is `{ effect flow; particles 2; direction reverse; duration 1s }` and t is 250
- **THEN** the marks have `along` 0.25 and 0.75 and lie 150 px and 50 px from the start of the track

#### Scenario: A trace's head
- **WHEN** the effect is `{ effect trace; duration 1s }` and t is 400
- **THEN** the mark is 100 px from the start of the track with `along` 0.5

#### Scenario: A dash and a pulse
- **WHEN** the plan holds a `dash` and a `pulse` inside their windows
- **THEN** each has its `phase` and no marks

#### Scenario: Outside the window
- **WHEN** an effect has `delay 1s` and t is 500
- **THEN** its `phase` is `null` and it has no marks

#### Scenario: A plan without effects
- **WHEN** the plan is empty
- **THEN** the state has no effects and `loopMs` (`motionLoop(plan)`) is `null`
