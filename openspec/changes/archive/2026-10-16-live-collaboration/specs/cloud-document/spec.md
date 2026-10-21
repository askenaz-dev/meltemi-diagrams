## ADDED Requirements

### Requirement: Awareness relayed by the room
The room SHALL relay kind 2 messages to every other client with `user` replaced by the sending
socket's identity (`sub`, `name`, `picture` from its attachment; colour derived from `sub`),
whatever `user` the message carried. The room SHALL keep each client's last state as a compact
record under 2 KiB in its socket attachment (`sub`, `name`, `picture`, `colour`, `file`, the
encoded caret, last seen; when it does not fit, the caret is dropped first, then the file), so
that it survives hibernation, and SHALL send those states to a
client when it connects. The room SHALL remove a client's state when its socket closes or
after thirty seconds without a message from it, checked by an alarm set from the attachments'
last-seen times, and SHALL tell the others. A kind 2 message over 16 KiB SHALL close the
sender with 4413 `message.too-large`; kind 2 messages beyond 20 per second from one client
SHALL be dropped, and a client sending more than 100 per second SHALL be closed with 4429
`awareness.rate`.

#### Scenario: States on connect
- **WHEN** a third client connects while two others have published states
- **THEN** it receives both states before any update

#### Scenario: States survive hibernation
- **WHEN** two clients have published states, the room is evicted from memory between messages, and a third client connects
- **THEN** the third client receives both states, read from the socket attachments

#### Scenario: Gone after silence despite a wake
- **WHEN** a client's last message is thirty seconds old and the room was rebuilt from storage in between
- **THEN** the alarm removes that client's state and the others are told

#### Scenario: A spoofed identity
- **WHEN** Ben's client sends a kind 2 message whose `user` carries Ana's `sub`, name and picture
- **THEN** every peer receives the message with Ben's `sub`, name, picture and colour, and nothing of Ana's

#### Scenario: Oversized state
- **WHEN** a client sends a 20 KiB awareness message
- **THEN** its socket closes with 4413 and the others receive nothing from it

#### Scenario: A flood
- **WHEN** a client sends 50 kind 2 messages in one second, then 150 in the next
- **THEN** the peers receive at most 20 of the first second's messages, and the sender's socket closes with 4429 `awareness.rate` during the second
