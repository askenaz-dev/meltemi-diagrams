# 0060. Spacing between participants, and calls that hold what they cause

Status: accepted (sequence-spacing-and-nested-calls change, 28 October 2026). Extends decision 0019.

## Context

The owner asked for two things in sequence diagrams. First, a way to set the distance between
participants: the layout put a fixed 40 units (scaled by the theme) between neighbouring heads,
`gap` could only add room before a participant, never take it away, and the first participant's
`gap` was read and ignored. A head dragged sideways either reordered or snapped back, so the drag
the owner tried did nothing. Second, a way to say that a call happens inside another one: the
connection between a call, what it causes and its reply was only implied by an
`activate`/`deactivate` pair the person wrote and kept balanced by hand, and nothing linked a reply
to the call it answered. The grammar already parsed statements inside a message's block; the model
reported anything but properties there.

## Decision

- **`spacing <n>` is a diagram property** of sequence diagrams, 0 to 400 diagram units, the distance
  between neighbouring heads before their gaps; without it the layout keeps 40 scaled by the theme.
  A written value is not scaled, as `gap` is not.
- **`space` and `gap` take a side.** `space <event> <n> [before|after]` and
  `gap <participant> <n> [before|after]`, `before` by default; both sides of a pair add up, and
  `space … after` on the last event lengthens the lifelines. The model JSON writes `side` on every
  entry and `properties.spacing`.
- **A `gap` may be negative**, down to a floor: the halves of the two heads and 8 units, and the
  room the labels between them need. When the floor wins, the layout reports `layout.gap-floor`
  (warning) on the `gap` statement, naming the amount drawn. A negative gap on the outer side,
  before the first participant or after the last, is `prop.invalid-value`: there is nothing beyond
  it to bring closer. A negative `space` stays an error: rows have no measured floor.
- **The first participant's `gap` draws**, as room left of it inside the drawing.
- **A head drag writes the gap.** Dropped past a neighbour's centre, the head reorders as before;
  dropped short of it, the drag writes `gap <participant> <n>` before it (never below 0 on the first
  participant), and the status line says what was written and what is drawn when the floor wins. A
  drag under the canvas's 3-pixel threshold writes nothing.
- **A call's block holds what the call causes.** A message's block in a sequence diagram may hold
  events (messages, notes, fragments, activations, lifecycle events, dividers and delays) besides
  its properties. The receiver is active for the block: the layout draws one bar from the call's
  arrow to the block's last event, and `checkOrder` refuses a `deactivate` that would end it.
  Explicit activations inside nest deeper, as two `activate`s do.
- **`return` answers the call around it.** `return ["Label"] [as <id>] [{ properties }]` is a dashed
  reply from the callee to the caller, a relation like any other whose statement is the `return`,
  with `returns` naming the call's key in the model and the JSON. Its key is counted with the other
  relations of that pair, so no existing key moves. `return` outside a call, and an event after a
  `return` in the same list, are `sequence.return`; a `return` in a branch ends that branch.
- **Edits and the canvas.** `nestInCall` moves the events right after a call into its block, their
  comments with them; `unnestCall` moves them out and writes each `return` as a written reply from
  the callee to the caller; `moveEvent` enters and leaves call blocks, `insertEvent` appends inside
  one, and removing a call removes its block with what names the events in it. The canvas binds
  Alt+N, Alt+Shift+N and Alt+R and lists **Nest in the call**, **Unnest the call** and **Return to
  the caller** after **Activate the receiver**; the inspector shows a `return` read-only, and gains
  **Gap after**, **Space after** and **Participant spacing**.
- **The importers keep explicit pairs.** The PlantUML and Mermaid importers write the
  `activate`/`deactivate` pairs their sources write, and Alt+N and Alt+R make the block.

## Alternatives considered

- **No `spacing`, only `gap`s (S2):** tightening a whole diagram would mean one `gap` per pair.
- **Resize handles between columns (S3):** a new overlay with its own hit-testing and keyboard
  access, where the head is what the owner drags.
- **Coordinates for participants (S4):** decision 0019's rejection stands; positions would
  contradict the order.
- **A theme token or a `placement` statement for the spacing:** a theme is shared by many diagrams,
  and the spacing is about no one target.
- **Clamping a negative gap silently, or letting labels overlap:** conflicts produce diagnostics,
  never silent moves, and nobody wants overlapping labels.
- **`reply <call>` on written replies (N2):** every linked call would need an id, and nesting would
  be implied by position only.
- **`return` on explicit activations only (N3, PlantUML's model):** the link would be inferred from
  the activation stack, and a call without an `activate` would have no inside.
- **`++` and `--` suffixes (N4):** `--` is the solid line token, and the lexer takes the longest
  run; it would need new tokens and parser changes.
- **A `ReturnEvent` kind beside messages:** every message feature (numbering, `space`, styles,
  animations, hit-testing, the inspector) would be written again for returns.
- **Importers that write call blocks:** their snapshots and specs pin the pairs their sources write;
  the owner can nest with Alt+N afterwards.

## Consequences

- The language stays 0.2: `spacing`, the sides, the negative `gap`, call blocks and `return` are
  additive, and every valid file keeps its model, keys and drawing, except a first participant's
  `gap`, which now draws (the defect it was, named in the changelog).
- `Relation.node` is a relation statement or a `return` statement; `Relation.returns`,
  `MessageEvent.events` and `EventPlace`'s `{ message }` are new public surface of the model, and
  `nestInCall` and `unnestCall` of the edit package. `setRelationLine` and `reconnectRelation`
  refuse a `return`.
- New diagnostic codes: `layout.gap-floor` and `sequence.return`.
- The corpus gains `valid/sequence/calls.meltemi`, `invalid/layout.gap-floor.meltemi` and
  `invalid/sequence.return.meltemi`; every model JSON gains `returns`, `side` and `spacing`.
- Open for later: a row spacing property (`spacing 40 20`), and nesting by dragging events onto a
  call.
