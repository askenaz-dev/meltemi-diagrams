## MODIFIED Requirements

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
