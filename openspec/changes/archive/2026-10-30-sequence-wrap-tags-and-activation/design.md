## Context

**How a message label is laid out.** `layoutSequence` (`packages/layout/src/sequence.ts:99-723`)
measures a message label as one line (`messageLabel`, `:127-128`) in the body font at weight 400
and `relationLabelSize`. The columns come first: heads measured from their labels (`:119-126`), the
written distance of a pair (half of each head, the diagram's `spacing` or 40 scaled, and the two
`gap`s, `:162-176`), then a constraint per message between its two columns of its label width plus
the number disc (22 when `autonumber` is on, `:139`) plus 24 (`:182-195`), sorted and applied by
pushing the right column and everything after it (`:224-228`); a self-call asks for
`SELF_WIDTH + room + 16` right of its column (`:188-192`), notes for their width (`:197-217`). A
negative `gap` that the result does not honour is `layout.gap-floor` on the `gap` statement
(`:229-256`), which the canvas turns into the status line the owner saw
(`packages/editor/src/messages/en.ts:326`). The rows come second: a message's row is one label line
high (`labelHeight` = `relationLabelHeight`, `round(size × 18 / 11)`, `:261`;
`packages/layout/src/layout.ts:507`), the arrow at `y + labelHeight + 4` (`:369`), a self-call's loop
below one label height (`:339-349`), a creating message's arrow through the new head (`:353-367`).
The label box is the text width plus 8, one line high, centred at `at` along the arrow (50 % by
default, `label <message> at n% offset (dx, dy)` read at `:146-153`) just above it (`:377-398`), or
beside a self-call's loop (`:385-387`). `emitter.message` draws the label as one `TextItem` in a
nested group of role `label` (`:1062-1079`), so a `\n` written in it is one text with a line break
that SVG draws as a space. `LayoutResult.labels` holds the label boxes (`:697`). Notes already draw
one line per `\n` (`splitLines`, `:1108-1120`).

**What wraps elsewhere.** `wrapLines(text, width, measure)` (`packages/layout/src/text.ts:95-160`,
decision 0064) breaks at each `\n`, then greedily at spaces, a word wider than the width broken
between characters, and never measures a long word whole. Stickies use it with lines 1.25 times
the size apart and expose how they wrapped as `LayoutResult.stickies` (`StickyText`,
`layout.ts:295-315`), which `textPlaces` turns into the inline editor's place
(`packages/editor/src/text-places.ts:160-198`), and the canvas opens a wrapping editor
(`InlineOptions.wrap`, `packages/canvas/src/inline.ts:195-199`; `wrappedFrame`, `:58-80`, which
also shrinks the text through `wrappedSize`, `:92-98`) when the element is a sticky
(`openInline`, `packages/canvas/src/app.ts:8233-8269`, the test at `:8237-8240`).

**How flow tags look.** A flow `tag <id> "Text"` is an element (`ELEMENT_KINDS`,
`packages/model/src/schema.ts:78`) sized as a pill of its mono text at `tagSize` weight 500 plus
`tagPadding` wide and `tagHeight` high (`layout.ts:4455-4461`; `tagHeight = round(tagSize × 18 /
10.5)`, `:494`), drawn with the `tag` fill, the same stroke and the `tagText` colour
(`layout.ts:5451-5490`). With `technical.light` a tag is 18 units high at 10.5 px. Annotations
(`ANNOTATION_KINDS`, `layout.ts:866`) are not checked against boxes by the label audit.

**How a sequence diagram reads blocks.** The sequence profile's element blocks take
`description`, `class`, `link`, `url`; its relation blocks `description`, `assumption`, `class`,
`kind` (`SEQUENCE_PROFILE`, `schema.ts:734-775`). `elementBlock` (`packages/model/src/flow.ts:1124-1177`)
takes `port`, `layer` and `link` out of the block before `readProperties`, which reports a repeated
keyword as `prop.duplicate`. A message's block may also hold events: `SequenceAnalyzer.relation`
splits them off before the flow reader sees the block (`packages/model/src/sequence.ts:217-241`), and
a `return`'s block is read with the relation table (`:290-295`). `tag` at the diagram level is one
of the `OTHER_DECLARATIONS` refused with a hint naming the flow profile (`:105-117`, `:332-341`); a
statement in a fragment that is no event is `prop.unknown` (`:505-523`). `Element`
(`packages/model/src/types.ts:170-234`) and `Relation` (`:236-283`) have no tags; the model JSON
writes their keys in a fixed order (`packages/model/src/json.ts:724-793`), and the model diff
compares their parts (`elementDetails` and `relationDetails`, `packages/model/src/diff.ts:250-350`).

