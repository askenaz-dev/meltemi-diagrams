## ADDED Requirements

### Requirement: Style strip with corners and rotation
The inspector SHALL begin with a style strip for the selection: fill, stroke and text colour as
swatch rows; line style and stroke width; the corner radius (a slider with its number) for the
elements whose drawing uses it (`rounded`, `rectangle`, `square` and `framed` boxes and nodes, the
polygon shapes and decisions, persons and agents, notes, the frames of free texts, icons and
images, and groups), greyed with the radius drawn; the rotation (a slider from 0 to 359 with its
number) for the elements that take `rotation`, greyed at 0; and the shape (a picture per value)
for free boxes and flow nodes; for relations, the route kind, the corners and the heads at both
ends; the effects that apply (flow particles, moving dash, pulse and trace) as toggles with the
speed of each effect that is on. Each control SHALL write the same `style` and `animate`
statements as the inspector's fields (`setStyleProperty`, `setAnimation`, `removeAnimation`), and
the strip SHALL reflect the written value or, greyed, the inherited one.

#### Scenario: Fill from the strip
- **WHEN** `api` is selected and the `accent` swatch of the fill row is chosen
- **THEN** the text gains `style api { fill accent }`

#### Scenario: Effect from the strip
- **WHEN** the named relation `pay` is selected and the dash toggle is turned on
- **THEN** the text gains `animate pay { effect dash }` and the strip shows its speed with the
  default greyed

#### Scenario: Radius from the strip
- **WHEN** `api` is selected and the corner radius slider is moved to 0
- **THEN** the text gains `style api { radius 0 }`

#### Scenario: Radius slider on a polygon
- **WHEN** a node with `style api { shape hexagon }` is selected
- **THEN** the strip shows the shape pictures and a corner radius slider at 0, greyed, and moving it to 10 writes `style api { shape hexagon; radius 10 }`

#### Scenario: No radius slider on a circle
- **WHEN** a node with `style c { shape circle }` is selected
- **THEN** the strip shows no corner radius slider

#### Scenario: Rotation from the strip
- **WHEN** `api` is selected and the rotation slider is moved to 30
- **THEN** the text gains `style api { rotation 30 }`, and moving it back to 0 removes it

#### Scenario: Shape picture in Spanish
- **WHEN** the interface language is Spanish and box `a` with `shape diamond` is selected
- **THEN** the shape control shows the diamond picture named "rombo", and the arrowhead controls keep their own names

## REMOVED Requirements

### Requirement: Style strip
**Reason**: Replaced by "Style strip with corners and rotation", which offers the corner radius on
every shape with corners (the polygons included, where this requirement had a scenario without it)
and adds the rotation.
**Migration**: The strip keeps every control it had; the corner radius now also shows for
`rectangle`, `square`, `framed`, the polygon shapes, decisions, persons and agents, and a Rotation
slider is added.
