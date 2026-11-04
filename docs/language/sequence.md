# Sequence diagrams

[Español](../es/language/sequence.md)

A sequence diagram shows participants left to right and what happens between them top to bottom:
calls, replies, activations, notes, alternatives and loops. The order of the statements is the
order of the events, so the drawing never needs coordinates.

```text
language "0.2"

diagram payment: sequence {
  theme "editorial.light"
  autonumber

  actor customer "Cliente"
  participant api "API"
  participant bank "Banco"

  customer -> api: "Pagar" as pay
  activate api
  api -> bank: "Autorizar" as authorize

  alt result "Aprobado" {
    bank --> api: "OK" as approved
    api --> customer: "Confirmación" as success
  } else "Rechazado" {
    bank --> api: "Rechazo" as declined
    api --> customer: "Reintentar" as retry
  }

  deactivate api

  scenario approved "Pago aprobado" {
    choose result "Aprobado"
  }
}
```

Sequence diagrams compile into the same model as flow and free diagrams (decision 0019):
participants are elements, participant boxes are groups and messages are relations. Ids,
labels, descriptions, `class`, `style`, `rule`, `animate`, `link`, themes, presets, canvases and
the brand frame work as in the other profiles. Their own statements are below.

## Participants

| Declaration                  | Head                                   |
| ---------------------------- | -------------------------------------- |
| `participant <id> ["Label"]` | a box with the label                   |
| `actor <id> ["Label"]`       | a person above the label               |
| `boundary <id> ["Label"]`    | the UML boundary figure                |
| `control <id> ["Label"]`     | the UML control figure                 |
| `entity <id> ["Label"]`      | the UML entity figure                  |
| `database <id> ["Label"]`    | a cylinder                             |
| `collections <id> ["Label"]` | stacked boxes                          |
| `queue <id> ["Label"]`       | a horizontal cylinder                  |
| `group <id> ["Label"] { … }` | a box around the participants it holds |

