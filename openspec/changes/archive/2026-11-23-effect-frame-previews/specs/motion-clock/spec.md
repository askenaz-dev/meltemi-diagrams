## ADDED Requirements

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
