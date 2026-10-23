## MODIFIED Requirements

### Requirement: Rotating on the canvas
On a canvas that edits, one selected element of a flow diagram or a free composition that takes `rotation` SHALL show a rotation handle: a disc beyond its top-right corner, in the element's own frame, joined to the corner by a short line and clear of the resize and connection handles, appearing with the selection. Dragging it SHALL turn the element about the centre of its box: the angle is the element's angle at the press plus the change of the pointer's bearing about the centre since the press, snapped to 15° steps unless Alt is held, shown in the status line and beside the pointer; nothing SHALL turn until the pointer has moved past the drag threshold (3 px on screen), and a press released before that SHALL write nothing; the element, its selection and its connectors SHALL follow live. Releasing SHALL write `style <id> { rotation <n> }` (0 to 359), or remove it at 0, in one undo step; Escape SHALL cancel and restore the drawing.

A turned element SHALL be selected, hit, marquee-selected and dropped onto by its turned outline; its selection frame, resize handles and connection handles SHALL be drawn turned with it; resizing it SHALL work in its own frame, keeping the opposite edge where it was in the diagram, without grid snapping; its magnets and the points pinned by dragging a connector end onto it SHALL lie on its turned outline and be written as `side n%` in its own frame; the inline text editor SHALL be turned with its text. The context menu SHALL offer **Rotate 90°**, which adds 90 to the angle modulo 360, and **Reset rotation**, which removes it, each disabled where it changes nothing or the element takes no rotation.

The handle SHALL fade in with the selection. While dragging, the live rotation SHALL follow the pointer on every frame without easing, as the SVG `transform` of the element's group, and the drawn element, its selection outline and the angle badge SHALL show the same angle about the same centre at every moment, including after a live preview answers and when a preview is refused. In a diagram with `layout auto` a rotation preview or drop SHALL materialise the arrangement first, as moves do, so the turned element keeps its centre. On release the element SHALL ease into the written angle over `--mdg-motion-fast`, with the transitions dropped under `prefers-reduced-motion`.

#### Scenario: Rotate with the handle
- **WHEN** node `api` placed at (200, 120) is selected and its rotation handle is dragged a quarter turn clockwise about its centre
- **THEN** the status line names 90° and the angle shows beside the pointer, the element is drawn turned while dragging, and the release gives `style api { rotation 90 }` in one undo step, after which the status line says `api` turned to 90°

#### Scenario: A press with jitter writes nothing
- **WHEN** the rotation handle of an upright node is pressed, the pointer moves 2 px and is released
- **THEN** nothing turns, no `rotation` is written and the node is still upright

#### Scenario: The outline and the drawing agree
- **WHEN** the handle of node `api` is dragged through 45° and a live preview answers during the drag
- **THEN** at every frame the element's group and the selection outline are turned by the same angle about the same centre, and the badge shows that angle

#### Scenario: Rotate in an automatic layout
- **WHEN** node `api` of a diagram with `layout auto` is turned to 30° with the handle
- **THEN** the arrangement is written first, `api` keeps its centre during the drag and after the drop, and the text gains `style api { rotation 30 }` in the same undo step

#### Scenario: A refused preview keeps the drawing turned
- **WHEN** a rotation preview is refused while the handle is held at 60°
- **THEN** the drawing stays turned at 60° with its outline, and releasing writes `rotation 60`

#### Scenario: Free angle with Alt
- **WHEN** the handle is dragged with Alt held through 37° about the centre and released
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
