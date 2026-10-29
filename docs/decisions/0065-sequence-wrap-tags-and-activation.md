# 0065. Wrapped message labels, tags and activations on the canvas in sequence diagrams

Status: accepted (sequence-wrap-tags-and-activation change, 29 October 2026). Extends decisions
0019 and 0060, and wraps text with the measure of decision 0064.

## Context

The owner reported three problems after drawing a sequence diagram on the canvas. First, a head
dragged towards its neighbour landed short: the status line said `Gap before participant1: -300
written, 106 drawn: the labels need the room.`, because the label "Esto es una prueba de un texto
Largo", sent across another lifeline, was measured and drawn on one line and its whole width held
the two columns apart; a `\n` written in a message label was drawn as a space. Second, sequence
diagrams had no way to mark a message as "PKCE", "v2" or "idempotent", or a participant as
"external": `tag` was a flow declaration only, refused in a sequence diagram. Third, an activation
was code only: Alt+A and the context menu toggled one, but there was no button and no inspector
field, a bar was a rectangle inside its lifeline's group that a press could not find, and removing
an `activate` left its `deactivate` unmatched, which the edit refused.

The base was ready for each: `wrapLines` breaks a text at a width with the layout's measurer
(decision 0064), the canvas's inline editor already wraps a sticky's text, the flow tag's pill,
colours and font exist, and `moveEvent` relocates an event statement with its comments.

## Decision

