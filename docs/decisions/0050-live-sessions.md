# 0050. Live sessions: anyone with the link edits together, visitors follow live

Status: accepted (live-sessions change, 21 October 2026). Amends decision 0042.

## Context

The owner shared a project to work on it live with somebody, as people do in Excalidraw, and the
other person, who opened the link without an account, saw a frozen copy: no change arrived, no
cursor, nobody in the header. That is what decision 0042 prescribed: an anonymous viewer read a
snapshot, and the socket to a project's room needed the session cookie. The room, the merging and
the presence of the live collaboration (decision 0041) were built and in production; the one thing
between a visitor and them was the sign-in. The presence also lacked the cursor people expect to
see. The constraints held: the free plan's Durable Object budget, identities in presence that are
the room's and never a client's claim, nothing user-authored reaching a route without the Worker
checking who asks, as few D1 rows as possible, and sockets on the page's own origin.

## Decision

- **A live session per project, in the project's room.** The owner starts one from the share
  dialog (`PUT /api/projects/<id>/live`), gets the link `<origin>/p/<id>?live=<token>`, chooses
  whether guests may edit (on by default), sees how many are in and when it ends, and ends it
  (`DELETE …/live`). It lasts twenty-four hours, and ends after an hour with nobody in the room.
  The record `{ id, token, guestsEdit, startedAt, until }` lives in the room's own storage, not in
  D1: the token is checked where the socket arrives, the room alone knows when its last client left,
  and a deleted project takes the record with its room. No table, migration, secret or binding is
  added.
- **Guests.** Whoever opens the session's link joins the room without an account: an identity the
  Worker sets (`sub` `guest:<id>` from an id the browser made once and keeps, the name the person
  chose or "Guest NN", no picture), with the role the session gives; a person signed in with the
  link keeps their account's identity and the higher of the two roles. The room's word marks guests
  (`guest` in awareness), so that every page badges them. A guest edits text and canvas through the
  room and keeps nothing in the browser; images and fonts, versions, the thumbnail, sharing and
  publishing need an account. Ending the session, its expiry and the idle hour close every guest
  with `4410 session.ended`.
- **Anonymous visitors follow live.** An anonymous person on a `view` or `edit` link connects to the
  room as a viewer with a guest identity and sees changes as they are made. The snapshot stays only
  as the fallback when the room does not answer in time. This replaces 0042's "anonymous viewers
  read a snapshot".
- **Every new way in is bounded.** The room's twenty places, which guests and visitors give up to
  an owner or editor with an account as viewers do; at most ten open connections without an account
  per client address (`4428 connections.limit`); the session's lifetime; and what a token reaches:
  the room, the project's row and the blobs (`X-Meltemi-Live`), nothing else.
- **Pointers on the canvas.** The presence state gains the pointer's position over the canvas, in
  diagram units, sent in the same message and at the same 250 ms throttle as the caret, dropped three
  seconds after it stops; the canvas draws each other person's pointer as a cursor in their colour
  with their name, gliding over 200 ms, never exported.

## Alternatives considered

- **A `live_sessions` table in D1.** A row per session and a read per request, and the room still
  needed for the cuts and the idle hour: more writes for nothing.
- **A signed token the Worker verifies without a lookup.** A secret the family's Terraform would
  have to add, and a revoked token would keep reading blobs until it expired.
- **Sessions that last while someone is in, as Excalidraw's.** A leaked link would stay open for as
  long as anyone kept a tab: refused; the day's bound and the idle hour keep exposure short.
- **No idle rule.** A forgotten link would stay open a day; the hour is cheap, since the room
  already knows when its last client left.
- **A pointer channel of its own at a higher rate.** Smoother, and twenty people at twenty messages
  a second would spend the day's request budget before lunch.
- **Keeping anonymous viewers on a snapshot.** What the owner found wrong: a shared project that does
  not move is not what the product is for.

## Consequences

- The socket admits anonymous connections that a link or a live token admits: `401 auth.required`
  is no longer an answer of the socket, and a person a link does not admit and who carries no token
  is `404`. Decision 0042's "the Durable Object admits viewer connections" now includes guests;
  its matrix of roles is unchanged, and a live token raises a role on the socket and on two reads
  only.
- The room's one platform alarm serves three moments (the next awareness timeout, the session's
  end, the idle hour), each handler setting the next.
- A leaked live link lets strangers in for as long as the session lasts: the owner sees how many are
  in, ends it in one click, can let guests only watch, and versions restore what was there.
- A full room of visitors costs what a full room of editors does, which decision 0041 bounded to a
  working day of the free plan; the page's 250 ms throttle and the twenty places hold for guests.
- `docs/cloud.md`, `docs/playground.md` and `docs/security.md` describe the sessions, the guests and
  their bounds.
