## Context

The room merges updates, relays awareness with the sender's identity and refuses a viewer's
writes (`cloud-document`); the page opens a project in the mode the role gives, and an
anonymous person gets a snapshot with no socket (`project-sharing`, `playground-cloud`);
presence shows who is here, carets and canvas selections (`live-collaboration`). All of it is
in production. What the owner found is that the only path into the room is a cookie, so a
person without an account never meets any of it, and that the presence has no pointer.

Constraints that hold: the free plan's Durable Object budget (the design of
`live-collaboration` bounded a full room to a working day); identities in presence are the
room's, never a client's claim; nothing user-authored reaches a route without the Worker
checking who asks; the service writes as few D1 rows as it can; sockets stay same-origin.

## Goals / Non-Goals

**Goals:**

- Anyone with a live session's link edits together with the owner, without an account, for as
  long as the owner wants and at most a day.
- A visitor of a shared link sees the project as it is, not as it was.
- The cursor people expect: pointers on the canvas, with the name.
- Every new way in is bounded: by the room's places, by connections per address, by time, and
  by what a guest can reach (the room and the blobs, nothing else).

**Non-Goals:**

- Guest uploads, versions, publishing, approval of guests, following, chat, voice.
- Sessions for projects that are not in the cloud.

## Decisions

### The session lives in the room, not in D1

A session is a record in the room's storage: `{ id, token, guestsEdit, startedAt, until }`,
one per room (so one per project), written by the Worker's `PUT …/live` through an internal
route and read by the room itself when a socket arrives with a token. The token is 128 random
bits in lowercase hexadecimal, kept in clear like an invitation's: the owner copies the link
again from the dialog, so it has to be recoverable; it is shown to the owner alone and never
logged.

Why the room and not D1: the socket upgrade already reaches the room (`rooms.connect`), so the
token is checked where it is used with no lookup; the room is the one place that knows its
clients, so it alone can end a session after an hour with nobody in it; the cascade is free (a
deleted project destroys its room, record included); and no table, store method, conformance
test or sweep is added. The two reads a guest needs outside the room (the project's name and
the blobs the diagrams use) ask the room whether a token is current, one internal request per
read; a session's worth of them is small beside its awareness traffic.

Alternatives: a `live_sessions` table in D1 (a row per session, a read per request, and the
room still needed for cuts and the idle hour); a signed token the Worker verifies without a
lookup (needs a secret the family's Terraform would have to add, and a revoked token would
keep reading blobs until it expired).

### Who gets in, and as what

Access resolves as today for people with a cookie or a bearer token. The socket route then
admits two kinds of connection it refused before, each bounded:

- **A guest with a token**: the request carries `?live=<token>`; the Worker checks the project
  exists (a room is never created for an unknown id), resolves the person's own access if they
  are signed in, and forwards the token to the room with the identity it sets. The room
  compares the token with its record (a wrong or expired one answers the upgrade with 404
  `project.not-found`, revealing nothing) and admits the connection with the higher of the
  person's own role and the session's (`editor` when `guestsEdit`, else `viewer`).
- **An anonymous visitor of a `view` or `edit` link**: access resolves to `viewer` with no
  principal, which the route used to turn away for lack of a cookie; it now forwards the
  connection as a viewer with a guest identity.

Everything else stays: a foreign `Origin` is 403, a `private` project with no token is 404, a
cookie principal keeps its account identity even with a token (the token only raises the role).

The identity of a connection without an account is `sub: guest:<id>`, where `<id>` is 32
lowercase hexadecimal characters the browser made once and keeps in `localStorage`, so a
reload and a second tab are the same person with the same colour; `name` is what the person
chose, trimmed, at most 40 characters, without control characters, else the default; no
picture. The Worker sets it in the headers only it sets (`X-Meltemi-Sub`, `X-Meltemi-Name`,
`X-Meltemi-Role`, and the new `X-Meltemi-Live`, `X-Meltemi-Guest: 1` and
`X-Meltemi-Address`), so the room trusts them as it trusts the role today; an account `sub`
starting with `guest:` is refused by the room as an internal error, which keeps the prefix
unambiguous. The room's `hello` says `you.guest` and, to a connection the session admitted,
`live: { until, guestsEdit }`; awareness `user` gains `guest: true`, so every page badges
guests and never mistakes one for an account.

### Roles and places

Room roles stay `owner`, `editor`, `viewer`; `guest` is a flag beside them. For the twenty
places, a guest of any role is evictable as a viewer is: when the room is full and an owner or
editor of the account kind arrives, the room turns away the viewer or guest whose person
holds the most connections. Among guests and visitors, at most ten open connections per client
address (`CF-Connecting-IP`, passed as `X-Meltemi-Address`); the eleventh is refused with
`4428 connections.limit`, a code of its own in the refusal range, so that one network cannot
fill a room while classrooms and offices behind one address still fit. Account connections
are not counted by address.

### Lifetime

