# motion-editing Specification

## Purpose
Effects are edited with structured operations, in the inspector and with completion, and previewed on the canvas.
## Requirements
### Requirement: Animation edit operations
`setAnimation { diagram, target, targetKind, effect, property?, value? }` SHALL make sure the
target has an `animate` statement with that effect, adding `animate <target> { effect <e> }` after
the last `animate` or `style` statement when none exists, splitting a statement shared with other
targets, and set (or remove, with `null`) one property in it. `removeAnimation { diagram, target,
effect }` SHALL remove the target from the statement with that effect, deleting the statement when
it was the only target. Both SHALL refuse anonymous relations, targets the effect does not accept
and values the language refuses, and SHALL keep comments and formatting.

#### Scenario: Turn on flow
- **WHEN** `setAnimation` runs with target `pay` and effect `flow` on a diagram without effects
- **THEN** the text gains `animate pay { effect flow }`

#### Scenario: Split a shared statement
- **WHEN** the text has `animate pay, ship { effect flow }` and `setAnimation` sets the duration of
  `ship` to 2000
- **THEN** the text has `animate pay { effect flow }` and
  `animate ship { effect flow; duration 2000ms }`

### Requirement: Effects in the inspector
The inspector SHALL show an **Effects** section for elements, relations and named notes and
fragments, with `Flow particles` (relations), `Moving dash`, `Pulse` and `Trace` (relations) as on/off and,
for each effect that is on, its duration, repeat, delay and the properties that apply (direction,
particles, colour), mapped to `setAnimation` and `removeAnimation`. An effect set on a relation without an id
SHALL name the relation first, in the same edit. The duration field SHALL show, greyed, the
effective theme's duration token when the theme writes one, else the engine's default.

#### Scenario: Change a duration
- **WHEN** a relation with a flow effect is selected and Duration is set to 2000
- **THEN** the effect's statement gets `duration 2000ms`

#### Scenario: Effect on an anonymous relation
- **WHEN** `api -> db` is selected and Flow particles is turned on
- **THEN** the text becomes `api -> db as api_db` with `animate api_db { effect flow }`, in one undo step

#### Scenario: Theme default shown
- **WHEN** the diagram's theme writes `dashDuration 600ms` and a dashed relation's effect is on
- **THEN** the Duration field is empty and shows 600 greyed

#### Scenario: Trace on a relation
- **WHEN** the named relation `pay` is selected and Trace is turned on
- **THEN** the text gains `animate pay { effect trace }` and its Duration field shows 1500 greyed

### Requirement: Preview on the canvas
The canvas toolbar SHALL offer **Play effects** when the diagram has effects; while it is on, the
canvas SHALL show the animated profile, and it SHALL show the static drawing again when it is
turned off.

#### Scenario: Play
- **WHEN** Play effects is turned on for a diagram with a pulse
- **THEN** the canvas SVG contains the animated style sheet

### Requirement: Language services for effects
Completion inside `animate` blocks SHALL offer the properties and values that apply to the block's
effect, hover SHALL document every property, and the new diagnostics SHALL appear like the others.

#### Scenario: Completion after effect flow
- **WHEN** completion runs in `animate pay { effect flow; | }`
- **THEN** it offers `duration`, `repeat`, `delay`, `direction`, `particles` and `color`

