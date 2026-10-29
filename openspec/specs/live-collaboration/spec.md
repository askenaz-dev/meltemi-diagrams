# live-collaboration Specification

## Purpose
Working together live in a shared project: presence (who is here, carets, selections, canvas outlines) relayed by the room and never stored, simultaneous editing with own-edits undo, joining and the room limit, and the connection states.
## Requirements
### Requirement: Presence
In a cloud project the page SHALL publish the open file, the caret or selection (as relative
positions), the canvas selection and the pointer's position over the canvas (`canvas.pointer:
{ x, y }`, integers in diagram units, while it moves and dropped three seconds after it stops
or when it leaves the canvas), on change at most every 250 ms and every fifteen seconds as a
heartbeat, and SHALL show the others: avatars and names with a colour per person in the
header, a badge on guests, their carets and selections in the code pane (moving with
concurrent edits, name flags fading after two seconds), their canvas selections outlined with
a name tag, and their pointers as a cursor in their colour with the name tag, moved with a
200 ms transition. Each person's identity (`sub`, name, picture, colour, guest) SHALL be the
one the room attaches to their messages, never one taken from a peer's payload, and names
SHALL be rendered as text nodes; a person SHALL disappear within thirty seconds of silence.
Nothing of presence SHALL be exported or saved.

#### Scenario: Two people in one file
- **WHEN** Ana and Ben have the same file open and Ben selects a word
- **THEN** Ana's pane shows Ben's selection in his colour with his name, and Ana's header shows Ben

#### Scenario: A pointer over the canvas
- **WHEN** Ben moves his pointer over the canvas of the file Ana has open
- **THEN** Ana's canvas shows a cursor in Ben's colour tagged `Ben` that follows within half a second, and it is gone three seconds after Ben stops

#### Scenario: A pointer in another file
- **WHEN** Ben's pointer moves over a file Ana does not have open
- **THEN** Ana's canvas draws no cursor for Ben

#### Scenario: Gone after silence
- **WHEN** Ben's browser is closed without a clean disconnect
- **THEN** Ana stops seeing Ben within thirty seconds

#### Scenario: Not in exports
- **WHEN** Ana exports the diagram as SVG while Ben has an element selected and his pointer over it
- **THEN** the SVG carries no outline, cursor, tag or name of Ben

#### Scenario: A name that looks like markup
- **WHEN** a person whose name is `<b>Ben</b>` publishes a caret, a pointer and a canvas selection
- **THEN** the header, the name flag, the cursor's tag and the canvas tag show those characters as they are and no element is created from them

#### Scenario: A guest in the header
- **WHEN** a guest named "Guest 37" is in the room
- **THEN** Ana's header lists "Guest 37" with a guest badge and no picture

### Requirement: Editing together
Two people editing the same file at the same time SHALL converge to the same text with every
character of both kept, canvas edits and typing SHALL interleave, each person's undo SHALL undo
only their own edits, and the analysis and the canvas SHALL follow every change.

#### Scenario: Same line at once
- **WHEN** Ana and Ben type different words at the same position of the same line within the same second
- **THEN** both pages show the same line holding both words, and each person's Ctrl+Z removes their own word only

#### Scenario: A drag and a keystroke
- **WHEN** Ana drags an element while Ben types in the same file
- **THEN** both pages hold Ana's new `place` line and Ben's text, and both canvases show the element moved

#### Scenario: One person's transaction refused
- **WHEN** Ana's edit would take a text over its limit and the room answers her with kind 4 `doc.too-large`
- **THEN** Ben's document is unchanged, Ana's status line names the limit and her text returns to the room's state, and both keep editing afterwards

### Requirement: Joining and limits
A signed-in person the project admits as editor SHALL join the room by opening the project's
link; a viewer, signed in or not, SHALL see presence and may not write; a guest with a live
session's link SHALL join with the role the session gives (`live-sessions`); the twenty-first
person SHALL be refused with `room.full` and the page SHALL say so, guests and viewers giving
up their place to an owner or editor; the eleventh connection without an account from one
address SHALL be refused with `connections.limit` and the page SHALL say so. The status line
SHALL show connected, reconnecting (backoff from one to thirty seconds) or offline, and edits
made while reconnecting SHALL merge on return; a guest whose session ended SHALL be told so
and SHALL not reconnect with the token.

#### Scenario: Reconnecting
- **WHEN** Ana's connection drops for ten seconds while she types and Ben edits another line
- **THEN** her status line says reconnecting, then connected, and both pages hold both edits

#### Scenario: Room full
- **WHEN** twenty people are in the room and a twenty-first opens the link
- **THEN** the page says the room is full and offers to retry

#### Scenario: Too many from one address
- **WHEN** ten guest tabs from one address are open and an eleventh opens the live link
- **THEN** the eleventh says too many connections from this network and does not retry by itself

#### Scenario: The session ended
- **WHEN** the owner ends the session while a guest types
- **THEN** the guest's status line says the live session ended and the page does not reconnect with the token

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

### Requirement: Strokes being drawn in presence
While the person draws with the canvas's pen or highlighter, the page SHALL publish the stroke's points as the pointer trail is published (`canvas.laser`, the same throttle, the same message, the same bounds on the points) with a `pen: { width, colour, opacity, stroke, cancel? }` part (`width` an integer from 1 to 64, `colour` a string of at most 32 characters, `opacity` a number from 0 to 1, `stroke` an integer from 0 to 2,147,483,647 that the person's page increases with each stroke, and `cancel` true on the batch that ends a stroke cancelled with Escape). The room SHALL parse the part with those bounds and SHALL invalidate the message when it does not fit, as any bad part does. A peer's page SHALL show the batches of one stroke (the same `stroke` number) as one growing stroke, never joined to another, in the given colour, width and opacity; it SHALL drop a stroke at once when its `cancel` batch arrives; and it SHALL show them on the canvas of the diagram the batch names, kept until the document changes after the last batch or ten seconds pass, so the stroke is replaced by the pen statement the release writes. Nothing of it SHALL be in an export.

#### Scenario: A guest draws for the owner
- **WHEN** a guest of a live session presses P and drags a stroke on the canvas the owner has open
- **THEN** the owner's canvas shows the stroke growing in the colour of the guest's pen within half a second, and within a second of the release the owner's file holds the guest's `pen` statement and the presence stroke is gone

#### Scenario: A highlighter seen by a peer
- **WHEN** Ben draws with the highlighter over Ana's canvas
- **THEN** Ana sees a translucent 20 px stroke in the highlight colour, not a fading trail

#### Scenario: A pen part over the bounds
- **WHEN** a client sends a state whose `canvas.laser.pen` has `width` 0 or a `colour` of 100 characters
- **THEN** the room drops the message and the client's earlier selection and pointer stay shown

#### Scenario: Bounded traffic
- **WHEN** a guest draws for ten seconds without pause
- **THEN** the room counted no more awareness messages from the guest than the throttle allows, and none over 16 KiB

