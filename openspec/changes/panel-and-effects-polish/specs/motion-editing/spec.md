## ADDED Requirements

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
