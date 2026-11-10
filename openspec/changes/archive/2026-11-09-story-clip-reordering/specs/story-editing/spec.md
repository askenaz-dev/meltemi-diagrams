## ADDED Requirements

### Requirement: Reversible action sequence reordering

`reorderStoryAction { story, path, index }` SHALL move one top-level action within its original
scene to final sibling `index`, preserving all action durations, targets and parallel nesting.
It SHALL preserve comments, line endings and unrelated source, refuse malformed/ambiguous
boundaries, invalid integer/index inputs and nested action paths, and compile the result before
applying it. A no-op SHALL produce no edits; undo SHALL restore the source byte for byte.

#### Scenario: Move a later action earlier

- **WHEN** a three-action scene moves its last action to index zero
- **THEN** the new sequence contains that action first with all durations unchanged, the same
  scene total and a reversible source edit, while its diagram and other scenes are untouched

#### Scenario: Preserve comments and inline syntax

- **WHEN** an action with attached comments is moved in LF, CRLF or semicolon-separated source
- **THEN** its comments remain associated, all source stays valid, and undo restores every byte

#### Scenario: Move parallel content atomically

- **WHEN** a top-level parallel block is moved before another action
- **THEN** its complete nested content moves together and its children retain simultaneous starts

#### Scenario: Refuse unsafe paths

- **WHEN** a nested path, invalid index or malformed story source is submitted
- **THEN** no source edit is applied and a stable edit diagnostic explains the refusal

### Requirement: Timeline clip insertion gesture

The shared timeline SHALL reorder a movable action by dragging its body to a boundary between
top-level siblings of the same scene, with a destination marker, candidate start and unchanged
duration. It SHALL distinguish click/selection from drag and duration resizing, expose a labelled
movable parallel header, and keep child bodies, transitions and view headers out of reordering.
The drop SHALL create one undoable edit. It SHALL offer keyboard and labelled button alternatives.

#### Scenario: Body drag and right handle have distinct meanings

- **WHEN** the body is dragged across another action and released
- **THEN** source order changes while durations and scene total stay unchanged
- **WHEN** its right handle is dragged instead
- **THEN** only the existing duration edit is requested and no reorder is emitted

#### Scenario: Keep the selected action after acknowledgement

- **WHEN** a selected action moves to another sibling index and its edit is acknowledged
- **THEN** the selection and duration field refer to the moved action at its new path

#### Scenario: Keyboard and touch alternatives

- **WHEN** an author uses Move earlier/later or Alt+Left/Right on a movable action
- **THEN** the same guarded reversible operation runs
- **WHEN** a touch gesture is vertical before horizontal drag recognition
- **THEN** track scrolling remains available without a source write

### Requirement: Cancel stale or abandoned clip moves

Reorder gestures SHALL capture their playback, document and revision and preview without source
writes. Escape, cancellation, lost pointer capture, a read-only switch, an outside drop or a
source/document/story change SHALL remove transient state and commit nothing. Refused edits
SHALL restore the original visual sequence and announce the refusal.

#### Scenario: Source changes during a drag

- **WHEN** another edit or navigation changes the source revision or document during a clip move
- **THEN** releasing the pointer does not apply its old positional path to the new source

#### Scenario: Abandon a preview

- **WHEN** the author presses Escape, loses capture or drops outside its scene
- **THEN** the marker and preview disappear and the source remains identical
