# Spec Delta

## ADDED Requirements

### Requirement: Effect toggles from the context menu
An effect turned on or off from the canvas context menu SHALL write exactly what the inspector's
toggle writes: `animate <target> { effect <e> }` with the engine's defaults when turned on,
removal of the target from its statement when turned off, splitting a statement shared with other
targets. A target without an id SHALL be named first in the same edit, as the inspector does, and
the status line SHALL say what was named. The menu SHALL set no property other than the effect.

#### Scenario: Effect on an anonymous relation from the menu
- **WHEN** `api -> db` is selected and **Flow particles** is chosen in the context menu
- **THEN** the text becomes `api -> db as api_db` with `animate api_db { effect flow }`, in one undo step, and the status line names `api_db`

#### Scenario: Shared statement split from the menu
- **WHEN** the text has `animate pay, ship { effect pulse }`, `ship` is selected and **Pulse** is chosen
- **THEN** the text keeps `animate pay { effect pulse }` and `ship` has no pulse

#### Scenario: A sequence note from the menu
- **WHEN** an unnamed `note over api "Checks the card"` is selected on a sequence canvas and **Pulse** is chosen
- **THEN** the note is named `note1` and the text gains `animate note1 { effect pulse }`, in one undo step

#### Scenario: A C4 relation from the menu
- **WHEN** the drawn relation for `customer -> shop.web: "Uses"` is selected on a C4 view and **Trace** is chosen
- **THEN** the model statement gains `as customer_shop_web` and the view gains `animate customer_shop_web { effect trace }`, in one undo step

#### Scenario: Refused as the inspector refuses
- **WHEN** the edit is refused, because the file changed under the canvas between the menu opening and the choice
- **THEN** the status line says why, the text is unchanged and the menu item keeps its previous state
