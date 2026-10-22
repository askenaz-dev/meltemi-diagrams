## ADDED Requirements

### Requirement: Starting and ending a session
A project SHALL have at most one live session at a time, kept in its room's storage as
`{ id, token, guestsEdit, startedAt, until }`, where `token` is 32 lowercase hexadecimal
characters of 128 random bits kept in clear and `until` is `startedAt` plus twenty-four
hours. `PUT /api/projects/:id/live { guestsEdit? }` (needs `manage`) SHALL start a session,
or return the existing one applying `guestsEdit` when given, and SHALL answer `{ id, link,
guestsEdit, startedAt, until, guests }` with `link` `<origin>/p/<id>?live=<token>` and
`guests` the connections the session admitted now; `guestsEdit` SHALL default to true. `GET
…/live` (needs `manage`) SHALL answer the same or `null`. `DELETE …/live` (needs `manage`)
SHALL end the session, closing every connection it admitted with `4410 session.ended`, and
SHALL answer 204 whether or not one existed. A session SHALL end by itself at `until` and
after one hour with no client in the room, the same way; the record SHALL go with the room
when the project is deleted. Changing `guestsEdit` while guests are connected SHALL close
their sockets as an access change does, so that they reconnect with the new role. The token
and the link SHALL be returned to the owner only and never logged.

#### Scenario: Start and copy again
- **WHEN** the owner calls `PUT …/live` twice
- **THEN** both answers carry the same `id`, `link` and `until`, and the room holds one record

#### Scenario: Only the owner
- **WHEN** an editor calls `PUT …/live` or `GET …/live`
- **THEN** the answer is `403 access.denied` and no session starts

#### Scenario: Ending cuts the guests
- **WHEN** two guests and the owner are connected and the owner calls `DELETE …/live`
- **THEN** both guests' sockets close with `4410 session.ended`, the owner's stays, and a connection with the old token is refused with 404

#### Scenario: Expired
- **WHEN** the room's clock passes `until` while a guest is connected
- **THEN** the alarm closes the guest with `4410`, deletes the record, and `GET …/live` answers `null`

#### Scenario: An idle hour
- **WHEN** a session is on and the room has had no client for sixty minutes
- **THEN** the session ends and the record is gone, while a session whose room had a client fifty minutes ago is still on

#### Scenario: Guests may only look
- **WHEN** the owner sets `guestsEdit` to false while a guest edits
- **THEN** the guest's socket closes, the page reconnects, `hello` says `viewer`, and the next update the guest sends closes the socket with 4403

#### Scenario: Deleted project
- **WHEN** the project is deleted during a session
- **THEN** every guest closes with 4404 `project.not-found` and the token admits nobody afterwards

### Requirement: Joining with the link
A WebSocket upgrade for `/rooms/<id>` carrying `?live=<token>`, with or without a cookie,
SHALL be forwarded to the room when the project exists, with the headers only the Worker sets
(`X-Meltemi-Live` the token, `X-Meltemi-Guest: 1` when there is no account, `X-Meltemi-Sub`,
`X-Meltemi-Name`, `X-Meltemi-Role` the person's own role or `viewer`, `X-Meltemi-Address`
the client address); the room SHALL answer the upgrade with 404 `project.not-found` when the
token differs from its record or the session ended, and otherwise admit the connection with
the higher of the person's own role and the session's (`editor` when `guestsEdit`, else
`viewer`), saying in `hello` `you.guest` and `live: { until, guestsEdit }`. The `Origin` rule
SHALL hold as for every socket. A room SHALL never be created for a project id the store does
not hold.

#### Scenario: A guest edits
- **WHEN** an anonymous browser connects with the current token of a session whose `guestsEdit` is true
- **THEN** `hello` says `editor`, `you.guest` true and `live.until`, and the guest's updates are applied and broadcast

#### Scenario: A signed-in person with the link
- **WHEN** a signed-in person who is not a member connects to a `private` project with the token
- **THEN** they are admitted with the session's role and their account's `sub`, name and picture

#### Scenario: An owner with a token
- **WHEN** the owner connects with the token and `guestsEdit` is false
- **THEN** `hello` says `owner`

#### Scenario: A wrong token
- **WHEN** an upgrade carries a token the room does not hold, for a `private` project
- **THEN** the Worker answers 404 `project.not-found` to the upgrade and the room keeps no socket

#### Scenario: An unknown project
- **WHEN** an upgrade carries a token for a project id the store does not hold
- **THEN** the answer is 404 and no Durable Object is created

### Requirement: Guest identity
A connection without an account SHALL have the identity the Worker sets: `sub`
`guest:<id>` where `<id>` is the 32 lowercase hexadecimal characters the request's `guest`
parameter carries (an id the browser made once and keeps in `localStorage`; a parameter that
is not one SHALL answer `400 request.invalid`), `name` the `name` parameter trimmed, at most
40 characters and without control characters (else the default name), no picture, and the
colour derived from `sub` as for anyone. The room SHALL refuse with an internal error an
account connection whose `sub` starts with `guest:`. Awareness `user` SHALL carry `guest:
true` for such a connection and `guest: false` otherwise, set by the room, so that every page
badges guests from the room's word alone. Changing one's name SHALL reconnect with the new
one.

