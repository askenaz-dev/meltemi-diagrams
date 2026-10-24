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

### Requirement: Preview on the canvas
The canvas SHALL show the animated profile of a diagram that has effects from the moment it is shown, and the toolbar SHALL offer one toggle, **Pause effects** while playing and **Play effects** while paused, enabled only when the diagram has effects; while paused the canvas SHALL show the static drawing. The choice SHALL be remembered per diagram of the file in the canvas's persisted state, so a paused diagram is still paused after a reload and a diagram played again stays playing. Under `prefers-reduced-motion: reduce` a diagram without a remembered choice SHALL start paused. Live previews during drags SHALL keep the chosen state.

#### Scenario: Opens animated
- **WHEN** a file whose diagram has a pulse is opened on the canvas
- **THEN** the canvas SVG contains the animated style sheet and the toolbar shows Pause effects

#### Scenario: Play
- **WHEN** Play effects is pressed on a paused diagram with a pulse
- **THEN** the canvas SVG contains the animated style sheet and the toolbar shows Pause effects

#### Scenario: Pause survives a reload
- **WHEN** Pause effects is pressed and the canvas is reloaded
- **THEN** the canvas shows the static drawing, the toolbar shows Play effects, and pressing it shows the animated style sheet again

#### Scenario: Reduced motion starts paused
- **WHEN** the system asks for reduced motion and a diagram with effects that was never paused or played here is shown
- **THEN** the canvas shows the static drawing and the toolbar shows Play effects

#### Scenario: No effects
- **WHEN** a diagram without effects is shown
- **THEN** the canvas shows the static drawing, the toggle is disabled, and pressing it changes nothing

### Requirement: Language services for effects
Completion inside `animate` blocks SHALL offer the properties and values that apply to the block's
effect, hover SHALL document every property, and the new diagnostics SHALL appear like the others.

#### Scenario: Completion after effect flow
- **WHEN** completion runs in `animate pay { effect flow; | }`
- **THEN** it offers `duration`, `repeat`, `delay`, `direction`, `particles` and `color`

### Requirement: Effect settings beside their toggles
The fields of an effect that is on (duration, repeat, delay and the properties that apply) SHALL
be shown with the effect's toggle, in a card right under the strip's Effects row (`quick-styling`,
"Effect cards in the strip"), never after the target's other fields; the inspector model SHALL mark each of them for the strip with `group` naming its toggle
(`effect.<e>`), so a canvas draws the group without knowing the effects. The colour field of flow
particles, a pulse and a trace SHALL name the theme's `accent` token as what applies without a
written colour, since that is what the engine draws (`motion-effects`, decision 0055). The
operations SHALL stay `setAnimation` and `removeAnimation`, and an effect set on a target
without an id SHALL still name it first.

#### Scenario: Grouped fields
- **WHEN** the named relation `pay` has `effect trace` on and is selected
- **THEN** `effect.trace.duration`, `effect.trace.repeat`, `effect.trace.delay`, `effect.trace.direction` and `effect.trace.color` carry `section: "strip"` and `group: "effect.trace"`, and no field named after an effect comes after the fields of the relation

#### Scenario: Accent as the default colour
- **WHEN** `pay` has `effect flow` on and no `color`
- **THEN** `effect.flow.color` has value null, placeholder `accent` and the theme's swatches

#### Scenario: Colour on an anonymous relation
- **WHEN** `api -> db` has no id, Flow particles is turned on and then the `accent` chip of its colour row is chosen
- **THEN** the text holds `api -> db as api_db` with `animate api_db { effect flow; color accent }`, and `api_db` stays selected

#### Scenario: Toggles only for a selection
- **WHEN** `api` and `db` are selected and `api` has a pulse
- **THEN** the model has `effect.pulse` mixed and no `effect.pulse.*` field

#### Scenario: A direction the language refuses
- **WHEN** `sideways` is sent as the value of `effect.trace.direction`
- **THEN** the edit is refused with the direction's reason, and the text is unchanged

