## ADDED Requirements

### Requirement: One finger on the canvas

A finger (a pointer of type `touch`) pressed on the empty canvas, on anything not selected, or
anywhere on a read-only canvas SHALL pan the view by its whole movement once that reaches 8 screen
pixels, drawing no selection band; released before, it SHALL tap, selecting what it pressed or
nothing. A finger on a handle, or on a selected element, label or spaced sequence event of a canvas
that edits, SHALL take hold of it as a mouse press does. Mouse and stylus input SHALL keep their
behaviour.

#### Scenario: A finger pans the empty canvas

- **WHEN** a finger is pressed on the empty canvas and dragged 60 px right and 40 px up
- **THEN** the view moves by (60, −40) at the same zoom, no selection band is drawn, nothing is
  selected and nothing is written.

#### Scenario: A tap selects, and a drag moves what is selected

- **WHEN** a finger taps `api`, then drags from `db`, which is not selected, then drags `api` by
  (56, 28) diagram units
- **THEN** the tap selects `api`, the drag from `db` pans and keeps `api` selected, and the drag of
  `api` writes one move that places it 56 and 28 units further.

#### Scenario: A read-only canvas

- **WHEN** the canvas is read-only and a finger taps `api`, then drags from it
- **THEN** `api` is selected, and the drag pans the view and writes nothing.

#### Scenario: The mouse keeps its band

- **WHEN** on a touch screen the mouse is dragged on the empty canvas
- **THEN** it draws a selection band and the view does not move.

### Requirement: Two fingers on the canvas

A second finger SHALL let go of what the first began, writing nothing, except a stroke of the pen,
the highlighter or the eraser, which keeps its finger. The two SHALL zoom the view by the ratio of
their spread around their starting midpoint, between 10 % and 800 %, and pan it with their
midpoint. When one lifts, the other SHALL pan on and select nothing at its release; a third finger
SHALL add nothing.

#### Scenario: Two fingers pinch

- **WHEN** two fingers 80 px apart on the empty canvas spread to 160 px
- **THEN** the zoom doubles and the diagram point under their midpoint stays under it
- **AND WHEN** one lifts and the other moves by (30, 20) and lifts over an element
- **THEN** the view pans by (30, 20) and nothing is selected.

#### Scenario: A second finger during a move

- **WHEN** a finger drags the selected `api` and a second finger is pressed
- **THEN** `api` goes back to where it was, nothing is written, and the two fingers zoom the view.

#### Scenario: A stroke keeps its finger

- **WHEN** a finger draws with the pen and a second finger is pressed and moved
- **THEN** the view neither zooms nor pans, and the release writes one stroke.
