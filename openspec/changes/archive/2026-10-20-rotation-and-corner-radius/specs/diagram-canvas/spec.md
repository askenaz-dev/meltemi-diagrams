## MODIFIED Requirements

### Requirement: Property inspector
The inspector SHALL begin with the style strip (swatches, picker, inherit, line, width, corner radius, rotation, shape, route, corners, start and end heads, effects and speed, and the theme row for the diagram) and SHALL then show the fields of the diagram when nothing is selected, of one element, of one relation, or the style fields shared by several selected items:

- **diagram**: title, description, direction, layout, routing, theme, preset;
- **element**: id, kind, label, description, classes, ports, inside (the parent group, or none), position, size and every style property that applies to its kind: Shape, shown with a picture per value, for free boxes and flow nodes; Corner radius, a number from 0 to 64 with a slider, wherever the radius is drawn: `rounded`, `rectangle`, `square` and `framed` boxes and nodes, the polygon shapes and decisions, persons and agents, notes, the frames of free texts, icons and images, and groups, with the radius drawn (a rule's or a class's, else the theme's `radius` for `rounded` boxes, notes and frames, `groupRadius` for a group, the body radius for persons and agents, 0 for the others) greyed as the default; an ellipse, a circle, a pill, a cylinder, a cloud or a document has no Corner radius field; Rotation, a number from 0 to 359 with a slider, for the elements of flow diagrams and free compositions other than groups, with 0 greyed;
- **relation**: id, label, ends and ports, line (solid, dashed or dotted), routing, corners, start and end heads, classes, style properties and label position.

Each change SHALL be one edit plan: `setDiagramProperty`, `setStyleProperty`, `setElementLabel`, `setDescription`, `setElementKind`, `setRelationLine`, `setClasses`, `addPort`, `removePort`, `setPosition`, `setSize`, `setRoute` or `moveElement`; a change to several selected items SHALL be one batch plan. Fields SHALL show the written value or, greyed, the default.

#### Scenario: Change a colour shared by a style
- **WHEN** `style api, db { fill "#eef" }` exists and the inspector sets the fill of `api` to `accent`
- **THEN** the statement becomes `style db { fill "#eef" }` and `style api { fill accent }` is added

#### Scenario: Width for a selection
- **WHEN** `api` and `db` are selected and the strip sets the width to 2
- **THEN** one undo step gives both `width 2`

#### Scenario: Shape by its picture
- **WHEN** box `a` is selected and the `ellipse` picture of the Shape field is chosen
- **THEN** the text gains `style a { shape ellipse }`

#### Scenario: Corner radius of a group
- **WHEN** group `g` is selected and the Corner radius slider is set to 0
- **THEN** the text gains `style g { radius 0 }`, and the field showed 14 greyed before the change under `technical.light`

#### Scenario: No corner radius where none is drawn
- **WHEN** a free box with `style b { shape ellipse }`, or a flow node with `style h { shape circle }`, is selected
- **THEN** neither the strip nor the inspector shows a Corner radius field, while a `rounded` box or node shows it with the theme's `radius` greyed, and a `rectangle` box or a `hexagon` node shows it with 0 greyed

#### Scenario: Inside field
- **WHEN** top-level `box c` is selected and `g` is chosen in the Inside field
- **THEN** `c` is declared inside `group g` and keeps its drawn position

#### Scenario: Radius typed out of range
- **WHEN** 90 is typed in the Corner radius field
- **THEN** the field refuses it and the text is unchanged

#### Scenario: Rotation field
- **WHEN** node `api` is selected and 30 is typed in the Rotation field, then group `g` is selected
- **THEN** the text gains `style api { rotation 30 }`, and the inspector of `g` shows no Rotation field

## ADDED Requirements

### Requirement: Rotating on the canvas
On a canvas that edits, one selected element of a flow diagram or a free composition that takes `rotation` SHALL show a rotation handle: a disc beyond its top-right corner, in the element's own frame, joined to the corner by a short line and clear of the resize and connection handles, appearing with the selection. Dragging it SHALL turn the element about the centre of its box: the angle is the pointer's bearing from the centre, snapped to 15° steps unless Alt is held, shown in the status line and beside the pointer; the element, its selection and its connectors SHALL follow live. Releasing SHALL write `style <id> { rotation <n> }` (0 to 359), or remove it at 0, in one undo step; Escape SHALL cancel and restore the drawing.

A turned element SHALL be selected, hit, marquee-selected and dropped onto by its turned outline; its selection frame, resize handles and connection handles SHALL be drawn turned with it; resizing it SHALL work in its own frame, keeping the opposite edge where it was in the diagram, without grid snapping; its magnets and the points pinned by dragging a connector end onto it SHALL lie on its turned outline and be written as `side n%` in its own frame; the inline text editor SHALL be turned with its text. The context menu SHALL offer **Rotate 90°**, which adds 90 to the angle modulo 360, and **Reset rotation**, which removes it, each disabled where it changes nothing or the element takes no rotation.

The handle SHALL fade in with the selection, the live rotation SHALL follow the pointer on every frame, and on release the element SHALL ease into the written angle, with the transitions dropped under `prefers-reduced-motion`.

#### Scenario: Rotate with the handle
- **WHEN** node `api` placed at (200, 120) is selected and its rotation handle is dragged a quarter turn clockwise about its centre
- **THEN** the status line names 90° and the angle shows beside the pointer, the element is drawn turned while dragging, and the release gives `style api { rotation 90 }` in one undo step, after which the status line says `api` turned to 90°

#### Scenario: Free angle with Alt
- **WHEN** the handle is dragged with Alt held to a bearing of 37° and released
- **THEN** the text gains `rotation 37`

#### Scenario: Escape restores
- **WHEN** the handle is being dragged and Escape is pressed
- **THEN** nothing is written and the element is drawn as before

#### Scenario: Select a turned element by its outline
- **WHEN** square `s` of 120 × 120 has `rotation 45` and the pointer clicks a corner of its unturned box that lies outside the turned square
- **THEN** `s` is not selected

#### Scenario: Resize a turned element
- **WHEN** node `api` with `rotation 90` is resized by dragging its turned east handle outward by 40 px in its own frame
- **THEN** `size api` grows 40 px wide, `place api` moves 20 px along the turned east direction, and the turned west edge stays where it was

#### Scenario: Pin an end on a turned element
- **WHEN** a connector's end is dragged onto the middle of the turned north side of node `api` with `rotation 90`
- **THEN** the route is written as `api.north 50%`

#### Scenario: Rotate 90° from the context menu
- **WHEN** node `api` with `rotation 300` is selected and **Rotate 90°** is chosen
- **THEN** the text gains `rotation 30` in place of 300

#### Scenario: No handle on a group or in read-only canvases
- **WHEN** a group, or an element of a read-only canvas, is selected
- **THEN** no rotation handle is drawn
