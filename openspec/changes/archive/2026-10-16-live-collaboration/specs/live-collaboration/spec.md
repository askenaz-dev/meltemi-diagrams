## ADDED Requirements

### Requirement: Presence
In a cloud project the page SHALL publish the open file, the caret or selection (as relative
positions) and the canvas selection, on change at most every 250 ms and every fifteen seconds
as a heartbeat, and SHALL show the others: avatars and names with a colour per person in the
header, their carets and selections in the code pane (moving with concurrent edits, name flags
fading after two seconds), and their canvas selections outlined with a name tag. Each person's
identity (`sub`, name, picture, colour) SHALL be the one the room attaches to their messages,
never one taken from a peer's payload, and names SHALL be rendered as text nodes; a person
SHALL disappear within thirty seconds of silence. Nothing of presence SHALL be exported or
saved.

#### Scenario: Two people in one file
- **WHEN** Ana and Ben have the same file open and Ben selects a word
- **THEN** Ana's pane shows Ben's selection in his colour with his name, and Ana's header shows Ben

#### Scenario: Gone after silence
- **WHEN** Ben's browser is closed without a clean disconnect
- **THEN** Ana stops seeing Ben within thirty seconds

#### Scenario: Not in exports
- **WHEN** Ana exports the diagram as SVG while Ben has an element selected
- **THEN** the SVG carries no outline, tag or name of Ben

#### Scenario: A name that looks like markup
- **WHEN** a person whose name is `<b>Ben</b>` publishes a caret and a canvas selection
- **THEN** the header, the name flag and the canvas tag show those characters as they are and no element is created from them

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
link; a viewer SHALL see presence and may not write; the twenty-first person SHALL be refused
with `room.full` and the page SHALL say so. The status line SHALL show connected, reconnecting
(backoff from one to thirty seconds) or offline, and edits made while reconnecting SHALL merge
on return.

#### Scenario: Reconnecting
- **WHEN** Ana's connection drops for ten seconds while she types and Ben edits another line
- **THEN** her status line says reconnecting, then connected, and both pages hold both edits

#### Scenario: Room full
- **WHEN** twenty people are in the room and a twenty-first opens the link
- **THEN** the page says the room is full and offers to retry
