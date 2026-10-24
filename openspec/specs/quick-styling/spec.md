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
flips the dashes of the current kind (`->` to `-->`, `--` to `---`). It SHALL create the same text as dragging from a connection
handle. Its kinds SHALL be `->`, `-->`, `--`, `---`, `<->` and `<-->` in that order, listed in the arrow button's menu with a picture and a name each ("arrow", "dashed arrow", "line", "dashed line", "two-way arrow", "dashed two-way arrow"; in Spanish "flecha", "flecha discontinua", "línea", "línea discontinua", "flecha doble", "flecha doble discontinua"), cycled in that order by R while the tool is armed and named in the status line, the badge beside the pointer and the keyboard help; C4 views SHALL offer `->` alone and sequence diagrams none. The strip of a `--` or `---` relation SHALL show `none` greyed as the inherited value of both heads, and its line row SHALL rewrite `--` and `---` into each other, keeping the heads, as it rewrites `->` and `-->`.

#### Scenario: Two clicks
- **WHEN** the relation tool is chosen, `api` is clicked and then `db`
- **THEN** the text gains `api -> db` and the new relation is selected

#### Scenario: A line from the tool
- **WHEN** the arrow button's menu is opened, `--` is chosen, and `api` then `db` are clicked
- **THEN** the text gains `api -- db`, the status line named the line kind, and with Shift on the second click it gains `api --- db` instead

#### Scenario: R cycles six kinds
- **WHEN** R is pressed once to arm the tool and then five more times
- **THEN** the status line names `-->`, `--`, `---`, `<->` and `<-->` in turn, and a sixth press names `->` again

#### Scenario: Heads of a line in the strip
- **WHEN** `api -- db as link` is selected
- **THEN** the strip's start and end head buttons show `none` greyed, choosing `triangle` for the end writes `style link { arrowhead triangle }`, and the dashed chip of the line row rewrites the statement as `api --- db as link`

#### Scenario: No line kinds in a C4 view
- **WHEN** the relation tool is armed on a C4 view and R is pressed again
- **THEN** the kind stays `->`, and the arrow button's menu lists `->` alone

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

### Requirement: Text alignment picker
The strip SHALL show, for free boxes, one control headed "Text alignment" ("Alineación del texto") of nine cells, a 3 × 3 grid of pictures of a text block in a box at each pair of `textAlign` (`left`, `center`, `right`) and `verticalAlign` (`top`, `middle`, `bottom`), with the written pair pressed and the inherited pair (`center`, `middle` by default) greyed in a dashed cell; for free texts, the three horizontal cells with `left` as the inherited value; nothing for other kinds or other profiles. A cell SHALL write `textAlign` and `verticalAlign` of the selection with `setStyleProperty` for the properties that change, in one undo step; the row's "theme" chip SHALL remove both. The cells SHALL be a radio group moved with the arrow keys in both directions and chosen with Enter or Space, each cell named by its pair in the interface language; a multi-selection whose values differ SHALL show "mixed" with no cell pressed.

#### Scenario: Top left from the picker
- **WHEN** box `a` of a free composition is selected and the top-left cell is chosen
- **THEN** the text gains `style a { textAlign left; verticalAlign top }` in one undo step and the cell is pressed

#### Scenario: One property changes
- **WHEN** `a` has `style a { textAlign left; verticalAlign top }` and the middle-left cell is chosen
- **THEN** the statement becomes `style a { textAlign left }`, since `middle` is the default, and the top-left cell is no longer pressed

#### Scenario: A text's row
- **WHEN** `text t "T"` is selected
- **THEN** the control shows three cells, the left one greyed as inherited, and choosing the right one writes `style t { textAlign right }`

#### Scenario: Keyboard
- **WHEN** the picker has focus on the centre cell and Down then Enter are pressed
- **THEN** the text gains `verticalAlign bottom` for the selection, and the cell's accessible name is "centre, bottom" ("centro, abajo" in Spanish)

#### Scenario: Not on a flow node
- **WHEN** node `api` of a flow diagram is selected
- **THEN** the strip shows no alignment picker

#### Scenario: Read-only canvas
- **WHEN** the canvas is read-only and box `a` is selected
- **THEN** the picker's cells are drawn disabled with the written pair pressed, and choosing one writes nothing

