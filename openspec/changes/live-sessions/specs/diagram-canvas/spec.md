## MODIFIED Requirements

### Requirement: Other people's selections
The canvas SHALL accept a `presence` host message with people (name, colour, selected element
ids, and a pointer `{ x, y }` in diagram units when the person's pointer is over their canvas)
and draw, on a layer above the scene, a coloured outline with a name tag around each element
another person has selected, and a cursor glyph in the person's colour with the name tag at its
tail at each pointer, the name set as a text node; the cursor SHALL move to a new position
with a 200 ms transition and SHALL scale with the scene, so that it points at the same place
at every zoom; the layer SHALL be neither selectable nor exported, SHALL clear when the message
carries nobody or the canvas shows another file, SHALL draw nothing while a story plays, and
SHALL ignore ids the scene does not hold and pointers that are not two finite numbers.

#### Scenario: Outline with a name
- **WHEN** the host sends `presence` with Ben selecting `api`
- **THEN** `api` shows an outline in Ben's colour with the tag `Ben`, and clicking it selects `api` for the person, not Ben's outline

#### Scenario: A cursor with a name
- **WHEN** the host sends `presence` with Ben's pointer at `(120, 80)` and then at `(220, 80)`
- **THEN** a cursor in Ben's colour tagged `Ben` is drawn at the first point and glides to the second, and a click through it reaches the element under it

#### Scenario: A cursor at every zoom
- **WHEN** the canvas is zoomed to 50% and the host sends Ben's pointer at `(120, 80)`
- **THEN** the cursor's tip is at the scene point `(120, 80)` and the glyph keeps its size on screen

#### Scenario: Unknown element
- **WHEN** the message names an id the scene lacks, or a pointer with `NaN`
- **THEN** nothing is drawn for it and no error is raised

#### Scenario: A name holding markup
- **WHEN** the message carries the name `<img src=x>` selecting `api` with a pointer
- **THEN** both tags show those characters and the layer holds no element made from them

#### Scenario: Not exported
- **WHEN** the SVG is exported while a cursor is drawn
- **THEN** the SVG holds no cursor, tag or name
