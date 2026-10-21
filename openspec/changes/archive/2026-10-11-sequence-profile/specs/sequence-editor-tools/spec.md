## ADDED Requirements

### Requirement: Sequence canvas
On a sequence diagram the render SHALL carry `profile: "sequence"`, the participants as elements, the messages as relations, and the event rows. The palette SHALL offer participant (P), actor (A), message (C), note (O), fragment (F) and divider, and the other participant kinds in its menu.

- Dragging a participant horizontally SHALL reorder it at the drop position (`reorderParticipant`).
- Dragging a message, note or fragment vertically SHALL change its `space`, clamped so it never passes a neighbouring event.
- Alt+Up and Alt+Down SHALL move the selected event (`moveEvent`).
- Alt+A SHALL toggle an activation of the selected participant after the selected message.

#### Scenario: Drag a participant
- **WHEN** the head of `bank` is dropped left of `customer` on the payment canvas
- **THEN** `bank` is declared first and the messages are unchanged

#### Scenario: Drag a message down
- **WHEN** the arrow of `authorize` is dragged 28 units down
- **THEN** the text gains `space authorize 28`

### Requirement: Sequence inspector and scenarios
The inspector SHALL show for messages their kind (call, reply, async) and space before; for notes their text and position; for fragments their operator and branch conditions; for participants their kind and gap; for the diagram `autonumber`. The canvas toolbar SHALL offer a scenario picker when the diagram has scenarios, which previews the scenario read-only. The Export SVG command SHALL ask for "All events" or a scenario.

#### Scenario: Preview a scenario
- **WHEN** the scenario `approved` is picked on the payment canvas
- **THEN** the canvas shows the approved path and refuses edits until "All events" is picked again

### Requirement: Sequence language services
Completion SHALL offer the sequence statements, participants after arrows and in events, fragment ids and branch conditions in scenarios, and `kind async`. Hover SHALL describe events and scenarios. Go to definition, references and rename SHALL follow the ids of notes and fragments, including from scenarios, `space` and `style`. Document symbols SHALL list notes, fragments and scenarios. Quick fixes SHALL declare an unknown participant and remove a `deactivate` reported by `sequence.activation`, or add the missing `activate`.

#### Scenario: Branch completion
- **WHEN** completion runs after `choose check "` in a scenario
- **THEN** the items are the conditions of `check`'s branches