**How activations are drawn and edited.** A `Bar` (`sequence.ts:91-96`) is opened by an `activate`
at the row of the message that leads into it (`:430-443`, its row recorded with height 0), closed
by its `deactivate` (`:445-452`), and a call with a block opens one on its receiver for the block
(`:414-427`). Every bar is a `rect` inside its participant's `lifeline` group (`:845-882`), drawn
after the dashed line; `LayoutResult.boxes` holds heads, notes and fragments only (`:667-683`).
The canvas hit-tests by DOM: `hit()` takes the closest `[data-role]` of `element`, `relation` or
`event` (`app.ts:5601-5636`), so a press on a bar finds nothing; `EventInfo.box` is set for notes
and fragments only (`eventInfos`, `packages/editor/src/sequence.ts:81-116`). Alt+A
(`packages/editor/src/canvas/keyboard.ts:205`) and the context menu's **Activate the receiver**
(`app.ts:8727-8734`) post `toggleActivation` (`app.ts:7618-7622`), planned by `sequenceAction`
(`editor/src/sequence.ts:303-321`, the receiver unless a participant is selected) as the edit
`toggleActivation` (`packages/edit/src/sequence.ts:716-783`), which finds the matching `deactivate`
at the same depth and refuses a call whose block activates the callee. `moveEvent` moves one step
(`:203-283`) through `relocate` (`:120-159`); `removeEvent` deletes one statement and refuses a
result with new errors (`:588-612`), so an `activate` cannot be removed without its `deactivate`.
`planBatch` plans operations one after another on recompiled text (`packages/edit/src/batch.ts:110-140`).
Previews are off on sequence diagrams (`previewAction`, `app.ts:4076-4080`), and the preview answer
carries no reason when it is refused (`svg: null`, `packages/editor/src/canvas/protocol.ts:691-709`).

**The inspector and the palette.** A message shows Id, Label, Description, From, To, Message,
Space before and after (`messageFields`, `editor/src/sequence.ts:496-543`); a participant Id, Kind,
Label, Description, Classes, Link and the two gaps (`participantFields`, `:446-493`); an activation
its participant, read-only (`eventFields`, `:603-616`). Field types are `id`, `text`, `multiline`,
`number`, `enum`, `color`, `icon`, `classes` and `ports` (`protocol.ts:351-352`); a field may carry
a `button` that sends an action (`:408`); effects are `enum` fields `off`/`on` drawn as toggles
(`packages/canvas/src/inspector.ts:1016-1034`). The sequence palette is participant (P), actor
(A), more participants, message (C), note (O), fragment (F), divider, delay and group
(`PALETTE`, `app.ts:500-522`; the sequence buttons, `:4498-4527`). T is bound on flow (`createTag`,
`keyboard.ts:179`) and free (`createText`) only. Titles follow decision 0062's rule: the name says
what the control does, the `title` adds the key in parentheses, `aria-keyshortcuts` says it.

## Goals / Non-Goals

**Goals:**

- A participant can be dragged as close to its neighbour as its heads allow; the labels between
  them wrap instead of holding them apart, on the canvas, in every export and in the editor that
  types them.
- A message or a participant carries short tags ("PKCE", "v2", "external") written as one
  statement each, drawn as the flow tag's pills where they read as badges.
- Everything Alt+A does is on the toolbar and in the inspector, and an activation bar on the canvas
  is an object: selected, its ends dragged to other events, removed.

**Non-Goals:**

- Tags in flow, free and C4 blocks: flow diagrams have `tag <id>` objects and free diagrams texts
  and stickies; this change gives sequence diagrams their own.
- Wrapping relation labels of flow, free and C4 diagrams, or participant names: their labels sit
  on routes or in boxes that the engine and `size` already govern.
- Shrinking message text to fit: labels wrap and grow the row; only stickies shrink.
- Moving a call block's bar by its ends: the block decides its span (Alt+N, Alt+Shift+N, Alt+R).

## Decisions

### D1. A label keeps its line until its participants are pulled closer

