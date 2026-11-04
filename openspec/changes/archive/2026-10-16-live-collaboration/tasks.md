## 1. The room

- [x] 1.1 `src/room.ts`: kind 2 relay with `user` replaced by the sender's identity from its socket attachment (`sub`, `name`, `picture`; colour derived from `sub`), the compact state per socket kept in the attachment (under 2 KiB: `sub`, `name`, `picture`, `colour`, `file`, encoded caret, last seen) and sent on connect; unit tests over the fake socket pair: a spoofed `user` reaches peers as the sender, states are sent to a client that connects after the room was rebuilt from its attachments (hibernation)
- [x] 1.2 `src/room.ts`: removal on close and after thirty seconds by an alarm set from the attachments' last-seen times, the 16 KiB cap (4413 `message.too-large`), the rate (kind 2 beyond 20 per second per client dropped, beyond 100 closed with 4429 `awareness.rate`); unit tests with a fake clock: the timeout after a wake, a flood dropped then closed

## 2. The page

- [x] 2.1 `src/cloud/presence.ts`: the state (file, relative positions, canvas selection; no identity, the room adds `user`), the 250 ms throttle and the heartbeat, the encoder and decoder, the peers model taking each peer's identity only from the room's `user` with the colour by `sub`; unit tests with two documents and a fake room, including a peer payload carrying a forged `user` that the model ignores
- [x] 2.2 The code pane's presence overlay (carets, selections, fading name flags, resolved against the current text) and the header's "who is here" with file switching, names always set as text nodes; messages `en`/`es`; unit tests of the overlay geometry with a fixed-width fake and of a name holding markup shown as its characters
- [x] 2.3 `packages/canvas` and the editor's protocol: the `presence` message and the overlay layer (outline, tag with the name as a text node, not selectable, cleared on file change, unknown ids ignored); webview tests; the SVG export unaffected (test)
- [x] 2.4 Joining and states: `room.full` in the page, reconnecting and offline states with backoff, viewers see presence; unit tests with a fake socket

## 3. Suites and documentation

- [x] 3.1 Node: two documents through a fake room converge under interleaved edits; each undo manager undoes its own; relative positions survive concurrent edits
- [x] 3.2 The cloud browser suite with two contexts in one room: presence shown, same-line typing converges and each undo removes its own word, a drag and a keystroke, a cut socket reconnects and merges, the twenty-first client refused (simulated through the room's limit lowered in `DEV`)
- [x] 3.3 `docs/playground.md` (collaboration), `docs/compatibility.md` (realtime collaboration removed from the limitations), `docs/cloud.md` (awareness: the relay with the sender's identity, the 16 KiB kind 2 cap, `4429 awareness.rate`), `docs/es/` mirrors, the launch and features pages mention it; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm vscode:test-webview`, `pnpm cloud:test-browser` green
