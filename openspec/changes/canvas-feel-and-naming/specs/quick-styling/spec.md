## MODIFIED Requirements

### Requirement: Styling names anonymous relations
A style, an effect, a label position or a local label set on a relation without an id SHALL first name it, in the same edit, as labels and routes do (`materializeRelationId` with `<from>_<to>`, distinct for relations named together), and the status line SHALL say so; a style set on a note or a fragment without an id SHALL first name it with `renameEvent` and a fresh `<kind><n>` id, as effects do; turning an effect off SHALL name nothing. After every edit that names its target first (a style, an effect, a label, a layer, a dotted line, a label position, a local label typed on the canvas, a moved label, a dragged end or bend) the selection and the inspector SHALL follow the new id. Relations SHALL have a classes field in the inspector, written in the relation's own block, which needs no name. In C4 views, whose relations come from the model, an anonymous relation SHALL be named in its model with `setModelRelationProperty { property: "id" }` (`<from>_<to>` from the entity paths), as `motion-editing` and `c4-editor-tools` describe.

#### Scenario: Colour on an anonymous relation
- **WHEN** `api -> db` is selected and its stroke is set to `danger`
- **THEN** the text becomes `api -> db as api_db` with `style api_db { stroke danger }`, in one
  undo step, and `api_db` stays selected

#### Scenario: Colour on an unnamed note
- **WHEN** an unnamed `note over api "Checks the card"` is selected and its fill is set to `accent`
- **THEN** the note is named `note1`, the text gains `style note1 { fill accent }` in the same undo step, and `note1` stays selected

#### Scenario: Label position on an anonymous relation
- **WHEN** `api -> db` is selected and its label position is set to 30
- **THEN** the text becomes `api -> db as api_db` with `label api_db at 30%`, and `api_db` stays selected

#### Scenario: A dotted line keeps the selection
- **WHEN** `api -> db` is selected and the dotted chip of the line row is chosen
- **THEN** the text becomes `api -> db as api_db` with `style api_db { line dotted }`, and the inspector still shows `api_db`

#### Scenario: Nothing is named in a diagram with errors
- **WHEN** the diagram has a syntax error and the stroke of `api -> db` is set to `danger`
- **THEN** the edit is refused with the advice to fix the problems first, and no `as` is written

### Requirement: Style strip with corners and rotation
The inspector SHALL begin with a style strip for the selection: fill, stroke and text colour as
swatch rows; line style and stroke width; the corner radius (a slider with its number) for the
elements whose drawing uses it (`rounded`, `rectangle`, `square` and `framed` boxes and nodes, the
polygon shapes and decisions, persons and agents, notes, the frames of free texts, icons and
images, and groups), greyed with the radius drawn; the rotation (a slider from 0 to 359 with its
number) for the elements that take `rotation`, greyed at 0; and the shape (a picture per value)
for free boxes and flow nodes; for relations, the route kind, the corners and the heads at both
ends; the effects that apply (flow particles, moving dash, pulse and trace) as a row headed
**Effects** like the route kind's and the corners' rows, whose right side says "off" or names the
effects that are on (or "mixed" for a selection that differs), with the toggles beneath and the
speed of each effect that is on. Each control SHALL write the same `style` and `animate`
statements as the inspector's fields (`setStyleProperty`, `setAnimation`, `removeAnimation`), and
the strip SHALL reflect the written value or, greyed, the inherited one.

#### Scenario: Fill from the strip
- **WHEN** `api` is selected and the `accent` swatch of the fill row is chosen
- **THEN** the text gains `style api { fill accent }`

#### Scenario: Effect from the strip
- **WHEN** the named relation `pay` is selected and the dash toggle is turned on
- **THEN** the text gains `animate pay { effect dash }`, the Effects row says "Moving dash" at its right and the strip shows its speed with the
  default greyed

#### Scenario: Effects row with nothing on
- **WHEN** a relation without effects is selected
- **THEN** the strip shows a row headed "Effects" saying "off", with the four toggles beneath, and in Spanish the row is headed "Efectos"

#### Scenario: Speed out of range
- **WHEN** 50 is typed as the speed of an effect that is on
- **THEN** the field refuses it with the range and the text is unchanged

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
