## Context

The room merges updates and broadcasts them (`cloud-document`); the page binds the document to
the Studio with own-edits undo and keeps the caret through relative positions
(`playground-cloud`); roles decide who may write (`sharing-and-permissions`). The code pane is a
text area over a highlighted copy with marks layers; the canvas draws a selection and handles
over the scene and receives host messages.

## Goals / Non-Goals

**Goals:**

- Presence that is useful and cheap: who, which file, where; relayed, never stored; the
  identity shown is the one the room knows, never one a client claims.
- Typing together without surprises; undo that never touches another person's work.
- Honest connection states.

**Non-Goals:**

- Following, voice, comments; anonymous rooms.

## Decisions

### Awareness state

Each client publishes `{ file, caret?: { anchor, head }, canvas?: { selection: string[] } }`,
`file` being the file id of the document (`paths` gives its name, so presence survives renames),
where `anchor` and `head` are Yjs relative positions (encoded) in the `Y.Text` of `file`, so
they stay right across concurrent edits. The identity is the room's: it sets `user: { sub,
name, picture, colour }` on every kind 2 message it relays and on every state it sends on
connect, from the sending socket's attachment (`sub`, `name`, `picture` as the Worker passed
them on the upgrade), overwriting any `user` a client sends; the page never takes a peer's
identity from the peer's payload and renders names as text nodes. The colour is derived from
`sub` (a twelve-colour palette indexed by a hash of it), so the room and every page compute the
same one. The page sends its state on change, at most every 250 ms, and every fifteen seconds
as a heartbeat; the room relays kind 2 messages to every other client, drops those beyond 20
per second from one client and closes a client sending more than 100 per second with `4429
awareness.rate`. Awareness survives hibernation: the room keeps no awareness in memory it
cannot rebuild; each socket's attachment holds a compact state under 2 KiB, dropping the caret and then the file when it would not fit (`sub`, `name`,
`picture`, `colour`, `file`, the encoded caret, last seen) updated at every kind 2 message,
and a client that connects receives those states (the canvas selection is not kept: it arrives
with the sender's next state). A client's state is dropped when its socket closes or after
thirty seconds of silence, telling the others; the timeout runs on an alarm set at the
earliest last-seen time plus thirty seconds, which drops every state older than that, tells
the others and sets the next alarm, so it works after a wake. The encoding is the page's own:
a JSON object per client keyed by the client id, as Yjs's awareness protocol does, without
the `y-protocols` package.

Alternative: `y-protocols`' awareness. Another download for a protocol of fifty lines; the
page writes it, as it wrote the sync messages.

### Showing presence

- **Who is here**: avatars with names in the header, in presence colours, with the file each
  person has open; clicking one opens that file.
- **Code pane**: an overlay layer draws each remote caret as a thin bar in the person's colour
  with a name flag that fades after two seconds of stillness, and each remote selection as a
  translucent band; positions resolve from the relative positions against the current text,
  so they move with concurrent edits.
- **Canvas**: a `presence` host message `{ people: [{ name, colour, selection }] }` makes the
  canvas draw a coloured outline with a name tag around each selected element of others, on a
  layer above the scene that is neither selectable nor exported; the message is cleared when
  the canvas shows another file.

### Editing together

Yjs merges concurrent inserts and deletes; the binding already turns local changes into
minimal `Y.Text` operations and applies remote ones with the caret preserved. Undo is
`Y.UndoManager` with `trackedOrigins` `{ LOCAL }`, so a person's undo never removes another's
characters; a remote change in the middle of a typing step does not break the step. The
analysis runs after the usual pause on every change, local or remote, and the canvas redraws.

### Joining and limits

Opening a project's link while signed in connects to the room with the resolved role; the
twenty-first person is refused with `room.full` and the page says so; viewers publish and see
presence but their updates are refused (`cloud-document`). The page reconnects with backoff
from one to thirty seconds, shows "reconnecting", keeps editing locally, and merges on return.

### Open decisions

1. **Heartbeat and timeout.** Alternatives: 15 s and 30 s; 30 s and 60 s. Recommended: 15 and
   30, so a closed laptop disappears within half a minute.
2. **Name flags.** Alternatives: always visible; fade after stillness. Recommended: fade, so
   code stays readable when several people are in one file.

## Risks / Trade-offs

- **Awareness traffic.** Every caret move sends a message to the room and to every peer, and
  the free plan's Durable Object budget is 100 000 requests a day with incoming WebSocket
  messages counted 20:1. The 250 ms throttle and the twenty-person cap bound a full room with
  every caret moving to 80 incoming messages a second (4 requests a second, which would spend
  the day's budget in about seven hours if it never stopped); carets move in bursts and the
  heartbeat is four messages a minute per client, so a working day of a full room stays well
  inside it, and the room's cap of 20 kind 2 messages per second per client holds a misbehaving
  client to the same order. The `DEV` `/stats` route of `cloud-document` counts incoming
  messages so the browser suite can bound them.
- **Relative positions in a deleted file.** A person's state names a file another person just
  deleted; the pane ignores states whose file it does not have.
