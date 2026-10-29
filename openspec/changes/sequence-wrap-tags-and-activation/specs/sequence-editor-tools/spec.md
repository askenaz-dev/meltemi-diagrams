## ADDED Requirements

### Requirement: Activate on the toolbar
On a sequence diagram that edits, the palette SHALL offer **Activate** (its glyph a lifeline with a bar; its name "Activate the receiver", its title "Activate the receiver (Alt+A)", `aria-keyshortcuts` "Alt+A"), which SHALL run the same toggle as Alt+A on the selection. It SHALL be disabled while no message and no participant is selected, and `aria-pressed` SHALL be true while the selected message's receiver is activated after it, by a written `activate` right after it or by the call's block. A refusal SHALL be said in the status line with its reason. A read-only canvas and story mode SHALL hide the button.

#### Scenario: Activate from the toolbar
- **WHEN** `ask` is selected on `a -> b as ask; b -> c; b --> a as reply` and **Activate** is pressed
- **THEN** `activate b` follows `ask` and `deactivate b` follows `reply`, the button is pressed, and pressing it again restores the text and releases it

#### Scenario: Nothing to activate
- **WHEN** nothing is selected, or only a note
- **THEN** **Activate** is disabled and Alt+A writes nothing

#### Scenario: A call whose block activates
- **WHEN** `ask` of `a -> b as ask { return }` is selected
- **THEN** **Activate** is pressed, and pressing it writes nothing and the status line says the block of `ask` already activates `b`

#### Scenario: Read-only
- **WHEN** the canvas is read-only
- **THEN** the **Activate** button is hidden and Alt+A writes nothing

### Requirement: Activation bars on the canvas
A press on a written activation bar SHALL select its `activate` event: its outline SHALL be the bar's box, and the status line SHALL name the participant and the messages the bar spans (the message it starts at and the last message before its `deactivate`, or "the end" for an open bar). A press on the bar a call's block draws SHALL select the call. A selected written bar SHALL show a handle above its top and one below its bottom. Dragging a handle SHALL snap it to the boundary below the event row under the pointer, show while the drag goes on the drawing the session gives for the move, and on the drop post `moveActivation { id, end, row }`, which the session SHALL write as `moveEvent` with a destination: the `activate` right after the row's event for the top handle (before the first event of a call's block when the row is that call), the `deactivate` right after it for the bottom handle, and for the bottom handle of an open bar `insertEvent` of `deactivate <participant>` after it. A move the order rules refuse SHALL draw the handle in the theme's `danger` colour and give the reason in the status line during the drag, and its drop SHALL write nothing. Delete, Backspace and the bar's context-menu entry **Remove activation** SHALL remove the `activate` and its `deactivate` in one undo step. A read-only canvas SHALL select bars and show no handles.

#### Scenario: Select a bar
- **WHEN** the bar of `api` is pressed on the payment canvas
- **THEN** `activate#1` is selected, its outline is the bar, and the status line names `api` and the messages `pay` and `retry`

#### Scenario: Shorten a bar
- **WHEN** the bottom handle of `api`'s bar is dragged to the row of `authorize` on the payment canvas and released
- **THEN** `deactivate api` is written right after `api -> bank: "Autorizar" as authorize`, the bar ends at that arrow, and the drawing showed that end before the release

#### Scenario: A refused end
- **WHEN** on `a -> b as ask; activate b; b -> c as fetch; deactivate b; b --> a as reply` the top handle of `b`'s bar is dragged to the row of `reply`
- **THEN** the handle turns `danger` and the status line names `sequence.activation`'s reason while the pointer is there, and the release writes nothing

#### Scenario: Close an open bar
- **WHEN** on `a -> b as ask; activate b; b -> c as fetch; b -> c as store` the bottom handle of `b`'s bar is dragged to the row of `fetch`
- **THEN** `deactivate b` is written right after `fetch`

