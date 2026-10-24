## ADDED Requirements

### Requirement: Pointer tool
The canvas SHALL offer a Pointer tool as a toolbar toggle (tooltip "Pointer (K)") and the key K, on every canvas that shows a diagram, read-only ones included: K or the button turns it on and off, Escape turns it off, and arming any creation or relation tool turns it off. While it is on, the canvas SHALL select, move, resize, create, connect, edit and open nothing from the pointer: a press and drag SHALL draw a trail on the presence layer, 3 px wide with round caps and joins, tapering to 1 px over its last points, each point fading out 800 ms after its own moment, in the theme's `accent` or, when the host shares presence and names the person's colour, in that colour; a point of the trail SHALL be kept in diagram units, so a pan or a zoom keeps the trail on the diagram; the cursor over the stage SHALL be a dot in the trail's colour; wheel zoom, Space-drag and middle-button pan SHALL keep working; double clicks, the right button and the context-menu key SHALL open nothing; the status line SHALL announce the tool on and off. The trail SHALL be no part of the SVG, of any export or of the HTML views. The tool SHALL write nothing and SHALL work when the canvas is read-only (its command is a view command). Under `prefers-reduced-motion: reduce` the points SHALL not fade: the trail is the stroke drawn so far, removed at once when the pointer lifts. The state SHALL not be persisted. K typed in the inline label editor or in a picker's search field SHALL stay text and SHALL not touch the tool.

#### Scenario: Point without editing
- **WHEN** K is pressed on a flow canvas, the pointer is pressed on `api`, dragged 80 px and released
- **THEN** `api` is not selected, no `place` changes, the inline editor is not open, the status line said the pointer is on, and a trail of 3 px width in the theme's accent is drawn on the presence layer and gone within a second

#### Scenario: Nothing opens while pointing
- **WHEN** the pointer is on and `api` is double-clicked, then right-clicked, then Shift+F10 is pressed
- **THEN** no inline editor and no context menu opens, and the document is unchanged

#### Scenario: Escape and K put it away
- **WHEN** the pointer is on and Escape is pressed, then K twice
- **THEN** after Escape the toggle reads not pressed and a press on `api` selects it; after the first K the pointer is on and after the second it is off

#### Scenario: Pan and zoom while pointing
- **WHEN** the pointer is on, Space is held while dragging, then Ctrl+wheel turns
- **THEN** the view pans, then zooms, and no trail is drawn by the pan

#### Scenario: On a read-only canvas
- **WHEN** the canvas is read-only and K is pressed
- **THEN** the pointer turns on, the status line announces it without the "view only" refusal, and a drag draws a trail

#### Scenario: Not exported
- **WHEN** the SVG is exported while a trail is drawn
- **THEN** the SVG holds no trail, no canvas element and nothing of the presence layer

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and a stroke is drawn and released
- **THEN** the whole stroke stays drawn until the pointer lifts, and then nothing of it remains on the next frame

#### Scenario: Arming a tool puts the pointer away
- **WHEN** the pointer is on and N is pressed on a flow canvas
- **THEN** the pointer is off, the node tool is armed, and a click creates a node

#### Scenario: K while typing a label
- **WHEN** the inline label editor of `api` is open and `k` is typed
- **THEN** the letter joins the label, the pointer stays off and no trail is drawn

### Requirement: Pointer trails of others
The `presence` host message SHALL accept, on each person, a `laser` batch `{ batch, points }` (`batch` an integer that grows with each batch of that person; `points` at most 64 entries `{ x, y, t }`, `x` and `y` in diagram units within the pointer bound, `t` an integer 0..1000 in milliseconds since the batch's first point) and an optional `me: { colour }` naming the person's own presence colour. The canvas SHALL append the points of a batch it has not drawn (by the person's cursor key and `batch`) to that person's trail, each point `t` ms after the batch arrived, drawn in the person's colour with the same width, taper and fade as the person's own trail, and SHALL draw nothing for a batch it has already drawn, a batch that does not fit the bounds, or a person without a pointer key. The canvas SHALL post `presenceLaser { points, diagram? }` to a host that shares presence while a stroke is drawn, at most every 50 ms, with the points added since the last post and `t` since the batch's first point, never to a host that does not share presence, and never as a message that writes the document. The trails SHALL clear with the presence layer (another file, nobody present, a story playing).

#### Scenario: A peer's trail
- **WHEN** the host sends `presence` with Ben's pointer at `(120, 80)` and a `laser` batch of ten points from `(120, 80)` to `(220, 80)` with `t` 0..200
- **THEN** a trail in Ben's colour appears point by point over 200 ms from the first point to the last, and fades within 800 ms of its last point

#### Scenario: The same batch twice
- **WHEN** the host sends the same `presence` message again with Ben's batch 7 unchanged
- **THEN** no point is drawn again

#### Scenario: A batch that does not fit
- **WHEN** the message carries a batch of 65 points, or a point with `t` 5000, or `x` `NaN`
- **THEN** nothing of that batch is drawn and no error is raised, and the person's cursor is still drawn

#### Scenario: The person's own colour
- **WHEN** the host sends `presence` with `me: { colour: "#e03131" }` and the pointer draws a stroke
- **THEN** the trail and the dot cursor are `#e03131`, and after a `presence` message without `me` they are the theme's accent again

#### Scenario: Points posted to the host
- **WHEN** a host that has sent `presence` sees a 300 ms stroke drawn with the pointer
- **THEN** it receives `presenceLaser` messages at most every 50 ms whose points together are the stroke, each batch's `t` starting at 0, and a host that never sent `presence` receives none
