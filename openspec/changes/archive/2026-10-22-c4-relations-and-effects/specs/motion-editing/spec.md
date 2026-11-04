## MODIFIED Requirements

### Requirement: Effects in the inspector
The inspector SHALL show an **Effects** section for elements, relations, sequence messages, notes and fragments, and the relations of C4 views, with `Flow particles` (relations and messages), `Moving dash`, `Pulse` and `Trace` (relations and messages) as on/off and,
for each effect that is on, its duration, repeat, delay and the properties that apply (direction,
particles, colour), mapped to `setAnimation` and `removeAnimation`. An effect set on a target without an id
SHALL name the target first, in the same edit: a flow relation or a sequence message with `materializeRelationId` (`<from>_<to>`), a note or a fragment with `renameEvent` and a fresh `<kind><n>` id (`note1`, `alt1`), and a relation of a C4 view with `setModelRelationProperty { property: "id" }` in its model (`<from>_<to>` from the entity paths, in the model's file when that is another file of the project); the status line SHALL say what was named. Turning an effect off SHALL name nothing. The duration field SHALL show, greyed, the
effective theme's duration token when the theme writes one, else the engine's default.

#### Scenario: Change a duration
- **WHEN** a relation with a flow effect is selected and Duration is set to 2000
- **THEN** the effect's statement gets `duration 2000ms`

#### Scenario: Effect on an anonymous relation
- **WHEN** `api -> db` is selected and Flow particles is turned on
- **THEN** the text becomes `api -> db as api_db` with `animate api_db { effect flow }`, in one undo step

#### Scenario: Effect on an anonymous message of an imported sequence diagram
- **WHEN** the message `Customer -> Web: "Pay"` of the imported `card_payment` diagram is selected and Trace is turned on
- **THEN** the text becomes `Customer -> Web: "Pay" as Customer_Web` with `animate Customer_Web { effect trace }`, in one undo step

#### Scenario: Pulse on an anonymous note
- **WHEN** an unnamed `note over api "Checks the card"` is selected and Pulse is turned on
- **THEN** the note is named `note1` and the text gains `animate note1 { effect pulse }`, in one undo step

#### Scenario: Effect on a relation of a C4 view
- **WHEN** the drawn relation standing for `customer -> shop.web: "Uses"` is selected on a C4 view whose model is in the same file and Flow particles is turned on
- **THEN** the model statement reads `customer -> shop.web: "Uses" as customer_shop_web` and the view gains `animate customer_shop_web { effect flow }`, in one undo step

#### Scenario: Turning off names nothing
- **WHEN** Flow particles is turned off on an anonymous relation that has no effect
- **THEN** no edit is planned and the relation keeps no id

#### Scenario: Theme default shown
- **WHEN** the diagram's theme writes `dashDuration 600ms` and a dashed relation's effect is on
- **THEN** the Duration field is empty and shows 600 greyed

#### Scenario: Trace on a relation
- **WHEN** the named relation `pay` is selected and Trace is turned on
- **THEN** the text gains `animate pay { effect trace }` and its Duration field shows 1500 greyed