#### Scenario: The same person after a reload
- **WHEN** a guest reloads the page
- **THEN** the room sees the same `sub` and the peers see the same colour

#### Scenario: A forged guest sub
- **WHEN** a client's awareness message claims `user: { sub: "guest:…", guest: false }`
- **THEN** the peers receive the sender's room-set `sub` and `guest: true`

#### Scenario: A name with markup and a long name
- **WHEN** a guest connects with the name `<b>Ana</b>` and another with 300 characters
- **THEN** the first appears as those characters in text nodes, and the second with the default name

### Requirement: Places and connections per address
A guest, and an anonymous visitor, SHALL count towards the room's twenty places and SHALL be
evictable as a viewer is when an owner or editor of the account kind arrives to a full room;
among connections without an account the room SHALL admit at most ten open ones per client
address and SHALL refuse the eleventh with `4428 connections.limit`; account connections
SHALL not be counted by address.

#### Scenario: The eleventh from one address
- **WHEN** ten guest connections from one address are open and another arrives from it
- **THEN** it is refused with `4428 connections.limit` and the ten stay

#### Scenario: An editor arrives to a room full of guests
- **WHEN** twenty guests fill the room and an editor connects
- **THEN** the guest whose person holds the most connections is told `room.full` and the editor gets in

### Requirement: What a guest reaches
`GET /api/projects/:id` and `GET`/`HEAD …/blobs/<hash>` SHALL accept `X-Meltemi-Live:
<token>` when the caller's own access falls short of `read`, asking the room whether the
token is current (a `404 project.not-found` otherwise, as for no access); every other route
SHALL ignore the header, so that a guest can neither write outside the room nor read versions,
thumbnails or sharing. The room's limits SHALL hold for a guest's transactions as for an
editor's.

#### Scenario: A guest's images
- **WHEN** a guest's page requests a blob of a `private` project with the current token in the header
- **THEN** the blob is served, and the same request without the header is 404

#### Scenario: A guest uploads
- **WHEN** a request with the token in the header calls `PUT …/binaries/<path>`
- **THEN** the answer is `401 auth.required` and nothing is stored

#### Scenario: Over the limit
- **WHEN** a guest's update would take a text over 2 Mi characters
- **THEN** it is rolled back and answered with `doc.too-large` as any client's

### Requirement: The page as a guest
With `?live=<token>` in the address the page SHALL connect to the room with the token, its
guest id and name (or the account's cookie when signed in), open the project bound to the
Studio in the mode `hello`'s role gives, keep nothing in IndexedDB, show a guest bar naming
the session and the person with a name field and a sign-in link, and keep `live` in the
address so that a reload rejoins. A guest editor SHALL edit text, canvas and files through
the room with own-edits undo; the page SHALL hide or refuse, with a sentence that offers
sign-in, adding images and fonts, versions, the thumbnail, sharing and publishing. "Make a
copy" SHALL work, and "Save a copy to my projects" when signed in. The default name SHALL be
"Guest NN" (Spanish "Invitado NN"), NN two digits derived from the guest id.

#### Scenario: Editing without an account
- **WHEN** an anonymous browser opens the live link of a session that lets guests edit
- **THEN** the page opens the project for editing without a snapshot, the guest bar shows "Guest NN", typing reaches the owner's page, and IndexedDB holds no copy of the project

#### Scenario: An image refused
- **WHEN** a guest drops an image on the canvas
- **THEN** nothing is uploaded and the status line says images need an account, with sign-in

#### Scenario: Renamed
- **WHEN** the guest types "Ana" in the name field
- **THEN** the page reconnects and the owner's header lists "Ana" within two seconds

### Requirement: When the session ends under a guest
A page closed with `4410 session.ended` SHALL stop reconnecting with the token, say that the
live session ended, and then reconnect as an anonymous visitor when the project's link admits
viewing, or stay read-only on the files it holds, with "Make a copy", when it does not.

#### Scenario: Ended on a private project
- **WHEN** the owner ends the session while a guest edits a `private` project
- **THEN** the guest's page says the session ended, refuses edits, keeps showing the diagrams and offers "Make a copy"

#### Scenario: Ended on a view link
- **WHEN** the owner ends the session while a guest is in a `view` project
- **THEN** the guest's page says the session ended and follows the room live as a visitor

### Requirement: The owner's controls
The share dialog SHALL show the owner a "Live session" section: with no session, a start
button and the "Guests can edit" switch; with one, the link with copy, the switch, the number
of guests connected now (from presence), when it ends, and "End session", which asks first.
The header SHALL show "Live · N guests" while a session the page knows of is on, and clicking
it SHALL open the dialog. Members and visitors SHALL see nothing of the section. The anonymous
project's `#p=` dialog SHALL say that a live session needs the project in an account, with
"Save to my projects" when signed in and sign-in otherwise.

#### Scenario: Started from the dialog
- **WHEN** the owner clicks "Start a live session"
- **THEN** the section shows the link, "Guests can edit" on, "0 guests now" and when it ends, and the header shows "Live"

#### Scenario: A session from another device
- **WHEN** the owner started a session on another device and opens the dialog here
- **THEN** the section shows that session

#### Scenario: An editor's dialog
- **WHEN** an editor opens the share dialog during a session
- **THEN** no live-session control is shown
