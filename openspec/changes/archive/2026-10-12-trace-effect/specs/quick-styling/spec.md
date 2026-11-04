## MODIFIED Requirements

### Requirement: Style strip
The inspector SHALL begin with a style strip for the selection: fill, stroke and text colour as
swatch rows; line style, stroke width and, for relations, arrowhead; the effects that
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
