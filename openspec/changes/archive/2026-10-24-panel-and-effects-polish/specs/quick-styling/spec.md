## ADDED Requirements

### Requirement: Effect colour rows
The colour of flow particles, of a pulse and of a trace SHALL be a colour row of the strip, the
same as fill and stroke: the Theme chip, the effective theme's colour token chips with the
colours it resolves them to, and the native picker. A chip SHALL write the token's name
(`color accent`); the picker SHALL write the chosen colour as a quoted hex (`color "#E8A33D"`);
the Theme chip SHALL remove `color` so the theme's `accent` applies again. Without a written
colour the row SHALL show `accent` as inherited, and the picker SHALL start at the theme's accent
colour. A written token, which the model holds as `@<token>`, SHALL be the checked chip. The row
SHALL be drawn for one target only; a selection of several targets has no colour field. On a
diagram with errors a chip SHALL be refused as every style is, with the advice to fix the
problems first, and on a read-only canvas the chips and the picker SHALL be disabled.

#### Scenario: Token from a chip
- **WHEN** the named relation `pay` has `effect trace` on and the `danger` chip of its colour row is chosen
- **THEN** the text gains `animate pay { effect trace; color danger }` and the `danger` chip is checked

#### Scenario: A colour of one's own
- **WHEN** `#e8a33d` is picked with the colour row's picker for the flow particles of `pay`
- **THEN** the text gains `color "#E8A33D"` in the flow statement and the row shows it

#### Scenario: Back to the accent
- **WHEN** `animate pay { effect pulse; color danger }` exists and the Theme chip of the pulse colour row is chosen
- **THEN** the statement becomes `animate pay { effect pulse }`, the row says "accent (inherited)" and the picker shows the theme's accent

#### Scenario: A written token shows as its chip
- **WHEN** the text holds `animate pay { effect trace; color info }` and `pay` is selected
- **THEN** the trace colour row shows the `info` chip checked, the field's value being `info` (the model's `@info` without its at sign)

#### Scenario: Nothing is written for the same value
- **WHEN** the checked `danger` chip of a colour row is chosen again
- **THEN** no edit is planned and the text is unchanged

#### Scenario: Refused on a diagram with errors
- **WHEN** the diagram has a syntax error and the `danger` chip of the trace colour row of the anonymous `api -> db` is chosen
- **THEN** the edit is refused with the advice to fix the problems first, and no `as` is written

### Requirement: Effect cards in the strip
Right under the Effects row, the strip SHALL show one card per effect that is on, in the order of
the toggles, for one selected target: a header with a disclosure button named after the effect
(its accessible name "<effect>: settings", `aria-expanded`) and the effect's duration beside it,
whose input keeps the field's id and the theme's duration token or the engine's default greyed,
then, inside, repeat, delay, direction (flow, dash and trace), particles (flow) and the colour
row (flow, pulse and trace), each control named "<effect>: <field>" with the effect's name shown
once in the header. The card of an effect just turned on SHALL open; every other card SHALL
start closed; a card opened or closed by hand SHALL stay so for that target while the canvas
session lasts, and the state SHALL not be persisted. The speed of an effect SHALL appear nowhere
else in the strip, and no field of an effect SHALL appear after the target's other fields. A
selection of several targets SHALL show the toggles only, with no card. The duration SHALL
refuse a value outside the language's range with the range, as before. A card SHALL open and
close by its height and opacity on the canvas's motion tokens (`--mdg-motion`, `--mdg-ease`), the
header's chevron turning with it, and a card that appears with an effect just turned on SHALL
grow in; under `prefers-reduced-motion: reduce` nothing SHALL animate.

#### Scenario: Turning an effect on opens its card
- **WHEN** the named relation `pay` is selected and the dash toggle is turned on
- **THEN** the text gains `animate pay { effect dash }`, the Effects row says "Moving dash", and under it one open card headed "Moving dash" shows the duration input in its header beside the button, with 1000 greyed, and repeat, delay and direction inside

#### Scenario: A second effect opens its own card, the first closes
- **WHEN** Trace is then turned on
- **THEN** the trace card is open with its duration showing 1500 greyed, direction and the colour row, and the dash card is closed with its duration still visible in its header

#### Scenario: The open state stays for the session
- **WHEN** the dash card is opened by its header, `api` is selected and then `pay` again
- **THEN** the dash card is open and the trace card is as it was left

#### Scenario: Nothing after the other fields
- **WHEN** `pay` with a trace is selected
- **THEN** the inspector's fields after the strip hold no effect field, and the strip has no loose speed field

#### Scenario: Toggles only for a selection
- **WHEN** `api`, `db` and `cache` are selected and one of them has a pulse
- **THEN** the Effects row says "mixed", the Pulse toggle is mixed, and no card is drawn

#### Scenario: Speed out of range
- **WHEN** 50 is typed as the duration in a card's header
- **THEN** the field refuses it with the range and the text is unchanged

#### Scenario: Card in Spanish
- **WHEN** the interface language is Spanish and `pay` has a pulse
- **THEN** the card's header reads "Pulso", its button's accessible name is "Pulso: ajustes", and the colour row's Theme chip is "Tema"

#### Scenario: Cards move on the shared tokens
- **WHEN** a closed card's header is pressed
- **THEN** its body is rendered with a transition of 160 ms on its height and 120 ms on its opacity, and with 0 s under reduced motion
