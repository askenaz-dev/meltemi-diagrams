## Why

The owner shared a project to work on it with somebody live, as in Excalidraw, and the other
person, who opened the link without an account, saw a frozen copy: no change arriving, no
cursor, no palette, no colours, no effects. That is what
[decision 0042](../../../docs/decisions/0042-sharing-and-publishing.md) prescribes (an
anonymous viewer reads a snapshot; editing and collaborating need an account), and it is not
what the product is for: the room, the merging and the presence of `live-collaboration` are
built and in production, and the one thing between a visitor and them is the sign-in. This
change gives a project a **live session** the owner starts and ends, whose link lets anyone
in, signed in or not, to edit together while it lasts; makes every anonymous visitor of a
`view` or `edit` link follow the room live instead of reading a snapshot; and draws other
people's pointers on the canvas, the cursor people expect to see. Post-1.0 change, outside the
roadmap; it applies after `live-collaboration` and `delivery`. It amends decision 0042 with a
decision of its own.

## What Changes

- **A live session per project.** The owner starts one from the share dialog (`PUT
  /api/projects/:id/live`), gets a link `<origin>/p/<id>?live=<token>` to pass on, chooses
  whether guests may edit (on by default), sees how many guests are in and how long the
  session has left, and ends it (`DELETE …/live`). A session lasts twenty-four hours, one per
  project at a time; it also ends after one hour with nobody connected. The session lives in
  the project's room (its Durable Object storage), not in D1: the room is the authority of
  the project already, the token is checked where the socket arrives, and nothing is added to
  the rows the service writes.
- **Guests.** Whoever opens the live link joins the room without an account, as a guest: an
  identity the room owns (`sub` `guest:<id>` from an id the browser keeps, a name the person
  chooses, a colour, no picture, a guest badge in the presence), with the role the session
  gives (`editor` when guests may edit, else `viewer`). A signed-in person with the link
  joins too, with their account's identity and the higher of their own role and the
  session's. A guest edits text and canvas through the room, undoes their own edits, keeps
  nothing in the browser, and has no versions, thumbnails, images or fonts to add: those need
  an account, and the page says so. Ending the session cuts every guest with `4410
  session.ended`; so do its expiry and the idle hour.
- **Anonymous visitors follow live.** An anonymous browser on a `view` or `edit` link
  connects to the room as a viewer with a guest identity, sees changes as they are made and is
  in the presence as anybody; the snapshot of today stays only as the fallback when the room
  does not answer. **BREAKING** for the rule of decision 0042 that anonymous viewers read a
  snapshot and the socket always needs a cookie: the socket admits anonymous connections that
  the link or a live token admits, bounded by the room's twenty places, by at most ten open
  connections per client address among guests and visitors, and by the session's lifetime.
- **Pointers on the canvas.** The presence state gains the position of the person's pointer
  over the canvas, in diagram units, sent in the same message and at the same 250 ms throttle
  as the caret and the selection, and dropped three seconds after it stops; the canvas draws
  each other person's pointer as a small cursor in their colour with their name tag, on the
  presence layer, interpolated between messages, never exported.
- **The page.** The opening rule gains the guest cases (`?live=` kept in the address); a guest
  bar names the session and lets the person change their name; the owner's header shows
  "Live · N guests"; the share dialog gains the owner's live-session section; the anonymous
  project's dialog says a live session needs the project in an account and offers to save it
  there; the reads a guest needs (the project's name, the blobs the diagrams use) carry the
  token in a header.
- Documentation: `docs/playground.md` (viewing is live, guests, pointers, the session),
  `docs/cloud.md` (the `/live` routes, anonymous sockets, the codes), `docs/security.md`
  (the bounds on anonymous connections), the Spanish mirrors, and decision 0050 amending 0042
  (0049 belongs to the `account-panel` change proposed the same day).

## Capabilities

### New Capabilities

- `live-sessions`: starting, ending and joining a live session; guests' identity, role, limits
  and lifetime; what a guest can do in the page; the owner's controls.

### Modified Capabilities

- `project-sharing`: access resolution with a live token; the `/live` routes under `manage`
  and the token-bearing reads; viewing by link is live for anonymous visitors; the share
  dialog's live-session section.
- `cloud-document`: the socket admits anonymous connections the link or a token admits, with
  the identity headers the Worker sets for guests; `hello` carries the session; guests count
  as viewers for eviction and have a close code of their own; awareness carries the guest
  badge.
- `live-collaboration`: presence includes pointers and the guest badge; joining covers guests,
  visitors, the per-address cap and the session's end.
- `diagram-canvas`: the presence layer draws pointers besides selections.
- `playground-cloud`: opening by address reads `live`, and an anonymous person follows live.

## Non-goals

- Guests uploading images or fonts, making versions or publishing: an account.
- Approving guests one by one, a waiting room, following somebody's view, voice, chat.
- A live session on a project that is not in the cloud: the page offers to save it to an
  account first.
- The command line and the VS Code extension: a push is seen live, as today.

## Impact

- `packages/cloud`: `src/routes/rooms.ts` (the upgrade with a token or as an anonymous
  visitor), a `src/routes/live.ts` (`PUT`/`GET`/`DELETE …/live`), `src/access.ts` (the token's
  role), `src/rooms.ts` and `src/room.ts` (the identity headers, the internal `/live` routes),
  `src/room-core.ts` (the session record in storage, token check, eviction, the alarm shared
  by awareness, expiry and the idle hour, the per-address cap, `4410`, `4428`),
  `src/room-awareness.ts` (`guest` in `user`), the blob and metadata routes (`X-Meltemi-Live`).
  No new binding, secret or migration.
- `packages/playground`: `src/cloud/view-model.ts`, `address.ts`, `link.ts`, `view-page.ts`,
  `controller.ts`, `project.ts` (a guest keeps nothing and may write), `presence*.ts` (pointer,
  badge, guest identity and name), `share*.ts` (the session section), a `guest.ts` (id, name,
  bar), `client.ts` (the token header), messages in both languages.
- `packages/canvas` and `packages/editor`: `PresencePerson` gains `pointer`; the presence layer
  draws it.
- Suites: Node tests of the room, the routes and the page's models; the cloud browser suite
  with an anonymous context following live, a guest editing in a session, the owner ending
  it, and pointers; the webview suite for the pointer layer.
- Decision 0050; decision 0042 and `docs/security.md` cross-checked.
