## ADDED Requirements

### Requirement: Pointer trails in presence
While the person draws with the canvas's Pointer tool, the page SHALL publish the trail's points in the same presence state, at the same 250 ms throttle and in the same message as the caret, the canvas selection and the pointer, as `canvas.laser: { diagram?, points }`: at most 64 points `{ x, y, t }`, `x` and `y` integers in diagram units, `t` an integer in milliseconds since the batch's first point, at most 1000; a batch that leaves the page SHALL be forgotten (a heartbeat resends no batch, and a state without a stroke carries no `laser`), and a `canvas` part MAY hold a laser alone. The page SHALL show the others' batches as trails in their colour on the canvas of the diagram the batch names, each point at its own moment within the batch and fading as the person's own trail does, once per batch, and SHALL show nothing for a batch over the bounds. The person's own colour SHALL be told to the canvas, so the person's trail is drawn in it. Nothing of a trail SHALL be exported or saved, and no message SHALL be sent for a trail beyond the presence state.

#### Scenario: A trail over the canvas
- **WHEN** Ben turns the pointer on and draws a stroke over the canvas of the file Ana has open
- **THEN** Ana's canvas shows the stroke as a trail in Ben's colour, appearing within half a second and fading within a second of its end, and the room counted no more messages for it than for Ben's caret

#### Scenario: A trail in another diagram
- **WHEN** Ben draws over diagram `b` of a file whose diagram `a` Ana's canvas shows
- **THEN** Ana's canvas draws no trail

#### Scenario: The batch leaves once
- **WHEN** Ben draws a stroke and then stays still for twenty seconds
- **THEN** the state Ben's page sends after the stroke carries the points, the heartbeat fifteen seconds later carries no `laser`, and Ana's canvas draws the stroke once

#### Scenario: A batch that does not fit is ignored
- **WHEN** a client sends a state whose `canvas.laser` has 200 points, or a point with `t` 4000
- **THEN** Ana's page draws no trail for it and still shows that client's selection and pointer

#### Scenario: Not in exports
- **WHEN** Ana exports the diagram as SVG while Ben's trail is drawn
- **THEN** the SVG carries nothing of it
