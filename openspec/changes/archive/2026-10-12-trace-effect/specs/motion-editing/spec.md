## MODIFIED Requirements

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