A session ends when the owner ends it, twenty-four hours after it started, or when an hour
passes with no client in the room. The room enforces all three: `DELETE …/live` and the
alarm close every guest socket the session admitted with `4410 session.ended` and delete the
record; a page that receives `4410` stops reconnecting with that token. The room has one
platform alarm, used until now by awareness alone; it becomes the earliest of three moments
(the next awareness timeout, the session's `until`, the idle hour after the last client left),
each handler setting the next. The record is in storage, so expiry fires after a hibernation
or a wake, as the awareness timeout does.

Changing `guestsEdit` while guests are connected closes their sockets as an access change does
today (the page reconnects within a second and `hello` names the new role, so it reopens in
the mode the role gives, keeping the file open).

Alternatives: no idle rule (a forgotten link stays open a day: the hour is cheap, the room
already knows when its last client leaves); sessions that last while someone is in, as
Excalidraw's (unbounded exposure of a leaked link; refused).

### What a guest reaches

The room, and two reads: `GET /api/projects/:id` (the name the page shows) and
`GET`/`HEAD …/blobs/<hash>` (the images and fonts the diagrams use), which accept
`X-Meltemi-Live: <token>` when the caller's own access falls short of `read` and ask the
room whether the token is current. The token goes in a header on these reads, in the query
only where a header cannot go (the socket, the page's address). Everything that writes
outside the room, and everything that costs the owner's storage (binaries, thumbnails,
versions, sharing, publishing), keeps needing an account: the page hides or refuses it for a
guest with a sentence that offers sign-in. A guest's text edits cost the owner's project what
an editor's do, and the room's limits (`doc.too-large`, `quota.files`) hold for them.

### The page as a guest

Opening resolves to a fourth and fifth case: with a current token the page opens the project
bound to the room with the role `hello` gives, keeping nothing in IndexedDB (a guest's copy
must not stay in a shared computer, and the room has it); without a token on a `view` or
`edit` link, an anonymous person opens in view mode connected to the room (the former
`view-live`), with the snapshot only when the room does not answer within the usual wait. A
guest bar under the header names the session and the person ("You are in Together's live
session as Guest 37"), holds the name field (changing it reconnects with the new name, since
the identity is the room's) and offers sign-in; the default name is "Guest NN" ("Invitado
NN"), NN two digits derived from the guest id, so two anonymous people differ by name and not
only by colour. When the session ends under a guest, the page says so, and reconnects as an
anonymous visitor when the link admits viewing, or stays read-only on what it holds, with
"Make a copy", when it does not.

### Pointers

The local state gains `canvas.pointer: { x, y }` (integers, diagram units), published inside
the same message and the same 250 ms throttle as the caret and the selection while the
pointer moves over the canvas, and dropped (a state without it) three seconds after it stops
or when it leaves the canvas; the wire reader takes it only as two finite numbers within a
bound. The room's compact attachment does not keep it (as it does not keep the selection: it
arrives with the next state). The canvas's `presence` message gains `pointer?` per person,
and the presence layer draws a small cursor glyph in the colour with the name tag beside it,
moving with a 200 ms transition so four states a second look continuous, scaled with the
scene, hidden while a story plays, never exported. No new traffic: a moving pointer and a
moving caret cost the same message.

Alternative: a second channel at a higher rate (smoother, and twenty people at twenty messages
a second would spend the day's budget before lunch).

### The owner's controls

The share dialog gains, for the owner only, a "Live session" section: off, a button to start
one and the "Guests can edit" switch; on, the link with copy, the switch, "N guests now" from
presence, "ends in …" from `until`, and "End session". The header shows "Live · N guests"
while a session the owner's page knows of is on; the dialog re-reads `GET …/live` when it
opens, so a session started on another device shows. The anonymous project's `#p=` dialog
gains one sentence: a live session needs the project in an account, with "Save to my projects"
when signed in and sign-in otherwise.

## Risks / Trade-offs

- **A leaked live link lets strangers edit.** → The owner chose to let anyone with the link in;
  the session shows how many are in, ends in one click, lasts a day at most, and versions
  restore what was there. A session with `guestsEdit` off lets them only look.
- **Anonymous connections spend the Durable Object budget.** → Twenty places per room, ten per
  address, heartbeats of four a minute and the 250 ms throttle: a full room of visitors costs
  what a full room of editors does, which the previous design bounded to a working day. The
  `DEV` `/stats` route keeps counting incoming messages for the browser suite.
- **A guest's tab left open holds a place.** → A guest is evictable; the owner and editors
  always get in; the idle hour ends a session nobody uses.
- **Two guests named alike.** → Names are two-digit by default and editable; colours differ;
  the badge marks guests. Identity is the room's, so a guest cannot name themselves as the
  owner with the owner's picture: guests have none.
- **A token in the page's address.** → It is a capability like the invitation links, kept out
  of logs, shown to the owner alone, and dies with the session; reads send it in a header.
- **One alarm, three reasons.** → The earliest moment wins and each handler re-arms; a unit
  test with a fake clock walks the three interleaved.

## Open Questions

1. **The session's length.** Twenty-four hours, or eight? Recommended: twenty-four, with the
   idle hour doing the real work.
2. **The pointer's glyph.** An arrow as in Figma, or a dot? Recommended: an arrow, with the
   name tag at its tail.
