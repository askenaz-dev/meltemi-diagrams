## Why

What the owner likes most in Excalidraw is working on the same drawing with someone else, live.
The room of `cloud-projects` already merges several clients' edits, and `sharing-and-permissions`
decides who may join; what is missing is the experience: seeing who is here, where they are and
what they have selected, typing at the same time without losing a character, undoing one's own
edits only, and a page that says plainly when it is reconnecting. Meltemi's architecture makes
this cheaper than in a scene editor: every edit is a text edit and the layout is deterministic,
so synchronising the text synchronises the drawing ([decision 0041](../../../docs/decisions/0041-hosted-service.md)).
Post-1.0 change, outside the roadmap; it applies after `sharing-and-permissions`. Realtime
collaboration stops being a known limitation.

## What Changes

- **Awareness in the room**: kind 2 messages relayed to every other client carrying the
  identity the room knows for the sender (never the one the message claims), a compact state
  per socket kept in its attachment so it survives hibernation and is sent on connect, a rate
  per client (`4429 awareness.rate`), each client's state removed when it disconnects or
  stays silent for thirty seconds.
- **Presence in the page**: who is here (avatars and names, each with a colour), other
  people's carets and selections in the code pane, other people's selections on the canvas with
  a name tag, which file each person has open; nothing of it is exported or saved.
- **Simultaneous editing**: two people typing in the same line converge; canvas edits and
  typing interleave; each person's undo covers their own edits (already the rule of
  `playground-cloud`), now tested with two browsers.
- **Joining**: anyone with the `editor` role joins by opening the project's link while signed
  in; viewers see presence and may not write; a room holds up to twenty people.
- **Connection states**: the status line says connected, reconnecting (with backoff) or
  offline; edits made while reconnecting merge.
- **Suites**: Node tests with two documents and a fake room; the cloud browser suite drives two
  contexts in one room.
- Documentation: `docs/playground.md` (collaboration), `docs/compatibility.md` (the limitation
  removed), `docs/cloud.md` (awareness), decision 0041 cross-checked.

## Capabilities

### New Capabilities

- `live-collaboration`: presence state and its display, simultaneous editing, joining, the
  connection states and limits.

### Modified Capabilities

- `cloud-document`: awareness relayed by the room with the sender's identity, a rate per
  client and a thirty-second timeout.
- `diagram-canvas`: other people's selections drawn with name tags, never exported.

## Non-goals

- The command line (`cli-cloud`): a push is already seen live by the room's clients.

## Impact

- `packages/cloud`: `src/room.ts` relays kind 2 with the sender's identity, keeps a compact
  state per socket in its attachment, rate-limits and times states out on an alarm; nothing
  of it in storage.
- `packages/playground`: `src/cloud/presence.ts`, the code pane's presence overlay, the header's
  "who is here", the status line states; `packages/canvas`: a `presence` host message and the
  overlay layer; messages in both languages.
- `packages/editor`'s canvas protocol gains `presence`. No new dependency: Yjs's awareness
  state is an encoded map; the page writes its own small encoder.