`id["Label"]` declares a `participant` and `id[("Label")]` a `database`. A participant that only
messages mention is an implicit `participant`, labelled with its id. Participants stand in the
order of the source: declared ones where they are declared, implicit ones at their first mention.
Participant blocks take `description`, `class`, `link` and `tag` ([tags](#tags)); groups hold
participant declarations only.

## Messages

```text
a -> b: "Call" as call          // a call: solid line, filled arrowhead
b --> a: "Reply" as reply       // a reply: dashed line, open arrowhead
a -> c: "Event" as event { kind async }   // async: solid line, open arrowhead
a -> a: "Validate"              // a self-call loops to the right
a <-> c: "Sync"                 // two-way: the same head at both ends
```

`arrowhead` and `arrowtail` styles give a message any head at either end
([styles.md](styles.md#arrow-heads)). A message is a call or a reply, so the lines without heads,
`--` and `---`, are not messages: `prop.invalid-value` on the token names the four arrows.

`kind sync` is the default and is never written. Messages take `description`, `class`, `kind` and
`tag` ([tags](#tags)); `label <message> at 50% offset (dx, dy)` in `placement` moves a label, all
its lines, along its arrow. `autonumber` numbers the messages from 1 in small discs; `autonumber 10`
starts at 10.

A message's label stays on one line and holds its two participants apart as far as it needs
([columns](#layout)). When a negative `gap`, or a `spacing` below the default, pulls them closer,
the label wraps at the room left between their lifelines: their distance less 12 units on each
side, and less the number's disc under `autonumber`. It breaks at spaces, a word wider than the
room between its letters, and `\n` written in the label always starts a line. The lines are 1.25
times the label's size apart, the arrow is drawn under the last one and the events below move
down, so a pulled pair makes a taller row instead of refusing the gap. Moving a label with
`label … at` keeps its lines. A self-call's label stays beside its loop, broken only where `\n` is
written.

```text
customer -> api: "Pay for the order with the saved card" as pay   // one line, api further right
api -> bank: "Authorize\nthe card" as authorize                    // two lines, always

placement {
  gap api -40   // api 40 closer than the label held it: the label of pay wraps
}
```

### Calls and returns

A call's block holds what the call causes, besides its properties: the events written in it happen
while the receiver handles the call, and `return` answers it.

```text
customer -> api: "Pay" as pay {
  api -> bank: "Authorize" as authorize {
    return "Approved" as approved   // bank --> api
  }
  return "Receipt" as receipt       // api --> customer
}
```

- A block with events keeps the receiver active from the call to its last event, as an `activate`
  and a `deactivate` would; a call with events inside another draws its own bar on its receiver,
  nested when that receiver is already active.
- `return ["Label"] [as <id>] [{ … }]` is a reply from the receiver back to the caller of the call
  around it: a dashed message whose ends and line come from the call. It is the last event of its
  list; a `return` in a branch of a fragment ends that branch only.
- A `return` outside a call's block, or an event after a `return` in the same list, is
  `sequence.return`.
- A call's block holds its properties (`kind`, `description`, `class`, `tag`) and its events; a
  `return`'s own block takes properties only.

## Tags

`tag "Text"` in the block of a message or a participant marks it with a short word: a protocol, a
version, a property ("PKCE", "v2", "idempotent", "external").

```text
participant bank "Bank" { tag "external" }   // a badge over the head

api -> bank: "Authorize" as authorize {
  tag "PKCE"                                 // pills on the arrow, next to its source
  tag "v2"
}
```

- A block takes any number of tags, in order, among its other properties. Every message takes
  them, a self-call and a `return` too; in a call's block a tag is the call's, before or after its
  events, never an event.
- A message's tags are pills on its arrow, left to right in source order, 4 units apart, next to
  its source end: 6 units from the arrow's start, 12 when the message is numbered. Its label sits
  higher by half a pill and 2, so they never meet. A self-call's pills sit on the top of its loop,
  and its label after them.
- A participant's tags are badges centred over its head: their middle on the top edge of a box
  (participant, database, collections, queue), their bottom 4 units above a figure (actor,
  boundary, control, entity). When any participant has tags, the row of heads starts lower to
  make room for them, and so does a head drawn by `create`.
- Pills look like a flow tag: the theme's `tag` fill and `tagText` colour, at `tagSize` in the
  mono font. A tag has no id, so `style`, `class`, `rule`, `animate`, `link` and stories never
  name it; an effect, a highlight or a story that shows, hides or focuses its owner takes its tags
  with it.

| Written                                                       | Reported                                             |
| ------------------------------------------------------------- | ---------------------------------------------------- |
| `tag ""`, or a text with a line break                         | `prop.invalid-value`: a tag is one line of text      |
| `tag t1 "PKCE"`, `tag 12`, `tag "A" "B"`, a block             | `prop.invalid-value`, naming the form `tag "Text"`   |
| the same text twice on one owner                              | `prop.duplicate` on the second, related to the first |
| `tag` at the diagram level, in a group block or in a fragment | `prop.unknown`, with a hint saying where tags go     |

`tag <id> "Text"` stays the flow profile's pill ([grammar-0.2.md](grammar-0.2.md#flow-vocabulary)),
and `tag "Text"` in a block of a flow, free or C4 diagram is `prop.unknown`. The model JSON lists
the tags of every element and relation as `tags` ([model-json.md](model-json.md#element)).

## Events

Every statement below is an event. Events happen in the order they are written.

| Statement                                                           | Meaning                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `activate <p>`, `deactivate <p>`                                    | starts or ends an activation bar; bars nest 5 apart       |
| `create <p>`                                                        | the head is drawn here; the next message to it ends there |
| `destroy <p>`                                                       | the lifeline ends with a cross                            |
| `note [<id>] over <p>[, <q>…] "Text"`                               | a note across the participants                            |
| `note [<id>] left of <p> "Text"`, `note [<id>] right of <p> "Text"` | a note beside one lifeline                                |
| `divider "Label"`                                                   | a double line across every lifeline                       |
| `delay ["Label"]`                                                   | a gap in time                                             |
| `return ["Label"] [as <id>]`                                        | in a call's block, the reply to the caller                |

An activation bar starts at the message that leads into its `activate` and ends at the message
before its `deactivate`. Activations still open at the end reach the end of the lifeline. A call
whose block holds events draws the receiver's bar from the call's arrow to the block's last event,
without an `activate`; a `deactivate` that would end that bar is `sequence.activation`.

## Fragments

| Fragment                                                   | Meaning                        |
| ---------------------------------------------------------- | ------------------------------ |
| `alt [<id>] ["Condition"] { … } else ["Other"] { … } …`    | alternatives                   |
| `opt [<id>] ["Condition"] { … }`                           | an optional part               |
| `loop [<id>] ["Until …"] { … }`                            | a repeated part                |
| `par [<id>] ["Label"] { … } and ["Label"] { … } …`         | parallel parts                 |
| `break [<id>] ["Condition"] { … }`                         | ends the enclosing interaction |
| `critical [<id>] ["Label"] { … } option ["Other"] { … } …` | an atomic part with options    |
| `region [<id>] ["Label"] { … }`                            | a labelled region              |

Fragments hold events and nested fragments, never declarations. They are drawn as a frame around
the lifelines their events touch, with the operator in a tab, conditions in brackets and dashed
lines between branches. Conditions are descriptions, never logic.

## Ids and spacing

Notes and fragments with an id, and messages named with `as <id>`, share the diagram's namespace
with participants. Other events have keys such as `activate#1` or `note#2`, which tools use and
the text never writes.

```text
spacing 56                 // between the heads of neighbouring participants (40)

placement {
  space authorize 28       // 28 more above the message, note or fragment
  space poll 20 after      // 20 more below it
  gap bank 40              // 40 more left of the participant
  gap ledger 24 after      // 24 more right of it
  gap api -12              // 12 closer to the participant on its left
}
```

`spacing` is the distance between the heads of neighbouring participants before their gaps: 40
when it is not written, from 0 to 400. `space` names a message, note or fragment with an id; `gap`
names a participant. Both take a side after the amount: `before`, the default, which is never
written (above an event, left of a participant), or `after` (below it, right of it); a target
takes one statement per side. A `space` is 0 or more. A `gap` may be negative to bring a
participant closer to its neighbour, except on the outer side: a negative `gap` before the first
participant or after the last is `prop.invalid-value`, since nothing is there to tighten. Neither
ever changes the order of events. `style`, `class` and `rule` apply to participants, named
messages, and notes and fragments with ids; `rule note { … }` and `rule fragment { … }` style every
note and every fragment.

## Order-checked rules

Events are checked in order, with a state per participant (active depth, created, destroyed):

| Code                  | When                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `sequence.activation` | `deactivate` of a participant that is not active, or that would end a call block's bar       |
| `sequence.return`     | `return` outside a call's block; an event after a `return` in the same list                  |
| `sequence.lifecycle`  | an event after `destroy`; `create` after the participant appeared, or twice; `destroy` twice |
| `ref.unknown-element` | an unknown participant in an event, or a group used as a participant                         |

The branches of `alt`, `par` and `critical` each start from the state before the fragment, and the
state after it is the first branch's. Other fragments are checked like their body.

## Scenarios

A scenario is one path through the alternatives and loops, for exports and, later, playback.

```text
scenario declined "Pago rechazado" {
  choose result "Rechazado"   // a branch of alt or critical, by condition or 1-based number
  repeat polling 3            // the passes of a loop, 1 to 100
  skip coupon                 // an opt or break not taken
  take audit                  // an opt or break taken (the default)
}
```

- Unlisted fragments take their first branch, one pass, and are taken. `par` and `region` are
  always drawn whole.
- An unknown fragment, an operator that does not take the statement, an unknown branch and passes
  out of range are `sequence.scenario`.
- A scenario draws the chosen path: decided `alt`, `critical`, `opt` and `break` lose their frames,
  a loop becomes its body repeated in frames labelled `[Until … 1/3]`, `[Until … 2/3]`… (a single
  pass keeps its label), and the title gains the scenario's label.

`meltemi-diagrams export payment.meltemi --scenario approved` writes `payment.approved.svg`
(`<stem>.<diagram>.<scenario>.svg` in files with several diagrams); an unknown scenario is a usage
error listing the ones there are. In VS Code, Export SVG asks for "All events" or a scenario, and
the canvas toolbar previews a scenario read-only.

## Layout

Sequence diagrams are laid out without an engine, deterministically:

- **Columns.** Heads are measured from their labels. Adjacent centres are half of each head plus
  `spacing` (40) apart, plus the `gap` after the left one and the `gap` before the right one when
  their sum is positive, and pushed further apart as far as the messages between them need on one
  line: each label's width plus 24 (and 22 more under `autonumber`), a message's row of pills plus
  24, the disc and the arrowhead, and the room self-calls and side notes need beside their column.
  That is the pair's natural distance. A pull brings the pair closer than it by its amount: a
  negative sum of the two `gap`s, and a `spacing` below 40 by the difference, so a dragged head
  lands where it is dropped. A pull stops at the pair's floor: half of each head plus 8 (a head
  counting as the wider of itself and its badges), the longest word of each message's label
  between its columns plus 24 (and the disc), the row of pills, self-calls and side notes; the
  labels between the pair wrap at the room they are left. When a negative gap would bring a pair
  closer than the floor, the floor wins and `layout.gap-floor` warns on the `gap` with the amount
  drawn, measured from the natural distance. A `gap` before the first participant or after the
  last adds room on that side of the diagram.
- **Rows.** Events go top to bottom: messages with their label above the arrow, the row taller by
  each wrapped line after the first and by half a pill and 2 when the message has tags, self-calls
  24 taller, notes, fragment headers and branch separators, dividers and delays. `space` adds its
  amount above an event, `space … after` below it. A call's block takes its rows right after the
  call's, and its `return` is drawn from the edge of the receiver's bar to the caller. When any
  participant has tags, the row of heads starts lower by their room: half a pill over a box, a
  pill and 4 over a figure.
- **Composition checks** do not apply: rows and columns cannot overlap. The label audit measures
  each line of a wrapped label, and a tag's text against its pill.
- **Drawing.** Heads, activation bars, notes and fragment frames are stroked with the theme's
  `muted` colour on a `surface` fill, and lifelines are dashed in `muted` at half strength, so the
  messages, drawn in `connector`, stay in front. A `stroke` written for a participant colours its
  head and its lifeline. Boxes are 40 units tall, at the bottom of the head row when an actor or
  another figure makes the row taller.

`LayoutResult.boxes` holds the heads as drawn, the notes, the fragment frames and the written
activation bars (by event key); `shapes` and `radii` the outline of each head that is a box
(`rounded` with the theme's radius, a database `cylinder`); `connectors` and `labels` the messages,
a label's box holding all its lines; `messageTexts` the room each message's label wraps at, its
lines as drawn, their size and distance, and whether it wraps (when a pull caps its room; not on a
self-call nor at the natural distance); `bars` every
activation bar by the key of its `activate` or of the call whose block draws it, with its
participant, box, depth and the `deactivate` that ends it; `tags` the pills of every tagged
participant and message; `events` the row of every event. In the scene, each bar is a group of role
`event` inside its lifeline's group (`<g data-id="activate#1" data-role="event">`), and each tag a
group of role `tag` inside its owner's (`<g data-id="authorize" data-role="tag" data-tag="0">`).
Editors use them to select, drag and hit-test.

## Editing

Edits keep the order of events (see [editor.md](../editor.md)):

- dragging a participant's head past a neighbour's centre reorders its declaration and changes no
  message; a shorter drag writes its `gap` before, and the status line says so when the floor
  draws less than was written;
- dragging a message, note or fragment down writes `space`, which never goes below 0, so nothing
  passes its neighbour; a call moves with its block;
- crossing an event is an explicit, validated move (Alt+Up and Alt+Down), into and out of call
  blocks, refused when it would break the order-checked rules;
- Alt+N nests the selected events in the call right before them, Alt+Shift+N moves the events of a
  call out after it, each `return` written as a reply, and Alt+R adds a `return` at the end of the
  call's block;
- Alt+A, the **Activate** button and the inspector's **Activates the receiver** write or remove the
  `activate`/`deactivate` pair of the receiver after a message; a written activation bar is
  selected by a press, its top and bottom handles move its `activate` or its `deactivate` after
  another event (refused with the reason when the order-checked rules forbid it), and Delete
  removes the pair;
- T, the **Tag** button and the inspector's **Tags** add, rewrite and remove `tag` statements,
  creating the block when the statement has none and removing it when nothing else is left; a
  double click on a pill edits it in place;
- a message's label is typed where it wraps: the editor is as wide as the room between the
  lifelines and grows down, and Shift+Enter writes `\n`;
- activations, notes and fragments stay with their messages; removing an `activate` or a
  `deactivate` removes its pair; removing a participant lists its messages, events and spacing
  first, and removing a call removes its block's events with it.
