## ADDED Requirements

### Requirement: Editing a pen stroke
A pen SHALL be caught by its stroke (within 6 screen pixels of its drawn path) and by a selection rectangle that contains its bounds, and SHALL be skipped by a press on the stage that hits nothing else only when it is not under the pointer. Selected, it SHALL show its bounds as the frame with the eight resize handles, and no rotation, connection, point or label handles. Dragging it by its stroke, or the arrow keys, SHALL move every point (`setPenPoints`, one undo step, the grid not applied); a resize handle SHALL scale the points about the opposite side or corner (Shift keeping the proportions, the bounds at least 4 units) and the outline SHALL follow the pointer at every frame. Enter, F2 and a double click SHALL do nothing on a pen (it has no text), Shift+F2 SHALL rename its id, Delete SHALL remove it with its styles and animations, copying and Duplicate SHALL shift its points as a line's, alignment and distribution SHALL leave it out, and the element SHALL tell assistive technology it is a stroke with its point count.

#### Scenario: Selected by its stroke
- **WHEN** the stage is pressed on the path of `pen1` and released
- **THEN** `pen1` is selected, its frame is its bounds, eight resize handles show and no rotation handle

#### Scenario: Moved by its stroke
- **WHEN** `pen1` is dragged by its stroke 30 to the right
- **THEN** every point of `pen pen1 [...]` is 30 greater in x, in one undo step, and nothing snapped

#### Scenario: Scaled
- **WHEN** the south-east handle of `pen1` is dragged so its bounds double in width and height
- **THEN** every point is mapped about the north-west corner, the path is twice as large, and one undo restores it

#### Scenario: Nudged and deleted
- **WHEN** Right is pressed with `pen1` selected and then Delete
- **THEN** every point moves 1 to the right, and the pen with its `style pen1 { … }` is gone

#### Scenario: A double click on a stroke
- **WHEN** `pen1` is double-clicked
- **THEN** no editor opens and the selection is unchanged

### Requirement: Strokes of others
The `presence` host message's `laser` batch MAY carry `pen: { width, colour, opacity, stroke, cancel? }` (`width` 1 to 64, `colour` a string of at most 32 characters, `opacity` 0 to 1, `stroke` an integer from 0 to 2,147,483,647 numbering the person's strokes, `cancel` true when the stroke was cancelled). The canvas SHALL draw the batches of one `stroke` as one stroke in that width, colour and opacity on the presence layer, growing as its points arrive and not fading and never joined to the person's previous stroke, whether or not the person's pointer is still shown, SHALL drop it at once on its `cancel` batch, and SHALL otherwise keep it until a `render` host message arrives after its last batch or ten seconds pass, whichever comes first; a batch whose `pen` part does not fit SHALL be dropped whole. While a stroke is drawn with the pen or the highlighter, the canvas SHALL post `presenceLaser` with the same `pen` part to a host that shares presence, at the pointer's cadence, with a new `stroke` number for each stroke, and SHALL post a batch with `cancel` when Escape cancels the stroke.

#### Scenario: A peer's stroke grows
- **WHEN** the host sends `presence` with Ben's `laser` batch of ten points and `pen: { width: 4, colour: "#e03131", opacity: 1 }`, then a second batch of ten more
- **THEN** a 4 px red stroke is drawn through the first ten points, then through all twenty, and it is still drawn after two seconds

#### Scenario: The stroke gives way to the document
- **WHEN** a `render` host message arrives after Ben's last batch
- **THEN** Ben's presence stroke is gone and the rendered scene holds his pen

#### Scenario: A pen part that does not fit
- **WHEN** a batch carries `pen: { width: 900, colour: "#e03131", opacity: 1 }`
- **THEN** nothing of that batch is drawn and Ben's cursor is still drawn

#### Scenario: Posted while drawing
- **WHEN** a host that has sent `presence` sees a 300 ms stroke drawn with the highlighter
- **THEN** it receives `presenceLaser` messages at most every 50 ms whose `pen` part is `{ width: 20, colour: "<the highlight colour>", opacity: 0.35 }`