- **A label keeps its line until its participants are pulled closer** (D1). The label of a
  message between two participants stays on one line and pushes its columns apart as before: that
  is the pair's natural distance. A pull, a negative sum of the `gap` after the left participant
  and the `gap` before the right one (what a head drag writes) or a `spacing` below the default by
  the difference, is taken from the natural distance, so a dragged head lands where it is dropped;
  the labels between the pair then wrap at the room left, the lifelines' distance less 12 on each
  side and less the number's disc (22) under `autonumber`, through `wrapLines`: at each `\n`, then
  at spaces, a word wider than the room between its letters. `\n` always breaks a line. A
  self-call's label does not wrap: it stays beside the loop, broken at `\n` only. The first version
  of this change wrapped every label at the heads' distance; drawn, it made every diagram with long
  labels narrow and tall (the gallery's "Asks for a fingerprint" on two lines with room to widen),
  and it was revised the same day.
- **A pull stops at the longest word** (D2). A pair is drawn at the larger of its floor and its
  natural distance plus its pull. The floor is half of each head plus 8, the longest word of every
  label between them plus 24 (and the disc), the row of a message's tags, self-calls and side
  notes; a message spanning several columns pushes the natural columns with its whole label and
  the pulled ones with its longest word. `layout.gap-floor` keeps its rule and message, the amount
  it names now measured from the natural distance.
- **Rows grow down** (D3). A label of `n` lines is a block `relationLabelHeight + (n − 1) × step`
  high, `step` 1.25 times the label size; the arrow sits under the last line and the events below
  move down; `label <message> at n% offset (dx, dy)` moves the whole block without changing the
  room. The emitter draws one text item per line. `LayoutResult.messageTexts` gives each message's
  room, lines, size, line step and `wraps` (true when a pull caps the room; false for a self-call
  and at the natural distance), for the editor.
- **`tag "Text"` in the owner's block** (D4). A sequence message's block (calls, replies, async and
  two-way messages, self-calls, `return`) and a participant's block take `tag "Text"`, repeated, in
  source order; in a call's block it is the call's, not an event. The model records
  `tags: readonly TagUse[]` (`{ text, range, textRange }`) on every `Element` and `Relation`, empty
  when none and in every other profile. An empty text or a line break and any other form are
  `prop.invalid-value`; the same text twice on one owner is `prop.duplicate`; `tag` in a group
  block, a fragment or at the diagram level is `prop.unknown` with the hint saying where tags go.
  `tag <id> "Text"` keeps its flow meaning.
- **Tags are annotations of their owner** (D5). No id, no `style`, `class`, `rule`, `animate`,
  `link` or story target; coloured by the theme's `tag` and `tagText` and sized by `tagSize`; drawn
  inside the owner's scene group, so effects and stories take them with it.
- **A message's tags sit on its arrow next to the source end** (D6): a row of pills 4 apart,
  centred on the line, 6 from the arrow's start (12 when numbered), the label lifted by half a pill
  and 2 and the row as much taller; the pair's constraint holds the row plus 24, the disc and the
  arrowhead. A self-call's row sits on the loop's top segment and its label after it.
- **A participant's tags are a badge row over its head** (D7): centred, their middle on the top
  edge of a box kind, their bottom 4 above a figure; when any participant has tags, the head row
  (and a head drawn by `create`) starts lower by the room they need, and the column floor counts
  the wider of a head and its row.
- **Tags in the scene, the result and the JSON** (D8). Each pill is a group of role `tag` with its
  owner's id and its index (`data-tag` in the SVG), in the head group or after the message's label
  group; the sketch passes take it; the label audit treats its rect as its text's background and
  does not check its text against boxes. `LayoutResult.tags` gives every owner's pills. The model
  JSON writes `tags` after `classes` on every element and relation (`[{ "text", "range" }]`, `[]`
  when none) and stays `0.1`; the model diff reports the part `tags`.
- **Activation bars are scene objects** (D9). Each bar is its own group of role `event` inside its
  lifeline's group, with `bounds`: a written bar has its `activate` key as id, a call block's bar
  the call's key. `LayoutResult.boxes` holds the written bars, and `LayoutResult.bars` gives every
  bar `{ participant, box, depth, from, to, block }`. The drawing does not change.
- **Selecting, moving and removing an activation** (D10). A press on a written bar selects its
  `activate` and the status line names the participant and the messages it spans; a press on a
  call block's bar selects the call. A selected written bar shows a handle above and below it; the
  `barEnd` drag snaps to event rows and drops `moveActivation { id, end, row }`, which the session
  plans as `moveEvent` with the new destination form `to: { after | before: <event> }` (exactly
  one of `direction` and `to`, relocated and checked once), before the first event of a call's
  block for a top handle on that call, and as `insertEvent` of a `deactivate` for the bottom handle
  of an open bar. `removeEvent` of an `activate` or a `deactivate` removes its pair in the same
  edit; Delete and **Remove activation** use it. A removal of several things reads every pair on
  the text first and removes each end by its key with `alone: true`, so no end is paired again
  with another activation's after an earlier removal, and the other end of an activation a removed
  fragment or call cuts in two goes with it.
- **The session previews a bar's end** (D11). `moveActivation` joins the previewed actions on
  sequence diagrams (participant and event drags stay without previews); a refused move answers
  with its `reason`, the handle turns `danger`, the status line says the reason and the drop
  writes nothing.
- **The Activate button and the inspector's checkbox** (D12). The sequence palette's **Activate**
  ("Activate the receiver (Alt+A)") posts the same `toggleActivation` as Alt+A, disabled without a
  message or participant selected and pressed when `RelationInfo.activation` says the receiver is
  activated after the message, written or by its block. The inspector of a message that is not a
  `return` shows **Activates the receiver**, a new field type `boolean` drawn as a checkbox, and on
  a call whose block activates the receiver it is checked, read-only, with a new
  `InspectorField.note` saying why.
- **Typing a wrapped label** (D13). `TextPlace.wrap` is `shrink` for stickies and `grow` for a
  message label that wraps; with `grow` the inline editor is the room's width at the zoom, wraps
  there, keeps its top on the label's first line and grows down. Enter commits, Shift+Enter writes
  `\n`; a self-call's label keeps the unwrapped editor.
- **Tags on the canvas** (D14). T on the sequence profile and the **Tag** palette button post
  `addTag`, which the session plans as the edit `addTag` with the word "Tag" ("Marca") for the
  selected message, else participant, and opens the editor on the new pill. A pill is not
  selectable on its own: a press selects its owner. A double click edits the pill (`setTag`, an
  empty text `removeTag`); its context menu offers **Edit tag** and **Remove tag**; the inspector
  lists **Tags** as `tag.<n>` text fields with **Remove** and an empty `tag.new` field. The edit
  operations `addTag`, `setTag` and `removeTag` write and remove the statements, creating a block
  (and declaring an implicit participant) or removing an emptied one, and refuse a diagram that is
  not a sequence diagram, a target that is no participant or message, a bad index, an empty or
  multi-line text and a repeated one.
- **Language services** (D15). Completion offers `tag` in message and participant blocks of
  sequence diagrams only; hover names a tag's message or participant.
- **The sibling change** (D16). `gantt-diagrams` (decision 0066) touches the palette, the keys,
  the editor docs and the changelog too; the one applied second rebases on the first.
- **Motion** (D17). The canvas's motion tokens, zero under `prefers-reduced-motion`: a new pill
  pops in with its editor, a removed one fades out, a hovered bar shows its outline, bar handles
  fade and scale in and slide from row to row, a refused row turns `danger`, the Activate button
  changes state over `--mdg-motion-fast`; the checkbox is the platform's.
- **Packages** (D18). The public surface above lives in `@meltemi/diagrams-model`,
  `@meltemi/diagrams-layout`, `@meltemi/diagrams-render`, `@meltemi/diagrams-edit`,
  `@meltemi/diagrams-editor` and `@meltemi/diagrams-canvas`.

The owner took every recommendation on 29 October 2026, the first one revised once drawn: labels
keep their line and wrap when a `gap` or a `spacing` pulls their participants closer, badges sit
in a row over the head's top edge, tags take the theme's colours only, a message's tags sit next
to the source end, a repeated tag is `prop.duplicate`, the end handle of an open bar writes a
`deactivate`, and a press on a call block's bar selects the call.

## Alternatives considered

- **Always wrapping at the heads' distance** (the first version of this change): drawn, every
  diagram with long labels became narrow and tall, though the owner's complaint was the refused
  drag, not the width.
- **One line, as before**: a long label is a refused drag (`-300 written, 106 drawn`).
- **Wrapping when pulled, the pull taken from the heads' distance**: the first drag of a pushed
  head would jump by the room the labels had taken.
- **A maximum label width** (a theme token or a `wrap` property, as Mermaid's `wrap`): another
  number to tune that says nothing a `gap` or a `spacing` does not.
- **Room for at most three lines, or no floor from labels at all**: a label of sixty words would
  still hold its pair apart, or a single long word would be broken mid-word by a strong pull.
- **Rows growing upward**: the label would cover the previous row.
- **`tags "A", "B"` as one property**: editing one tag would rewrite a list, and a comment could
  not sit beside a tag.
- **`tag <id> "Text" on <message>` declarations, as flow's**: an id and a reference per word, and
  anonymous messages would need keys the text never writes.
- **Stereotypes in the label (`"«REST» Authorize"`)**: a convention inside a string, which the
  wrap would break and the model could not tell from text.
- **Tags as elements with ids, or `rule tag { … }`**: styleable one by one at the price of ids, or
  one more rule kind where the theme already sets both colours.
- **Message tags above or below the label, or at the target end**: they would read as part of the
  label, and the arrowhead is at the target.
- **Participant badges at the top-right corner**: they read as a count, and several would run off
  the head.
- **Tags drawn with the role `label`, or as top-level groups with synthetic ids**: the canvas maps
  a label to its message's editor, and effects and stories address groups by id and would leave
  the tags behind.
- **Hit-testing bars geometrically in the canvas, or a role `bar`**: a second hit path, or one more
  role for every consumer of `event`.
- **Moving a bar's end as a batch of one-step moves**: every intermediate text must compile, so a
  valid destination could be refused on the way, and a preview would compile once per step.
- **A new edit operation `moveActivation`, or two `removeEvent`s from the session**: a second
  relocation path that code actions and agents could not reuse, and the text's own services would
  still meet the refusal.
- **No end handle on an open bar**, or **a press on a call block's bar selecting the participant**:
  closing a bar would need the text or Alt+A twice, and the bar is the call's doing.
- **An `enum` off/on for Activates the receiver, as effects are**: a toggle button inside the
  Effects card, where a checkbox among the message's fields says a fact of the message.
- **An unwrapped editor that the commit redraws wrapped, or an editor centred on the block**: what
  is typed would not look like what is drawn, or the editor would move under the caret.
- **A dedicated list field type for Tags, or a placing tool**: a new value shape through the
  protocol and both inspectors, or one more armed state for an action that has a selection.

## Consequences

- The language stays 0.2 and the model JSON 0.1: `tag "Text"` in a block and the `tags` key are
  additive. A `\n` in a message label, drawn as a space before, breaks the line.
- Drawings without a pull do not change. A negative `gap` is now measured from the natural
  distance, so a diagram with a negative `gap` and long labels between that pair draws it closer
  than before, its labels wrapped, and `layout.gap-floor` names a different amount. The bars of
  sketched sequence diagrams jitter differently once regrouped: the corpus, acceptance, gallery
  and visual snapshots are re-recorded and looked at. Every model JSON gains `tags`.
- New public surface: `TagUse`, `Element.tags` and `Relation.tags`, `ElementJson.tags` and
  `RelationJson.tags`, the diff part `tags`; `LayoutResult.messageTexts` (`MessageText`),
  `LayoutResult.bars` (`BarGeometry`) and `LayoutResult.tags`, the scene role `tag` and
  `GroupItem.tag`; `moveEvent.to`, `activationPair`, and the operations `addTag`, `setTag` and
  `removeTag`; `TextPlace.wrap`, `RelationInfo.tags` and `activation`, `ElementInfo.tags`,
  `EventInfo.pair`, the field type `boolean` and `InspectorField.note`, and the canvas actions
  `addTag`, `setTag`, `removeTag` and `moveActivation`.
- `removeEvent` of an `activate` now removes a second statement, its `deactivate`, in the same
  undo step.
- The corpus gains `valid/sequence/tags.meltemi`, and the invalid cases of `prop.invalid-value` and
  `prop.unknown` gain the refused tags.
- Not done: importing tags or wrapped labels from Mermaid (`%%{wrap}%%`, `<br/>`) or PlantUML
  (stereotypes), tags with their own id, style or effect, and moving a call block's bar by its
  ends, which the block decides.
