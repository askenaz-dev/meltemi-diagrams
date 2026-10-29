# sequence-editor-tools Specification

## Purpose
The canvas, the inspector, the language services and the commands for sequence diagrams in the editor.
## Requirements
### Requirement: Sequence canvas
On a sequence diagram the render SHALL carry `profile: "sequence"`, the participants as elements, the messages as relations (returns included), and the event rows, nested events with their call as `parent`. The palette SHALL offer participant (P), actor (A), message (C), note (O), fragment (F) and divider, and the other participant kinds in its menu.

- Dragging a participant horizontally past a neighbour's centre SHALL reorder it at the drop position (`reorderParticipant`); dragging it without crossing a neighbour's centre SHALL write its `gap` before by the distance dragged (`setSpacing`), never below 0 on the first participant, and a drag under the canvas's drag threshold SHALL write nothing. When the layout reports `layout.gap-floor` on the `gap` a drag has just written, the status line SHALL name the amount written and the amount drawn.
- Dragging a message, note or fragment vertically SHALL change its `space` before, clamped so it never passes a neighbouring event; a call dragged SHALL move its block with it.
- Alt+Up and Alt+Down SHALL move the selected event (`moveEvent`), into and out of call blocks.
- Alt+A SHALL toggle an activation of the selected participant after the selected message.
- Alt+N SHALL nest the selected events in the call before them (`nestInCall`), Alt+Shift+N SHALL unnest the selected call or the call around the selected event (`unnestCall`), and Alt+R SHALL append a `return` to it (`insertEvent` inside the call); the context menu SHALL offer the three beside **Activate the receiver**, and a selection that is not right after a call SHALL be refused with a reason.

#### Scenario: Drag a participant
- **WHEN** the head of `bank` is dropped left of `customer` on the payment canvas
- **THEN** `bank` is declared first and the messages are unchanged

#### Scenario: Drag a message down
- **WHEN** the arrow of `authorize` is dragged 28 units down
- **THEN** the text gains `space authorize 28`

#### Scenario: A short drag writes a gap
- **WHEN** the head of `bank` is dragged 24 units right, not past any centre, on the payment canvas
- **THEN** the text gains `gap bank 24` and the order of the participants is unchanged; dragged 24 units back, the `gap` is removed

#### Scenario: The first head dragged left
- **WHEN** the head of `customer`, the first participant, is dragged 30 units left
- **THEN** nothing is written and the head returns to its place

#### Scenario: The floor wins on the canvas
- **WHEN** the head of `api` is dragged 60 units left on a canvas where the label of the message between `customer` and `api` needs the room
- **THEN** the text gains `gap api -60`, the head lands where the layout puts it, and the status line says `-60` was written and names the amount drawn

#### Scenario: Nest with Alt+N
- **WHEN** `authorize` and the reply after it are selected and Alt+N is pressed on `customer -> api: "Pay" as pay` followed by them
- **THEN** both statements are inside `pay`'s block, the bar of `api` spans them, and Alt+R then appends `return` to the block

#### Scenario: Nothing to nest in
- **WHEN** the first event of the diagram is selected and Alt+N is pressed
- **THEN** nothing is written and the status line says to select the events right after the call they belong to

### Requirement: Sequence inspector and scenarios
The inspector SHALL show for messages their kind (call, reply, async; `return` for a return, read-only, with **From** and **To** read-only), **Space before** and **Space after**; for notes their text and position; for fragments their operator and branch conditions; for participants their kind, **Gap before** and **Gap after**; for the diagram `autonumber` and **Participant spacing** (`spacing`, placeholder 40). **Gap before** SHALL accept a negative number except on the first participant, **Gap after** except on the last, and the space fields SHALL accept 0 or more; a refused number SHALL be reported with a reason. The canvas toolbar SHALL offer a scenario picker when the diagram has scenarios, which previews the scenario read-only. The Export SVG command SHALL ask for "All events" or a scenario.

#### Scenario: Preview a scenario
- **WHEN** the scenario `approved` is picked on the payment canvas
- **THEN** the canvas shows the approved path and refuses edits until "All events" is picked again

#### Scenario: Participant spacing
- **WHEN** nothing is selected on the payment canvas and **Participant spacing** is set to 56
- **THEN** the text gains `spacing 56` among the diagram's properties, and clearing the field removes it

#### Scenario: Gap after and a negative gap before
- **WHEN** `bank` is selected and **Gap after** is set to 50, then **Gap before** to -12
- **THEN** the text gains `gap bank 50 after` and `gap bank -12`

#### Scenario: A negative gap before the first participant
- **WHEN** `customer`, the first participant, is selected and **Gap before** is set to -12
- **THEN** nothing is written and the reason says there is nothing left of `customer` to tighten

#### Scenario: A return in the inspector
- **WHEN** the `return` of a call is selected
- **THEN** **Message** reads `return` and is read-only, **From** and **To** are read-only, and **Space before** writes `space` for it

### Requirement: Sequence language services
Completion SHALL offer the sequence statements, participants after arrows and in events, fragment ids and branch conditions in scenarios, `kind async`, and, in sequence diagrams, `return` with the properties inside a message block, `before` and `after` after the amount of `space` and `gap`, and `spacing` among the diagram properties. Hover SHALL describe events and scenarios, a `return` as a reply that answers its call, and the place of a nested event as its call. Go to definition, references and rename SHALL follow the ids of notes and fragments, including from scenarios, `space` and `style`. Document symbols SHALL list notes, fragments and scenarios. Quick fixes SHALL declare an unknown participant and remove a `deactivate` reported by `sequence.activation`, or add the missing `activate`.

#### Scenario: Branch completion
- **WHEN** completion runs after `choose check "` in a scenario
- **THEN** the items are the conditions of `check`'s branches

#### Scenario: Completion in a call block
- **WHEN** completion runs on an empty line inside `customer -> api: "Pay" {` in a sequence diagram
- **THEN** the items include `return`, `kind`, `description`, `assumption`, `class`, the fragment operators and `note`; after `gap bank 40 ` they are `before` and `after`

#### Scenario: Hover on a return
- **WHEN** the pointer rests on `return "OK" as ok` inside `pay`'s block
- **THEN** the hover describes a reply from `api` to `customer` that returns from `pay`

#### Scenario: No return outside a sequence diagram
- **WHEN** completion runs inside a relation block of a flow diagram
- **THEN** `return` is not offered

