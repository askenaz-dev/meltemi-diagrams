## ADDED Requirements

### Requirement: Continuous manipulation across asynchronous renders

The canvas SHALL keep a dragged component and its selection at the current pointer position
while previews arrive and until the committed move is rendered. A drop MUST create only one
source edit when it changes the document, and preserve unrelated source and comments.

#### Scenario: Delayed preview and committed render

- **WHEN** the pointer moves beyond an outstanding preview and the user drops the component
- **THEN** the drawing and outline stay at the final position throughout the reply delay
- **AND** the confirmed render replaces that transient position without a jump
- **AND** one source edit preserves comments and unrelated source.

#### Scenario: Cancel or reject the gesture

- **WHEN** a gesture is cancelled or its edit is refused and an old preview later arrives
- **THEN** the canvas shows the current source geometry and ignores the old preview
- **AND** cancellation writes no source edit.

#### Scenario: Old revision while a drop is pending

- **WHEN** a render and its story-list refresh arrive at the move's original revision
- **THEN** the canvas keeps the dropped drawing and selection together
- **AND** queued nudges remain queued until the pending edit is resolved.

#### Scenario: A move changes nothing

- **WHEN** movement crosses the drag threshold but snaps to zero, returns to its origin, or drops
  a list card at its unchanged index
- **THEN** no source edit or pending move is created
- **AND** the next selection or edit works immediately.

#### Scenario: View-only access while a drop is pending

- **WHEN** the host switches the canvas to view-only while a dropped move awaits its result
- **THEN** the transient edit geometry is discarded and the selection follows the current source.

### Requirement: Recognizable rotation control

The rotation handle SHALL show an arc arrow with a hit target of at least 24 screen pixels,
retain its localized label, and preserve the existing stepped and Alt-modified rotation.

#### Scenario: Select and rotate a component

- **WHEN** the user selects a rotatable component
- **THEN** its rotation handle is visibly distinct from resize and connection handles
- **AND** dragging the arc arrow rotates the component with the existing snapping behavior.

### Requirement: Canvas depth without source changes

Solid components SHALL receive a subtle shadow in the canvas, including live previews, without
changing their exported SVG or source. Text, lines, pen strokes and enclosing groups SHALL NOT
receive this additional shadow; sticky notes SHALL keep their existing shadow without an
additional one, and authored filters SHALL remain effective.

#### Scenario: Preview and export a component

- **WHEN** a solid component is drawn, moved and exported
- **THEN** the canvas and its preview show the same subtle depth
- **AND** the export and source contain no added canvas shadow.
