# quick-styling Specification

## Purpose
Style a diagram on the canvas without typing: the style strip at the top of the inspector, its
theme colour chips, picker and inherit control, effects with their speed, the relation tool, the
icon picker of the Icon field and the light or dark counterpart of the diagram's theme. Every
control writes the same `style`, `animate` and `theme` statements as the text.
## Requirements
### Requirement: Token swatches, picker and inherit
The swatches of a colour row SHALL be the effective theme's sixteen colour tokens and four signal
tokens with the colours that theme resolves them to, so a custom theme shows its own colours. A
swatch SHALL write the token's name; the colour picker SHALL write the chosen colour as a quoted
hex value; the "theme" control SHALL remove the property so the item inherits again. A colour
field without swatches SHALL render as a text field, as before.

#### Scenario: Picked colour stays fixed
- **WHEN** the stroke of `db` is picked as `#E8A33D` and the diagram's theme then changes
- **THEN** the text holds `style db { stroke "#E8A33D" }` and `db` keeps that stroke

#### Scenario: Back to the theme
- **WHEN** `style api { fill accent; stroke danger }` exists and "theme" is chosen on the fill row
- **THEN** the statement becomes `style api { stroke danger }`

### Requirement: Styling a selection
With several items selected, the strip SHALL apply each control to every selected item that takes
the property, as one batch plan, and SHALL show "mixed" where their values differ.

#### Scenario: Three boxes at once
- **WHEN** `api`, `db` and `cache` are selected and the fill swatch `surface` is chosen
- **THEN** one undo step writes `fill surface` for the three

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

### Requirement: Relation tool
The palette SHALL offer a relation tool (R; "Message" on sequence diagrams): the first click
chooses the source and highlights it, the second click the target, Escape cancels, and Shift
makes the relation dashed (`-->`). It SHALL create the same text as dragging from a connection
handle.

#### Scenario: Two clicks
- **WHEN** the relation tool is chosen, `api` is clicked and then `db`
- **THEN** the text gains `api -> db` and the new relation is selected

### Requirement: Icon picker from the Icon field
The Icon style field of the elements and relations of flow diagrams, free compositions and C4 views SHALL open the canvas's own icon picker under the field (see `diagram-canvas`), not a dialog of the host, and the chosen reference SHALL be written with `setStyleProperty`; **Remove** SHALL remove the property. On C4 views the picker SHALL offer the icons of the document's packs, without libraries and without a placement control. Sequence diagrams, whose participants and messages draw no icons, SHALL offer no Icon or Icon colour field.

#### Scenario: Icon on a flow node
- **WHEN** `api` is selected, "Choose…" is pressed on the Icon field and `tabler:server` is chosen
- **THEN** the text gains `style api { icon "tabler:server" }`

#### Scenario: Icon on a C4 entity
- **WHEN** container `shop.api` of a C4 container view is selected, "Choose…" is pressed on the Icon field and `server` is typed
- **THEN** the picker lists the Tabler server icon and no library, and choosing it writes `style shop.api { icon "tabler:server" }`

#### Scenario: No Icon field on a sequence diagram
- **WHEN** participant `a` of a sequence diagram is selected
- **THEN** the inspector shows neither an Icon field nor an Icon colour field

### Requirement: Light and dark counterpart
The strip's theme row SHALL show the diagram's effective theme and, when it is a built-in family,
a one-click switch to its light or dark counterpart that writes the diagram's `theme` property.

#### Scenario: To dark
- **WHEN** a diagram uses `technical.light` and the dark counterpart is chosen
- **THEN** the text gains `theme "technical.dark"`

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

