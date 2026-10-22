## MODIFIED Requirements

### Requirement: The room's protocol
The page SHALL connect to `wss://<origin>/rooms/<id>`, with `?live=<token>` for a live session
and `?guest=<id>&name=<name>` when there is no account. The Worker SHALL answer `GET
/rooms/<id>` only with `Upgrade: websocket` (any other method, or a request without the
upgrade, SHALL answer 404), SHALL resolve the principal from the cookie, SHALL check the
upgrade's `Origin` against its own origin (`403 request.forbidden`), SHALL resolve access
(none and no token → `404 project.not-found`; an anonymous principal whose access is nothing
and who carries no token → `401 auth.required` when the link would admit a signed-in person,
else 404), and SHALL call the room with a request it constructs: the fixed internal URL
`https://room/connect` and only the headers `X-Meltemi-Sub`, `X-Meltemi-Role`,
`X-Meltemi-Name`, `X-Meltemi-Picture`, `X-Meltemi-Guest`, `X-Meltemi-Live` and
`X-Meltemi-Address` it sets, forwarding no client header or path; an anonymous connection the
link admits as viewer SHALL be forwarded with a guest identity, and one with a token SHALL be
forwarded for the room to check it (`live-sessions`). The room's internal routes (`/files`,
`/restore`, `/destroy`, `/stats`, `/disconnect`, `/live`) SHALL be reachable only through
Worker-constructed requests. On connect the room SHALL send kind 3 `hello` (`{ role,
revision, limits, collisions, you, live }`, `you` with `guest` and `live` the session's `{
until, guestsEdit }` for a connection a session admitted, else `null`) and then its own state
vector as kind 0, which the client answers with a kind 1 carrying what the room lacks; a
client's kind 0 `sync` with its state vector SHALL always be answered with a kind 1 carrying
what it lacks, empty when nothing; a kind 1 `update` SHALL be applied, persisted and broadcast
to every other client, and one that adds nothing SHALL change no revision, write nothing and
broadcast nothing; a viewer's update SHALL close its socket with 4403 `access.denied`; a
message over 512 KiB SHALL close with 4413 `message.too-large`; a 21st client SHALL be refused
with 4409 `room.full`, unless it is the owner or an editor with an account and a viewer or a
guest holds a place, which that connection then loses with the same refusal; the eleventh
open connection without an account from one client address SHALL be refused with 4428
`connections.limit`; a connection a session admitted SHALL be closed with 4410 `session.ended`
when the session ends; destroying the room SHALL close its sockets with 4404
`project.not-found` so that a page stops reconnecting. In development the room SHALL close a
client's socket on an internal `POST /disconnect`, for the suite's reconnection tests.

#### Scenario: Two devices converge
- **WHEN** two clients of the owner connect, each edits a different line of the same file, and both have synced
- **THEN** both documents are identical and the room's revision counts both transactions

#### Scenario: A foreign origin cannot upgrade
- **WHEN** a WebSocket upgrade arrives with `Origin: https://evil.example` and a valid cookie
- **THEN** the Worker answers 403 and no connection reaches the room

#### Scenario: Anonymous on a private project cannot upgrade
- **WHEN** a WebSocket upgrade for `/rooms/<id>` of a `private` project arrives without a cookie and without a token
- **THEN** the Worker answers `404 project.not-found` and no connection reaches the room

#### Scenario: Anonymous on a view link upgrades
- **WHEN** a WebSocket upgrade for `/rooms/<id>` of a `view` project arrives without a cookie, with `guest` and `name`
- **THEN** the room gets a connection whose `hello` says `viewer` and `you.guest` true, and whose `sub` starts with `guest:`

#### Scenario: Internal routes are not public
- **WHEN** `POST /rooms/<id>/destroy` or `POST /rooms/<id>/live` arrives with the owner's valid cookie
- **THEN** the answer is 404 and the room keeps its document, revision and session

#### Scenario: A spoofed role header is ignored
- **WHEN** a non-owner's upgrade carries `X-Meltemi-Role: owner` or `X-Meltemi-Live: <the token>`
- **THEN** the Worker's own headers replace them: a role the Worker resolved, and the token only when the request's query carried it

#### Scenario: Cut in development
- **WHEN** the suite calls the `DEV` disconnect for a connected client
- **THEN** that client's socket closes, the page reports reconnecting, and the next connection syncs what it missed

### Requirement: Roles in the room
The Worker SHALL pass the resolved role (`owner`, `editor`, `viewer`) and whether the
connection has an account to the room with each connection, and the room SHALL raise the role
to a session's when a current token comes with it; the room SHALL send the role in `hello`,
broadcast updates to viewers as to everyone, and close a viewer's socket with 4403
`access.denied` on its first update, leaving the document unchanged. A connection whose
project the person cannot access and that carries no token SHALL be refused by the Worker with
404 before reaching the room. The room SHALL treat a guest of any role as a viewer for the
twenty places.

#### Scenario: A viewer watches
- **WHEN** a viewer is connected and an editor changes a file
- **THEN** the viewer receives the update

#### Scenario: A viewer writes
- **WHEN** the viewer sends an update
- **THEN** its socket closes with 4403 and the document and revision are unchanged

#### Scenario: A spoofed role header
- **WHEN** a viewer's upgrade carries `X-Meltemi-Role: owner`
- **THEN** `hello` says `viewer` and its first update closes the socket with 4403

#### Scenario: A guest editor writes
- **WHEN** a guest admitted by a session that lets guests edit sends an update
- **THEN** it is applied and broadcast as an editor's

#### Scenario: A guest gives up a place
- **WHEN** the room is full with a guest editor among the clients and the owner connects
- **THEN** the guest is told `room.full` and the owner gets in

### Requirement: Awareness relayed by the room
The room SHALL relay kind 2 messages to every other client with `user` replaced by the sending
socket's identity (`sub`, `name`, `picture`, `guest` from its attachment; colour derived from
`sub`), whatever `user` the message carried. The room SHALL keep each client's last state as a
compact record under 2 KiB in its socket attachment (`sub`, `name`, `picture`, `guest`,
`colour`, `file`, the encoded caret, last seen; when it does not fit, the caret is dropped
first, then the file; the canvas selection and the pointer are not kept), so that it survives
hibernation, and SHALL send those states to a client when it connects. The room SHALL remove a
client's state when its socket closes or after thirty seconds without a message from it,
checked by an alarm set from the attachments' last-seen times, and SHALL tell the others. A
kind 2 message over 16 KiB SHALL close the sender with 4413 `message.too-large`; kind 2
messages beyond 20 per second from one client SHALL be dropped, and a client sending more than
100 per second SHALL be closed with 4429 `awareness.rate`. The room SHALL have one platform
alarm, set for the earliest of the next awareness timeout, the live session's end and the idle
hour after its last client left, each handler setting the next.

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
- **THEN** every peer receives the message with Ben's `sub`, name, picture, guest flag and colour, and nothing of Ana's

#### Scenario: Oversized state
- **WHEN** a client sends a 20 KiB awareness message
- **THEN** its socket closes with 4413 and the others receive nothing from it

#### Scenario: A flood
- **WHEN** a client sends 50 kind 2 messages in one second, then 150 in the next
- **THEN** the peers receive at most 20 of the first second's messages, and the sender's socket closes with 4429 `awareness.rate` during the second

#### Scenario: One alarm, three reasons
- **WHEN** a session ends in ninety minutes, a client's state goes silent now, and every client leaves ten minutes later
- **THEN** the alarm fires in thirty seconds for the state, then at the idle hour seventy minutes from now, which ends the session, and not at all at ninety minutes
