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
Participant blocks take `description`, `class` and `link`; groups hold participant declarations
only.

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

`kind sync` is the default and is never written. Messages take `description`, `class` and
`kind`; `label <message> at 50% offset (dx, dy)` in `placement` moves a label along its arrow.
`autonumber` numbers the messages from 1 in small discs; `autonumber 10` starts at 10.

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
- A call's block holds its properties (`kind`, `description`, `class`) and its events; a
  `return`'s own block takes properties only.

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
  `spacing` (40) apart, plus the `gap` after the left one and the `gap` before the right one, a
  negative gap taking away. A pair never comes closer than its floor: half of each head plus 8, a
  message's label width plus 24 between its columns, and the room self-calls and side notes need
  beside their column. When a negative gap would bring a pair closer than that, the floor wins and
  `layout.gap-floor` warns on the `gap` with the amount drawn. A `gap` before the first participant
  or after the last adds room on that side of the diagram.
- **Rows.** Events go top to bottom: messages with their label above the arrow, self-calls 24
  taller, notes, fragment headers and branch separators, dividers and delays. `space` adds its
  amount above an event, `space … after` below it. A call's block takes its rows right after the
  call's, and its `return` is drawn from the edge of the receiver's bar to the caller.
- **Composition checks** do not apply: rows and columns cannot overlap.
- **Drawing.** Heads, activation bars, notes and fragment frames are stroked with the theme's
  `muted` colour on a `surface` fill, and lifelines are dashed in `muted` at half strength, so the
  messages, drawn in `connector`, stay in front. A `stroke` written for a participant colours its
  head and its lifeline. Boxes are 40 units tall, at the bottom of the head row when an actor or
  another figure makes the row taller.

`LayoutResult.boxes` holds the heads as drawn, the notes and the fragment frames (by event key);
`shapes` and `radii` the outline of each head that is a box (`rounded` with the theme's radius, a
database `cylinder`); `connectors` and `labels` the messages; `events` the row of every event.
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
- activations, notes and fragments stay with their messages; removing a participant lists its
  messages, events and spacing first, and removing a call removes its block's events with it.