#### Scenario: Remove a bar
- **WHEN** `api`'s bar is selected and Delete is pressed, and in another run **Remove activation** is chosen from its context menu
- **THEN** `activate api` and `deactivate api` are both removed in one edit, and one undo brings both back

#### Scenario: The bar of a call's block
- **WHEN** the bar of `api` drawn by the block of `pay` is pressed on `corpus/valid/sequence/calls.meltemi`
- **THEN** `pay` is selected and no bar handle is shown

### Requirement: Tags on the canvas
On a sequence diagram that edits, T and the palette's **Tag** button (its title "Tag (T)"; disabled while no message and no participant is selected) SHALL add `tag "Tag"` (the word in the interface language: "Tag", "Marca") to the selected message, else to the selected participant, and SHALL open the inline editor on the new pill. A press on a pill SHALL select its owner and a drag on it SHALL drag the owner. A double click on a pill SHALL open the editor over it in the pill's font, size and colour: committing SHALL rewrite the tag, an empty text SHALL remove it, and Escape SHALL write nothing. The context menu of a pill SHALL offer **Edit tag** and **Remove tag**. With nothing to tag selected, T SHALL write nothing and the status line SHALL say to select a message or a participant. A read-only canvas SHALL hide the button and T SHALL do nothing there; T on a flow diagram SHALL keep creating a flow tag.

#### Scenario: Tag a message
- **WHEN** `authorize` is selected on the payment canvas, T is pressed, `PKCE` is typed and Enter is pressed
- **THEN** the text gains `{ tag "PKCE" }` on `authorize`'s statement, and the pill is drawn on its arrow next to `api`

#### Scenario: Tag a participant from the palette
- **WHEN** `bank` is selected and the **Tag** button is pressed, `external` is typed and Enter is pressed
- **THEN** `participant bank "Banco" { tag "external" }` is written and the badge is drawn over its head

#### Scenario: Edit a pill in place
- **WHEN** the pill `PKCE` of `authorize` is double-clicked, its text replaced by `OAuth` and Enter pressed
- **THEN** the statement reads `tag "OAuth"`; double-clicked again and emptied, the tag and its block are gone

#### Scenario: Remove from the context menu
- **WHEN** **Remove tag** is chosen in the context menu of the pill `external`
- **THEN** `tag "external"` is removed and the badge is gone

#### Scenario: Nothing selected
- **WHEN** T is pressed with nothing selected
- **THEN** nothing is written and the status line says to select a message or a participant

#### Scenario: Read-only and flow
- **WHEN** the canvas is read-only, and on another canvas T is pressed on a flow diagram
- **THEN** the read-only canvas shows no **Tag** button and T writes nothing, and the flow diagram gains `tag tag1 "Tag"` as before

### Requirement: Message labels typed where they wrap
The inline editor of a sequence message's label that wraps SHALL be exactly as wide as the label's room at the zoom, SHALL wrap its text there in the label's font, size and weight, SHALL keep its top where the label's first line is drawn, and SHALL grow down as lines are added; Shift+Enter SHALL write `\n`, Enter SHALL commit and Escape SHALL write nothing. `TextPlace.wrap` SHALL be `grow` for such a label and `shrink` for a sticky, and the canvas SHALL choose the editor by it. A self-call's label, and the label of a message whose participants are at their natural distance (it pushes them apart instead of wrapping), SHALL keep the editor that does not wrap.

#### Scenario: Typing a long label
- **WHEN** the label of a message between two neighbouring participants pulled closer by `gap` is edited and `Esto es una prueba de un texto Largo` is typed
- **THEN** the editor keeps the room's width and wraps the words where the drawing will, its first line stays where it was, and after Enter the label is drawn on the same lines

#### Scenario: A line break typed
- **WHEN** Shift+Enter is pressed after `Authorize` and `the card` is typed and committed
- **THEN** the statement's label is `"Authorize\nthe card"`

#### Scenario: A self-call's label
- **WHEN** the label of `a -> a: "Validate"` is edited
- **THEN** the editor does not wrap, as before this change

