## ADDED Requirements

### Requirement: A sharp drawing at every zoom

The canvas SHALL make its drawing a compositor layer (`will-change: transform`) only while the view
moves: from a change of the view's transform until the view has rested for 150 ms. At rest the
drawing SHALL carry no such hint, so the browser paints it at the current zoom. A render that leaves
the view where it is SHALL not make the drawing a layer.

#### Scenario: A zoom is painted again once the view rests

- **WHEN** Ctrl and the wheel zoom the canvas in, and the view then rests
- **THEN** the drawing's layer has `will-change: transform` right after the wheel, and `auto` within
  two seconds after.

#### Scenario: A render in place

- **WHEN** the text changes by a comment after the view has rested
- **THEN** the view's transform is unchanged and the drawing's `will-change` stays `auto`.