A message label between two different participants stays on one line and pushes its columns apart
as today: that is the pair's **natural distance**. When the person pulls the pair closer, the label
wraps at `room = |x(to) − x(from)| − 24 − disc` (12 on each side, as the constraint's 24 today;
`disc` 22 with `autonumber`, else 0), computed from the final columns, with the layout's measurer at
the label's font, through `wrapLines`. `\n` always breaks a line. The columns never leave a room
narrower than the longest word (D2), so a word is broken only where the floor of the heads leaves
less than that, which `wrapLines` handles. A self-call does not wrap: its label stays beside the
loop, broken at `\n` only, the lines centred on the loop's middle (the row grows when they are
taller than the loop).

A pull is what the person writes to bring a pair closer: a negative sum of the `gap` after the left
participant and the `gap` before the right one (what a head drag writes), and a `spacing` below the
default, by the difference. A pull is taken **from the natural distance**, so it moves the pair by
exactly its amount whether or not labels pushed it: `sequenceMove` adds the drag's delta to the
written `gap` (`editor/src/sequence.ts:150-161`), and the head lands under the pointer instead of
jumping by the room the labels had taken. A positive `gap` and a `spacing` at or above the default
add to the heads' distance as today, and a label still pushes past them.

- *Always wrap at the heads' distance (the first version of this change)*: drawn, it made every
  diagram with long labels narrow and tall, the gallery's "Asks for a fingerprint" on two lines
  with the room to widen; the owner's complaint was the refused drag, not the width.