#### Scenario: A label nothing pulls
- **WHEN** the label of a message between two participants without a `gap` is edited and a long text is typed
- **THEN** the editor does not wrap, as before this change, and after Enter the label is drawn on one line with its participants pushed apart

#### Scenario: Escape writes nothing
- **WHEN** a wrapped label is edited and Escape is pressed
- **THEN** the text is unchanged and the label is drawn as before

## MODIFIED Requirements

### Requirement: Sequence canvas
On a sequence diagram the render SHALL carry `profile: "sequence"`, the participants as elements, the messages as relations (returns included), and the event rows, nested events with their call as `parent`; each message and participant with its tags and their pills (`tags`), each message with `activation` (`written` when an `activate` of its receiver follows it in its block, `block` when its block activates the receiver, absent otherwise), and each `activate` with its bar's box and its `deactivate` (`pair`). The palette SHALL offer participant (P), actor (A), message (C), note (O), fragment (F), divider, delay, tag (T) and **Activate**, and the other participant kinds in its menu.

- Dragging a participant horizontally past a neighbour's centre SHALL reorder it at the drop position (`reorderParticipant`); dragging it without crossing a neighbour's centre SHALL write its `gap` before by the distance dragged (`setSpacing`), never below 0 on the first participant, and a drag under the canvas's drag threshold SHALL write nothing. When the layout reports `layout.gap-floor` on the `gap` a drag has just written, the status line SHALL name the amount written and the amount drawn.
- Dragging a message, note or fragment vertically SHALL change its `space` before, clamped so it never passes a neighbouring event; a call dragged SHALL move its block with it.
- Alt+Up and Alt+Down SHALL move the selected event (`moveEvent`), into and out of call blocks.
- Alt+A and the **Activate** button SHALL toggle an activation of the selected participant, else of the receiver, after the selected message.
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
- **WHEN** the head of `api` is dragged 60 units left on a canvas where the longest word of the label of the message between `customer` and `api` needs the room
- **THEN** the text gains `gap api -60`, the head lands where the layout puts it, and the status line says `-60` was written and names the amount drawn

#### Scenario: A head dragged closer wraps the label
- **WHEN** on a canvas where the second actor sends `"Esto es una prueba de un texto Largo"` across the lifeline of the participant left of `participant1` to `participant1`, the head of `participant1` is dragged 24 units left, towards that neighbour
- **THEN** the text gains `gap participant1 -24`, the head lands 24 units left, the label wraps at the narrower room between the actor's and `participant1`'s lifelines, and the status line says the gap written and no amount drawn

#### Scenario: Nest with Alt+N
- **WHEN** `authorize` and the reply after it are selected and Alt+N is pressed on `customer -> api: "Pay" as pay` followed by them
- **THEN** both statements are inside `pay`'s block, the bar of `api` spans them, and Alt+R then appends `return` to the block

#### Scenario: Nothing to nest in
- **WHEN** the first event of the diagram is selected and Alt+N is pressed
- **THEN** nothing is written and the status line says to select the events right after the call they belong to

#### Scenario: The palette of a sequence diagram
- **WHEN** a sequence diagram is shown on a canvas that edits
- **THEN** the palette shows **Tag** with the title "Tag (T)" and **Activate** with the title "Activate the receiver (Alt+A)", both disabled until a message or a participant is selected

