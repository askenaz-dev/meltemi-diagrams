## MODIFIED Requirements

### Requirement: Selection

The canvas SHALL support:

- click, plus Shift- or Ctrl-click to add and remove; the topmost painted shape under the pointer is the one clicked, and a shape drawn as a path (diamond, ellipse, polygon…) is hit only inside its outline;
- selecting a relation by every visible piece of its drawn body and within six screen pixels beyond its painted stroke, at every zoom, independently of its dash/dot gaps, animation phase or reduced-motion setting; a connector's empty bounding-box interior and structural gaps protecting container titles SHALL NOT count as its stroke;
- Alt+click to select the shape below the one under the pointer, cycling through the stack in paint order, and "Select the shape below" in the context menu;
- a selection rectangle dragged left-to-right, or without horizontal displacement, that selects the boxes fully inside it and the relations whose complete routed line is fully inside it;
- a selection rectangle dragged right-to-left that selects nongroup drawn objects intersecting the rectangle and relations whose visible drawn line intersects it; crossing tests SHALL use the actual shape or stroke geometry rather than only its bounding box, and enclosing groups SHALL require full containment in both directions;
- select all (Ctrl+A) and clear (Escape);
- Tab and Shift+Tab through elements in source order;
- Ctrl with the arrows to the nearest element in that direction, preferring the nested (smaller) shape when two are concentric.

The selection SHALL be kept across renders, and ids that disappear SHALL be dropped. Hidden layers and wholly clipped-out drawing SHALL NOT participate in pointer or rectangle selection. Shift/Ctrl additive rectangle selection SHALL retain the starting selection and add the eligible ids once. A containment rectangle SHALL have a solid outline and a crossing rectangle a dashed outline, with a localized status/accessible announcement naming the mode and feedback distinguishable without colour alone. The mode SHALL be derived from the gesture's horizontal direction before rectangle normalization.

Gantt task, milestone and section rectangle selection SHALL retain its existing chart-specific touched-row behavior; the directional connector rules SHALL apply to dependency relations without changing those task gestures. When a rectangle selects both tasks and dependencies, the last touched task SHALL remain the primary selection for keyboard traversal through rows.

The relation's body hit surface SHALL be independent of decorative animation primitives, SHALL follow the rendered curve, all of its visible pieces and viewport transforms, and SHALL remain below the relation's label and editing handles in input priority. Motion particles, traces, pulses and other overlays SHALL remain noninteractive. Selection SHALL write no source edit and SHALL preserve the existing mouse/stylus gesture arbitration, touch panning, label editing, route handles and view-only inspection. Canvas-only hit surfaces SHALL NOT appear in exported SVGs.

#### Scenario: Keyboard traversal
- **WHEN** `client`, `api` and `db` are declared in that order, `api` is selected and Tab is pressed
- **THEN** `db` is selected and scrolled into view

#### Scenario: A rectangle over an arrow
- **WHEN** a selection rectangle is dragged left-to-right around the whole connector of `save` and no box
- **THEN** `save` is selected

#### Scenario: Select below
- **WHEN** `outer`, `middle` and `inner` are stacked at one centre and the centre is Alt+clicked twice
- **THEN** the first Alt+click selects `middle` and the second `outer`

#### Scenario: Empty corner of a diamond
- **WHEN** the top-left corner of the bounding rectangle of a `shape diamond` box is clicked
- **THEN** nothing is selected

#### Scenario: Moving-dash body at the reported zoom
- **WHEN** a relation with a moving-dash effect is shown at 49% zoom in a panned and scrolled canvas and its body is clicked away from its label and endpoints
- **THEN** that relation is selected, including a click in a visual gap between dashes within the stroke's six-screen-pixel reach
- **AND** the canvas posts no source edit

#### Scenario: Every visible piece across titled groups
- **WHEN** a relation crosses nested titled account and control-plane groups and each visible body piece is clicked in turn
- **THEN** every such press selects the same relation, whether the piece carries an animation class or not
- **AND** a press in the protected gap over a container title does not select an invisible continuation of that relation

#### Scenario: The pointer is away from a curved stroke
- **WHEN** a pointer lies inside a curved relation's bounding box but more than six screen pixels beyond its painted stroke
- **THEN** the relation is not selected and the press reaches the actual shape or background at that point

#### Scenario: Particles do not capture a press
- **WHEN** a flow particle or a pulse overlay passes over a label, handle or different object and the user presses it
- **THEN** the actual underlying input target is used and the decorative overlay is not selected

#### Scenario: Label and endpoint interactions
- **WHEN** a relation's label is dragged, or its selected endpoint handle is dragged, while its body has a moving-dash effect
- **THEN** the existing label-move or endpoint-reconnect gesture is used rather than a body-selection target intercepting the press

#### Scenario: A crossing rectangle touches only a connector's middle
- **WHEN** a right-to-left rectangle crosses the middle segment of an orthogonal connector while both endpoints and its label lie outside the rectangle
- **THEN** that connector is selected
- **AND** the same area dragged left-to-right does not select the partially enclosed connector

#### Scenario: Crossing a curve versus its bounds
- **WHEN** a right-to-left rectangle intersects the drawn curve of one relation but only the empty bounding-box interior of another
- **THEN** only the intersected relation is selected

#### Scenario: Crossing inside a container
- **WHEN** a right-to-left rectangle crosses an arrow and a nongroup box inside nested groups, without enclosing either group
- **THEN** the crossed arrow and box are selected and neither enclosing group is selected

#### Scenario: Additive and reverse-axis rectangles
- **WHEN** `api` is already selected and Shift or Ctrl is held while a right-to-left rectangle is dragged upward across `save`
- **THEN** the selection holds `api` and `save` once each
- **AND** the band identifies crossing selection in its outline and localized announcement

#### Scenario: Hidden or clipped drawing
- **WHEN** a rectangle encloses or crosses the coordinates of a relation on a hidden layer, or only a wholly clipped-out piece of a relation
- **THEN** that hidden drawing contributes no selected id

#### Scenario: Gantt tasks stay primary when their dependency is selected
- **WHEN** a rectangle touches three task bars and contains a dependency between two of them, and Tab is pressed after the selection
- **THEN** the bars and dependency are selected together before Tab, and Tab selects the task following the last touched row

#### Scenario: Read-only inspection and reduced motion
- **WHEN** the canvas is read-only and reduced motion is requested, and a visible relation body is clicked or crossed by a selection rectangle
- **THEN** selection follows the same geometry and the interface sends no editing action

#### Scenario: Interaction targets stay out of exports
- **WHEN** the canvas displays enlarged connector hit surfaces and the same diagram is exported as static or animated SVG
- **THEN** the exports contain no canvas hit primitives or their interaction classes and retain their authored appearance and motion