- *One line, as today*: the owner's complaint; a long label is a refused drag (`-300 written, 106
  drawn`).
- *Wrap when pulled, the pull taken from the heads' distance*: the first drag of a pushed head
  would jump by the room the labels had taken.
- *A maximum label width (a theme token or a `wrap` property, Mermaid's `wrap`)*: another number
  to tune that says nothing a `gap` or a `spacing` does not.

**Decision:** labels keep their line; a pull from the natural distance wraps them (open question 1,
revised after the gallery was drawn). Drawings without a pull do not change.

### D2. A pull stops at the longest word

The pair is drawn at `max(floor, natural + pull)`. The natural distance is the one of today (heads,
`spacing` when at or above the default, positive `gap`s, each label's whole width plus 24 and the
disc, the row of a message's tags (D6), self-calls and side notes). The floor is half of each head
plus 8, the longest word of every label between them (its words split at spaces and `\n`) plus 24
and the disc, the row of a message's tags, self-calls and side notes. A message spanning several
columns pushes the natural columns with its whole width and the pulled ones with its longest word.
`layout.gap-floor` keeps its rule and message, its amount now measured from the natural distance:
it fires when the floor wins over a negative `gap`, which means the heads, a word, a row of tags, a
self-call or a note do not fit, and names the part of the gap that was drawn.

- *The whole label width as the floor (today)*: the cause of the complaint.
- *Enough room for at most three lines*: a label of sixty words still holds its pair apart, and
  "three" is arbitrary.
- *No floor from labels at all*: a single long word would be broken mid-word by a strong pull.

### D3. Rows grow down; the label block is the label box

A wrapped label of `n` lines is a block `labelHeight + (n − 1) × step` high, `step` being 1.25 times
the label size (the stickies' distance), as wide as its widest line plus 8. The row grows by
`(n − 1) × step`: the arrow sits at `y + block + 4`, under the last line, so the label keeps its
top and the events below move down. The block is centred at `at` along the arrow as the one-line
box is, its bottom where the one-line box's bottom is, and `label <message> at n% offset (dx, dy)`
moves the whole block; the room it wraps at does not change with the offset. A creating message
draws its new head lower by the extra lines. `emitter.message` draws one `TextItem` per line,
centred, in the label group. `LayoutResult.labels` holds the block, and a new
`LayoutResult.messageTexts: ReadonlyMap<string, MessageText>` holds, per message key, the room
(`area`: the block's top, the room's width centred on the block's centre), the `lines`, the `size`,
the `line` step and `wraps` (true when a pull caps the room; false for a self-call and for a pair
at its natural distance, whose label pushes its columns instead), in diagram coordinates, for the
inline editor (D13), which wraps only where the drawing will.

- *Growing upward, the arrow staying*: the label would cover the previous row; rows are laid top
  to bottom.
- *Lines at `relationLabelHeight` apart*: 18 units at 11 px, a loose paragraph; 1.25 is the
  stickies' and the notes' rhythm.

### D4. `tag "Text"` in the owner's block

A sequence message's block (calls, replies, async and two-way messages, self-calls, `return`) and
a participant's block take `tag "Text"`, repeated, in source order. The model reads it in
`elementBlock` beside `port`, `layer` and `link` (taken out before `readProperties`, so repeating it
is no `prop.duplicate` of the keyword), into `tags: readonly TagUse[]` on `Element` and `Relation`
(`TagUse { text, range, textRange }`), empty when none and in every other profile. The sequence
profile's element and relation tables gain `tag` (a new property kind `tag`), so the hints that
list a block's properties name it. Refused, each with a location:

- an empty text, or a text with a line break: `prop.invalid-value` ("a tag is one line of text");
- `tag t1 "Text"` (an id), `tag 12`, `tag "A" "B"`, a block or a chain: `prop.invalid-value` naming
  the form `tag "Text"`;
- the same text twice on one owner: `prop.duplicate` on the second, related to the first;
- `tag` in a group block of a sequence diagram, in a fragment (inside a call's block too), or at
  the diagram level: `prop.unknown` with the hint "a tag goes in the block of a message or a
  participant" (the diagram-level hint replaces the flow-profile one for `tag` in a sequence
  diagram). A `tag` anywhere among a call's own statements is the call's, before or after its
  events, since `tag` is no event keyword (`SequenceAnalyzer.relation` keeps it with the
  properties).

`tag` keeps its meaning in flow diagrams (`tag <id> "Text"`) and stays `prop.unknown` in flow,
free and C4 blocks.

- *`tags "A", "B"` as one property*: one statement for several tags, but adding, editing or
  removing one rewrites a list, and a comment cannot sit beside a tag.
- *`tag <id> "Text" on <message>` declarations, as flow's*: ids, a namespace entry and a reference
  per tag for a word on a message; messages are often anonymous, so `on` would need keys the text
  never writes.
- *Stereotypes in the label (`"«REST» Authorize"`)*: a convention inside a string the model cannot
  tell from text.

**Recommendation:** `tag "Text"`, a repeated text refused as `prop.duplicate` (open question 5):
two equal pills on one owner say nothing a single one does not.

### D5. Tags are annotations of their owner

A tag has no id, is not a target of `style`, `class`, `rule`, `animate`, `link` or a story, and is
coloured by the theme's `tag` and `tagText` tokens and sized by `tagSize`. It is drawn inside its
owner's scene group (D7), so a highlight, a pulse, a story's reveal, hide, focus or highlight of the
owner takes its tags with it.

- *Tags as elements with ids*: styleable and animatable one by one, at the price of D4's second
  alternative.
- *`rule tag { … }` in sequence diagrams*: one more rule kind; a theme already sets the two
  colours for every tag (open question 3).

**Recommendation:** theme colours only.

### D6. A message's tags sit on its arrow next to its source end

The pills of a message are a row, in source order left to right, 4 apart, centred on the arrow's
line, the row's end against the source end: 12 from the arrow's start when the message is
numbered (the disc's radius of 8 and 4), else 6 from it. The pill's fill covers the line under it. A message with
tags draws its label block `tagHeight / 2 + 2` higher, and its row is that much taller, so a
wrapped label never meets the pills. Its column constraint is also at least the row's width plus
24, the disc and the arrowhead's length (`arrowSize`). A self-call's tags sit on the loop's top
segment from its source end, and its label beside the loop starts after the wider of the loop and
the row.

- *Above or below the label at the middle*: a tag reads as part of the label; next to the source
  it reads as a property of the call, where a sequence diagram's numbers already sit.
- *At the target end*: the arrowhead is there.
- *Inside the label as text (`[PKCE] Authorize`)*: no pill, no colour, and the wrap would break it.

**Recommendation:** next to the source end (open question 4).

### D7. A participant's tags are a badge row over the top edge of its head

The pills of a participant are a row in source order, 4 apart, centred on the head's centre line;
for a box kind (participant, database, collections, queue) their middle is on the top edge of the
box as drawn (the front box of collections), for a figure (actor, boundary, control, entity) their
bottom is 4 above the figure. When any participant of the diagram has tags, the head row starts
lower by the room they need above it (`tagHeight / 2` for box kinds, `tagHeight + 4` for figures,
the larger), and a head drawn by `create` takes the same room in its row. The floor between two
columns counts the wider of each head and its row of pills.

- *At the top-right corner, like a notification badge*: reads as a count; several tags would run
  off the head's left (open question 2).
- *Inside the head under its label*: the head grows and the badge reads as a second label.
- *In the label (`"«external» Bank"`)*: as D4's third alternative.

**Recommendation:** centred on the top edge.

### D8. Tags in the scene, the result and the JSON

Each pill is a nested group `{ kind: "group", role: "tag", id: <owner>, tag: <index> }` holding
the pill `rect` and its `text`: in the head group for a participant, in the message group after
the label group for a message (motion's `beforeLabel`, `packages/motion/src/frames.ts:92-96`, then
runs particles under both). `SceneRole` gains `tag` and `GroupItem` an optional `tag: number`;
`renderSvg` writes `data-tag` (`packages/render/src/svg.ts:330-334`); the sketch passes take the
`tag` role (`packages/render/src/sketch.ts:30-38`); the label audit treats a `tag` group's rect as
its text's background, as it does a `label` group's (`packages/layout/src/audit.ts:241-243`), and
its texts as annotations (not checked against boxes). `LayoutResult.tags: ReadonlyMap<string,
readonly Box[]>` gives the pills of every owner in diagram coordinates. The model JSON writes
`tags` after `classes` on every element and relation of every profile: `[{ "text", "range" }]`,
`[]` when none; `version` stays `0.1`. The model diff reports `changed` with the part `tags` when an
element's or a relation's tags differ (`ChangedPart`, `packages/model/src/diff.ts:79-91`).

- *Tags drawn with the role `label`*: the canvas maps a press on a sequence label to its message
  and a double click to the label's editor (`hit()`, `app.ts:5614-5627`); tags need their own.
- *Top-level groups with synthetic ids (`api#tag1`)*: effects and stories address groups by id and
  would leave the tags behind their owner.