### Requirement: Sequence inspector and scenarios
The inspector SHALL show for messages their kind (call, reply, async; `return` for a return, read-only, with **From** and **To** read-only), **Space before**, **Space after**, **Activates the receiver** and **Tags**; for notes their text and position; for fragments their operator and branch conditions; for participants their kind, **Gap before**, **Gap after** and **Tags**; for the diagram `autonumber` and **Participant spacing** (`spacing`, placeholder 40). **Gap before** SHALL accept a negative number except on the first participant, **Gap after** except on the last, and the space fields SHALL accept 0 or more; a refused number SHALL be reported with a reason. **Activates the receiver** SHALL be a checkbox, absent on a `return`, that writes or removes the `activate`/`deactivate` pair of the receiver after the message (`toggleActivation`); on a call whose block activates the receiver it SHALL be checked and read-only, with the reason under it. **Tags** SHALL be an ordered list: one text field per tag, which rewrites it and, emptied, removes it, with a **Remove** button, followed by an empty field whose text adds a tag at the end; an empty or repeated text SHALL be refused with a reason. The canvas toolbar SHALL offer a scenario picker when the diagram has scenarios, which previews the scenario read-only. The Export SVG command SHALL ask for "All events" or a scenario.

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
- **THEN** **Message** reads `return` and is read-only, **From** and **To** are read-only, **Space before** writes `space` for it, and **Activates the receiver** is not shown

#### Scenario: Activates the receiver
- **WHEN** `ask` is selected on `a -> b as ask; b -> c; b --> a as reply` and **Activates the receiver** is checked, then unchecked
- **THEN** `activate b` and `deactivate b` are written after `ask` and `reply`, then removed

#### Scenario: A call's block activates
- **WHEN** `pay` of `corpus/valid/sequence/calls.meltemi` is selected
- **THEN** **Activates the receiver** is checked and read-only, and the text under it says the block of `pay` activates `api`

#### Scenario: Tags in the inspector
- **WHEN** `authorize` is selected, `PKCE` is typed in the empty field of **Tags**, then `v2`, and the **Remove** button of `PKCE` is pressed
- **THEN** the text gains `tag "PKCE"` and `tag "v2"` in that order in `authorize`'s block, and then only `tag "v2"` remains

#### Scenario: A repeated tag in the inspector
- **WHEN** `v2` is typed in the empty field of **Tags** of a message that has the tag `v2`
- **THEN** nothing is written and the reason says the message already has that tag

### Requirement: Sequence language services
Completion SHALL offer the sequence statements, participants after arrows and in events, fragment ids and branch conditions in scenarios, `kind async`, and, in sequence diagrams, `return` with the properties inside a message block, `tag` among the properties of a message block and of a participant block (never in a group block or a fragment), `before` and `after` after the amount of `space` and `gap`, and `spacing` among the diagram properties. Hover SHALL describe events and scenarios, a `return` as a reply that answers its call, the place of a nested event as its call, and a tag as a tag of its message or participant. Go to definition, references and rename SHALL follow the ids of notes and fragments, including from scenarios, `space` and `style`. Document symbols SHALL list notes, fragments and scenarios. Quick fixes SHALL declare an unknown participant and remove a `deactivate` reported by `sequence.activation`, or add the missing `activate`.

#### Scenario: Branch completion
- **WHEN** completion runs after `choose check "` in a scenario
- **THEN** the items are the conditions of `check`'s branches

#### Scenario: Completion in a call block
- **WHEN** completion runs on an empty line inside `customer -> api: "Pay" {` in a sequence diagram
- **THEN** the items include `return`, `kind`, `description`, `assumption`, `class`, `tag`, the fragment operators and `note`; after `gap bank 40 ` they are `before` and `after`

#### Scenario: Hover on a return
- **WHEN** the pointer rests on `return "OK" as ok` inside `pay`'s block
- **THEN** the hover describes a reply from `api` to `customer` that returns from `pay`

#### Scenario: No return outside a sequence diagram
- **WHEN** completion runs inside a relation block of a flow diagram
- **THEN** `return` is not offered

#### Scenario: Completion in a participant block
- **WHEN** completion runs on an empty line inside `participant bank "Bank" {` in a sequence diagram
- **THEN** the items include `tag`, `description`, `class` and `link`

#### Scenario: No tag in a group block
- **WHEN** completion runs on an empty line inside `group core "Core" {` in a sequence diagram
- **THEN** `tag` is not offered

#### Scenario: Hover on a tag
- **WHEN** the pointer rests on `tag "PKCE"` inside the block of `api -> bank: "Authorize" as authorize`
- **THEN** the hover says it is a tag of the message `authorize`
