## ADDED Requirements

### Requirement: Icon pickers
The strip SHALL show the line (solid, dashed, dotted), the route kind (automatic, straight, elbow,
curved), the corners (sharp, rounded) and the start and end heads as pictures, not words: line,
route and corners as rows of icon chips with a "theme" chip that inherits again, and each head as
a button showing the current head that opens a grid of every head and "theme". Each picture SHALL
have the value's name as its accessible name, the rows and the grid SHALL be radio groups moved
with the arrow keys and chosen with Enter or Space, and Escape SHALL close the grid. For a
relation, solid and dashed SHALL rewrite its arrow (and remove a written `line` style), and dotted
SHALL write `line dotted`. A field the canvas has no pictures for SHALL render as a select.

#### Scenario: Start head from the grid
- **WHEN** the named relation `own` is selected, the start head button is pressed and `diamond` is
  chosen in the grid
- **THEN** the text gains `style own { arrowtail diamond }` and the button shows a diamond

#### Scenario: Dotted from the line row
- **WHEN** `api -> db` is selected and the dotted chip of the line row is chosen
- **THEN** the text becomes `api -> db as api_db` with `style api_db { line dotted }`

#### Scenario: Rounded corners
- **WHEN** the named relation `own` is selected and the rounded chip of the corners row is chosen
- **THEN** the text gains `style own { corners rounded }`

## MODIFIED Requirements

### Requirement: Style strip
The inspector SHALL begin with a style strip for the selection: fill, stroke and text colour as
swatch rows; line style, stroke width and, for relations, the route kind, the corners and the heads at both ends; the effects that
apply (flow particles, moving dash, pulse and trace) as toggles with the speed of each effect
that is on. Each control SHALL write the same `style` and `animate`
statements as the inspector's fields (`setStyleProperty`, `setAnimation`, `removeAnimation`), and
the strip SHALL reflect the written value or, greyed, the inherited one.

#### Scenario: Fill from the strip
- **WHEN** `api` is selected and the `accent` swatch of the fill row is chosen
- **THEN** the text gains `style api { fill accent }`

#### Scenario: Effect from the strip
- **WHEN** the named relation `pay` is selected and the dash toggle is turned on
- **THEN** the text gains `animate pay { effect dash }` and the strip shows its speed with the
  default greyed
