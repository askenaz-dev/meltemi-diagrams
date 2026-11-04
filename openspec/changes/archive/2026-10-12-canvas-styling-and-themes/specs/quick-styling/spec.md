## ADDED Requirements

### Requirement: Style strip
The inspector SHALL begin with a style strip for the selection: fill, stroke and text colour as
swatch rows; line style, stroke width and, for relations, arrowhead; the three effects as toggles
with the speed of each effect that is on. Each control SHALL write the same `style` and `animate`
statements as the inspector's fields (`setStyleProperty`, `setAnimation`, `removeAnimation`), and
the strip SHALL reflect the written value or, greyed, the inherited one.

#### Scenario: Fill from the strip
- **WHEN** `api` is selected and the `accent` swatch of the fill row is chosen
- **THEN** the text gains `style api { fill accent }`

#### Scenario: Effect from the strip
- **WHEN** the named relation `pay` is selected and the dash toggle is turned on
- **THEN** the text gains `animate pay { effect dash }` and the strip shows its speed with the
  default greyed

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
A style or an effect set on a relation without an id SHALL first name it, in the same edit, as
labels and routes do (`materializeRelationId` with `<from>_<to>`, distinct for relations named
together), and the status line SHALL say so; turning an effect off SHALL name nothing. Relations
SHALL have a classes field in the inspector, written in the relation's own block, which needs no
name. In C4 views, whose relations come from the model, an anonymous relation SHALL be refused
with the advice to name it in the model.

#### Scenario: Colour on an anonymous relation
- **WHEN** `api -> db` is selected and its stroke is set to `danger`
- **THEN** the text becomes `api -> db as api_db` with `style api_db { stroke danger }`, in one
  undo step

### Requirement: Relation tool
The palette SHALL offer a relation tool (R; "Message" on sequence diagrams): the first click
chooses the source and highlights it, the second click the target, Escape cancels, and Shift
makes the relation dashed (`-->`). It SHALL create the same text as dragging from a connection
handle.

#### Scenario: Two clicks
- **WHEN** the relation tool is chosen, `api` is clicked and then `db`
- **THEN** the text gains `api -> db` and the new relation is selected

### Requirement: Icon picker from the Icon field
The Icon style field of elements and relations in every profile SHALL offer the host's searching
icon picker, and the chosen reference SHALL be written with `setStyleProperty`.

#### Scenario: Icon on a flow node
- **WHEN** `api` is selected, "Choose…" is pressed on the Icon field and `tabler:server` is chosen
- **THEN** the text gains `style api { icon "tabler:server" }`

### Requirement: Light and dark counterpart
The strip's theme row SHALL show the diagram's effective theme and, when it is a built-in family,
a one-click switch to its light or dark counterpart that writes the diagram's `theme` property.

#### Scenario: To dark
- **WHEN** a diagram uses `technical.light` and the dark counterpart is chosen
- **THEN** the text gains `theme "technical.dark"`