### D9. Activation bars are scene objects with their own ids

Each bar becomes its own group inside its lifeline's group, with `bounds`: a written bar has the
role `event` and its `activate` key as id; a call block's bar has the role `event` and the call's
key. `LayoutResult.boxes` gains the written bars by their `activate` key, and a new
`LayoutResult.bars: ReadonlyMap<string, BarGeometry>` gives, per `activate` key or call key,
`{ participant, box, depth, from, to, block }` (`to` the `deactivate` key, null when open; `block`
true for a call's). `eventInfos` sets `EventInfo.box` for an `activate` to its bar and adds
`EventInfo.pair` (an `activate`'s `deactivate` and the reverse, null when open). The drawing does
not change: the same rects, in the same order, in the same lifeline group.

- *Hit-testing bars geometrically in the canvas*: a second hit path beside the DOM's, and the
  status line, outline and context menu would each look bars up again.
- *A role of their own (`bar`)*: every consumer of `event` (selection, outline, presence, sketch)
  would learn one more role for what is an event's drawing.

A sketched theme seeds its jitter by group id (theme-tokens "Sketched strokes"), so the bars of
sketched sequence diagrams jitter differently once regrouped; their snapshots are re-recorded.

### D10. Selecting, moving and removing an activation

A press on a written bar selects its `activate` event (outline: its box; status line: "Activation
of `api` from `pay` to `receipt`", or "… from `pay` to the end"); a press on a call block's bar
selects the call. A selected written bar shows two handles, above its top and below its bottom
(outside the bar, so a 12-unit bar keeps both reachable). Dragging one is a new `barEnd` drag that
snaps to the boundary below the event row under the pointer and posts a new canvas action
`moveActivation { id, end: "start" | "end", row }` on the drop. The session plans it as:

- `start`: `moveEvent { event: <activate>, to: { after: row } }`, or `{ before: <first event of
  row's block> }` when `row` is a call with a block, so the bar starts at that call's arrow;
- `end`: `moveEvent { event: <deactivate>, to: { after: row } }`; on an open bar, `insertEvent {
  after: row, statement: "deactivate <participant>" }`.

`moveEvent` gains the destination form `to: { after: <event> } | { before: <event> }` (exactly one
of `direction` and `to`), which relocates the statement once through `relocate` and validates the
result once: an unknown event, the event itself, an event inside a moved fragment or call, and a
result that breaks the order-checked rules are refused (`edit.unsafe-target` or `edit.invalid-value`
naming the rule). Delete, Backspace and the bar's context menu entry **Remove activation** post
`remove`; `removeEvent` of an `activate` or a `deactivate` removes its pair (found as
`toggleActivation` finds it) in the same edit.

- *A batch of single `moveEvent` steps*: every intermediate text must compile without new errors,
  so a valid destination can be refused on the way (passing the other end of a nested activation),
  and a preview frame would compile once per step.
- *A new edit operation `moveActivation`*: a second relocation path beside `moveEvent`'s, which
  code actions and agents could not reuse.
- *A batch of two `removeEvent`s from the session*: the text's own services and agents would still
  hit the refusal.
- *No end handle on an open bar*: closing a bar would need the text or Alt+A twice.
- *A press on a call block's bar selecting the participant*: the bar is the call's doing; the
  call's own inspector and Alt+Shift+N are what change it.

**Recommendation:** the destination form, the pair in `removeEvent`, an end handle that writes a
`deactivate` on an open bar (open question 6), and the call selected by its block's bar (open
question 7).

### D11. The bar's end is previewed by the session, with the reason when refused

`moveActivation` joins `PreviewedAction`, and `previewAction` answers for a `barEnd` drag on a
sequence diagram (participant and event drags stay without previews). While the answer is on its
way, the canvas draws the handle and a guide at the snapped row; the session's drawing replaces the
stage when it comes. A refused move answers `svg: null` with a new `reason`; the canvas then draws
the handle in the theme's `danger` colour, the status line says the reason, and the drop writes
nothing.

- *A local preview only (the bar's end drawn at the pointer)*: the rows that a moved `deactivate`
  changes (fragments, nested bars) would be guessed, and a refusal would show only at the drop.

### D12. The Activate button and the inspector's checkbox

The sequence palette gains **Activate** (glyph: a lifeline with a bar; name "Activate the
receiver", title "Activate the receiver (Alt+A)", `aria-keyshortcuts` "Alt+A"), which posts the same
`toggleActivation` as Alt+A. It is disabled without a message or a participant selected, and
`aria-pressed` is true when the selected message's receiver is activated after it, written or by
its block. `RelationInfo.activation: "written" | "block"` (absent otherwise), computed by the
editor from the message's next sibling event and its block, feeds both. A click on a call whose
block activates its receiver gets the session's refusal in the status line, as Alt+A does.

The inspector of a message that is not a `return` shows **Activates the receiver**, a new field type
`boolean` drawn as a checkbox: `on` when written, writing or removing the pair through
`toggleActivation`; on a call whose block activates the receiver it is `on`, `readonly`, with a new
`InspectorField.note`, "The block of `pay` activates `api`", shown under it.

- *An `enum` off/on, as effects are*: drawn as a toggle button inside the Effects card; a checkbox
  among the message's fields says a fact of the message.
- *A key of its own*: Alt+A already is one, and A is the actor.

### D13. Typing a wrapped label: the editor grows down

`TextPlace` gains `wrap?: "shrink" | "grow"`: `shrink` for stickies (their text shrinks to the
card, today's behaviour), `grow` for a sequence message label that wraps. `textPlaces` builds a
message label's place from `messageTexts`: `area` the room, the anchor the block's middle, all the
drawn lines, `lines: true`. `openInline` reads `place.wrap` instead of testing for a sticky. With
`grow`, the editor is exactly the room's width at the zoom, wraps there (`white-space: pre-wrap`),
keeps its top where the label's first line is drawn, and grows down as lines are added; Enter
commits, Shift+Enter writes `\n`. A self-call's label keeps today's unwrapped editor.

- *An unwrapped editor that the commit redraws wrapped*: what is typed would not look like what is
  drawn.
- *An editor centred on the block*: the drawn label keeps its top and the arrow moves down; an
  editor growing both ways would move under the caret.

### D14. Tags on the canvas

T on the sequence profile is `createTag`, which on a sequence diagram posts a new canvas action
`addTag { ids }`; the **Tag** palette button (name "Tag", title "Tag (T)", disabled without a
message or participant selected) does the same. The session plans `addTag { target, targetKind,
text }` with the default word ("Tag", "Marca") for the selected message, else the selected
participant, and opens the inline editor on the new pill (`pendingEdit` with a tag target). A tag
is not selectable on its own: a press on a pill selects its owner and a drag drags the owner. A
double click on a pill opens the editor over it (`TextPlaces.tags`); committing posts
`setTag { ids, index, text }`, an empty text posts `removeTag`. The context menu of a pill offers
**Edit tag** and **Remove tag**. The inspector of a message or participant shows **Tags**: one
`text` field per tag (`tag.<n>`) with a **Remove** button (`InspectorField.button`) and an empty
`tag.new` field whose commit adds one; the canvas draws the run of `tag.*` fields as one list under
the heading. The edit operations:

- `addTag { diagram, target, targetKind: "element" | "relation", text, index? }` writes `tag
  "<text>"` after the owner's last tag, else after the last property statement of the block, else
  first in it; a statement without a block gains ` { tag "<text>" }`; an implicit participant is
  declared with its block first; `index` inserts before the tag at that index;
- `setTag { …, index, text }` rewrites the string; `removeTag { …, index }` deletes the statement,
  and the block when it held nothing else;
- refused: a diagram that is not a sequence diagram, a target that is not a participant or a
  message (`edit.unsafe-target`); an index out of range (`edit.unsafe-target`); an empty text, a
  line break or a text the owner already has (`edit.invalid-value`).

- *A dedicated list field type with array values*: a new value shape through the protocol, the
  session and both inspectors, where text fields with buttons already exist.
- *A placing tool (click a message to tag it)*: one more armed state for an action that has a
  selection to act on.

### D15. Language services

Completion offers `tag` among the properties of a message block and a participant block of a
sequence diagram (not in group blocks, fragments or flow blocks); hover on `tag "PKCE"` says it is a
tag of the message `pay` (or `customer -> api`) or of the participant `api`. The VS Code grammar
already scopes `tag` as a keyword (`packages/vscode/syntaxes/meltemi.tmLanguage.json:98`).

- *A quick fix that moves a misplaced `tag` into the nearest message's block*: which message is
  meant is a guess; the hint says where tags go.
- *Tags in document symbols*: they have no id to go to.

### D16. Order with the sibling change

`gantt-diagrams` (decision 0066) is proposed at the same time and touches the palette, the
keyboard table, `docs/editor.md` and the changelog's 1.11.0 section; the two share no requirement.
The one applied second rebases its edits of those files on the first, and the MODIFIED blocks of
this change are rebased on the then-current main specs before archiving.

- *One change for both*: a new diagram type and three repairs of an existing one would wait on
  each other's open questions.

### D17. Motion

Every movement uses the canvas's motion tokens (`--mdg-motion-fast` 120 ms, `--mdg-motion` 160 ms,
`--mdg-motion-slow` 220 ms, `--mdg-ease`, `--mdg-pop-scale`; `packages/canvas/canvas.css:15-41`) and
drops to 0 under `prefers-reduced-motion`.

- **A wrapped label while typing**: the editor's height follows its lines at once (text must be
  where the caret is); the commit redraws, and the rows below move with the existing render.
- **A new tag** pops in from `--mdg-pop-scale` over `--mdg-motion` with its editor, as a new
  element's outline does; a removed tag fades out over `--mdg-motion-fast` before the render.
- **A hovered pill** shows the owner's hover outline; a hovered bar shows its own outline over
  `--mdg-motion-fast`, so the person sees it is an object before pressing.
- **Bar handles** fade and scale in from `--mdg-pop-scale` over `--mdg-motion-fast` when the bar
  is selected; while dragged, the handle follows the pointer and snaps to rows with a
  `--mdg-motion-fast` slide on `--mdg-ease`; a refused row turns it `danger` over the same time.
- **The Activate button** moves between pressed and not over `--mdg-motion-fast`, as the other
  pressed buttons do.
- **The checkbox** follows the platform's own control, with no animation of its own.

### D18. Packages and public interfaces

- `@meltemi/diagrams-model` (`packages/model`): `TagUse`; `Element.tags` and `Relation.tags`; the
  property kind `tag` in the sequence profile's element and relation tables; `ElementJson.tags`
  and `RelationJson.tags`; the `ChangedPart` `tags` of `diffDocuments`.
- `@meltemi/diagrams-layout` (`packages/layout`): `LayoutResult.messageTexts` (`MessageText`),
  `LayoutResult.bars` (`BarGeometry`), `LayoutResult.tags`, written bars in `LayoutResult.boxes`;
  `SceneRole` `tag` and `GroupItem.tag`; `auditLabels` taking a tag's pill as its background.
- `@meltemi/diagrams-render` (`packages/render`): `data-tag` on a tag's group; the `tag` role
  sketched.
- `@meltemi/diagrams-edit` (`packages/edit`): the operations `addTag`, `setTag` and `removeTag`;
  `moveEvent.to`; `removeEvent` of an activation removing its pair.
- `@meltemi/diagrams-editor` (`packages/editor`): `TextPlace.wrap`, `TextPlaces.tags` and the
  `messageTexts` argument of `textPlaces`; `ElementInfo.tags`, `RelationInfo.tags`,
  `RelationInfo.activation`, `EventInfo.pair` and an activation's `EventInfo.box`; `FieldType`
  `boolean` and `InspectorField.note`; the canvas actions `addTag`, `setTag`, `removeTag` and
  `moveActivation`, `PreviewedAction` with `moveActivation` and the preview answer's `reason`;
  the key `createTag` on the sequence profile.
- `@meltemi/diagrams-canvas` (`packages/canvas`): `InlineOptions.wrap` as `"shrink" | "grow"` and
  `grownFrame`; `barRowAt` (`src/bars.ts`); the **Tag** and **Activate** buttons, the bar
  handles, the pill's and the bar's context menus.

### Owner's answers (2026-10-29)

The owner reported the three problems and asked for them to be fixed, the Gantt diagrams being
the one item to stay a proposal; the recommendation of every open question below is taken, the
first one revised once drawn (D1): labels keep their line and wrap when a `gap` or a `spacing`
pulls their participants closer, a participant's badges sit in a row centred
over the head's top edge, tags take the theme's `tag` and `tagText` only, a message's tags sit on
the arrow next to the source end, the same tag twice on one owner is `prop.duplicate`, dragging
the end handle of an open bar writes a `deactivate` at that row, and a press on a call block's bar
selects the call.

## Risks / Trade-offs

- [A negative `gap` means something new when labels push the pair] → it was measured from the
  heads' distance and was mostly absorbed (the owner's `-300 written, 106 drawn`); it is now
  measured from the natural distance, so a written `gap` moves the pair by its amount. A diagram
  with a negative `gap` and long labels draws closer than before; the corpus and the gallery are
  re-recorded and looked at. Drawings without a pull do not change.
- [A small `spacing` makes tall labels] → the longest-word floor keeps every word whole; the person
  widens with `spacing` or a `gap`.
- [The editor wraps a pixel differently from the layout] → it uses the room and the size the layout
  used; the commit redraws, nothing is written from the editor's own wrap.
- [Badges above the heads move every row down when one participant has a tag] → only diagrams with
  tags change; the room is a pill's height at most.
- [A row of pills on a short arrow covers a crossing lifeline] → the column constraint gives the
  row its room between the ends; crossing lifelines are drawn under messages already.
- [Bar handles on a 12-unit bar overlap] → they sit outside the bar's ends.
- [Session previews on sequence diagrams] → only for `barEnd`; the test that a participant drag
  asks for no preview (`packages/vscode/test/webview/run.ts:6438`) stays.
- [Regrouped bars change the sketch jitter] → sketched sequence snapshots are re-recorded.
- [`removeEvent` of an `activate` now removes a second statement] → the pair is what the bar is;
  the edit is one undo step and the scenario says both go.
- [The gantt proposal edits the same toolbar and docs] → D16.

## Open Questions

1. **When labels wrap.** Only when a negative `gap` or a `spacing` below the default pulls the pair
   closer, the pull taken from the distance the labels pushed (decided, D1; always wrapping was
   the first recommendation and was dropped once drawn).
2. **Participant badges.** A row centred over the head's top edge (recommended, D7), or at its
   top-right corner like a notification badge?
3. **Tag colours.** The theme's `tag` and `tagText` only (recommended, D5), or also `rule tag { … }`
   in sequence diagrams?
4. **Message tags.** On the arrow next to the source end (recommended, D6), or under the label at
   the middle of the arrow?
5. **The same tag twice on one owner.** `prop.duplicate` (recommended, D4), or allowed and drawn
   twice?
6. **The end handle of an open bar.** Dragging it writes a `deactivate` at the row (recommended,
   D10), or an open bar shows no end handle?
7. **A press on a call block's bar.** Selects the call (recommended, D10), or the participant as a
   press on its lifeline does?
