## Context

- **Flow and free are complete.** They share one model, the layout pipeline, the edit operations,
  the editor services and the canvas.
- **Sequence only parses.** The proposal's example uses `actor`, `participant`, calls and replies,
  `activate`, `alt`/`else` and `deactivate`. It also asks for options, loops, concurrency,
  self-calls, notes and `kind async`.
- **Editing rules.** The proposal sets four of them:
  - reordering participants changes no message;
  - spacing and labels keep the vertical order;
  - crossing a message needs an explicit, validated reorder;
  - activations and fragments stay with their messages.
- **Playback.** Conditions are descriptions, never logic. Playback needs a chosen scenario for
  alternatives and a finite number of iterations for loops.
- **Importers.** Change 12 maps Mermaid `sequenceDiagram` and PlantUML sequences onto this
  profile, so the vocabulary covers their common constructs: participant types, participant
  boxes, `create`, `destroy`, notes, every fragment, dividers, delays and numbering.

## Goals / Non-Goals

**Goals:** the full vocabulary with order-checked rules; a specialised, deterministic layout;
scenarios for export and later playback; the editing rules as operations; editor tools.

**Non-Goals:** `c4`, model entities (change 11); animated playback (changes 13 to 15).

## Decisions

### D1. One model, with ordered events

- **Shared structure.** Sequence diagrams compile into the shared `FlowDiagram` structure with
  `type: "sequence"`:
  - participants are elements;
  - participant boxes are groups;
  - messages are relations, with `async`.

  Rename, removal, labels, descriptions, classes, styles, links, the inspector and the clipboard
  then work unchanged.
- **Events.** `FlowDiagram.events` holds the ordered tree of events: messages, activations,
  lifecycle, notes, fragments with their branches, dividers and delays. `eventsByKey` indexes
  them.
- **Event keys.** Messages use their relation key. Other events use their id when written, or
  `<kind>#<n>` in order of appearance.
- **Profile table.** `SEQUENCE_PROFILE` joins the table (decision 0018).

| Statement                                    | Meaning                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `participant`, `actor`, `boundary`, `control`, `entity`, `database`, `collections`, `queue` `<id> ["Label"] [{…}]` | a participant of that kind |
| `group <id> ["Label"] { participants }`      | a participant box (Mermaid and PlantUML `box`)                                         |
| `a -> b: "L" as id { kind async }`, `-->`    | call (`->`), reply (`-->`), async with `kind async`; `a -> a` is a self-call           |
| `activate p`, `deactivate p`                 | activation bars, nested                                                                |
| `create p`, `destroy p`                      | the lifeline starts at the next event, or ends with a cross                            |
| `note [id] over p[, q] "T"`, `note [id] left of p "T"`, `note [id] right of p "T"` | notes                           |
| `alt [id] "c" {…} else "c" {…}`              | alternatives                                                                           |
| `opt`, `loop`, `break [id] "c" {…}`          | option, loop, break                                                                    |
| `par [id] ["l"] {…} and ["l"] {…}`           | concurrency                                                                            |
| `critical [id] ["l"] {…} option "c" {…}`     | critical region                                                                        |
| `region [id] "l" {…}`                        | a labelled region (PlantUML `group`, Mermaid `rect`)                                   |
| `divider "L"`, `delay ["L"]`                 | a section line, a gap in time                                                          |
| `autonumber [n]`                             | numbers messages from `n` (1)                                                          |
| `scenario <id> ["L"] {…}`                    | D4                                                                                     |
| `placement { space <event> n; gap <participant> n; label <message> at n% offset (dx, dy) }` | D3 |

- **Implicit participants.** An undeclared message end is an implicit `participant`.
- **Order of participants.** Participants are ordered by their position in the source: declared
  ones where declared, implicit ones at their first mention.
- **Styles.** `style`, `class` and `rule` apply to participants, named messages, and notes and
  fragments with ids. Rule kinds add the participant kinds and `fragment`.

### D2. Order-checked rules

Events are checked in order with a state per participant: active depth, created, destroyed.

- **`sequence.activation`.** `deactivate` of a participant that is not active.
- **`sequence.lifecycle`:**
  - an event after `destroy`;
  - `create` after the participant appeared, or twice;
  - `destroy` twice.
- **`ref.unknown-element`.** Unknown participants in `activate`, notes and lifecycle events. A
  group used as a participant is refused too.
- **Branches.** The branches of `alt`, `par` and `critical` each start from the state at the
  fragment; the state after the fragment is the first branch's. Other fragments are checked like
  their single body.
- **Open activations.** Activations still open at the end are allowed; their bars reach the end.

### D3. Layout

`layoutDiagram` dispatches to `layoutSequence` for sequence diagrams, which uses no engine.

- **Columns.**
  - Heads are measured from their labels; actors and the UML kinds draw a figure above the label.
  - Adjacent centres are at least half of each head plus 40 apart, plus the written `gap`.
  - A message between columns `i` and `j` needs its label width plus 24 between them; the excess
    goes to the last gap.
  - Self-calls and notes need room to the right or left of their column.
- **Rows.**
  - Events go top to bottom in order: messages (label line above the arrow), self-calls (an extra
    24), notes, fragment headers and branch separators, dividers and delays.
  - `space` adds its amount before an event.
- **Drawing.**
  - Dashed lifelines; activation bars 10 wide, nested 5 apart.
  - Calls: solid line with a filled head. Replies: dashed line with an open head. Async: solid
    line with an open head.
  - `create` draws the head at its row, and the creating message ends at the head. `destroy`
    ends the lifeline with a cross.
  - Fragments draw a frame around the columns their events touch, with the operator in a tab, the
    condition in brackets and dashed separators between branches.
  - `autonumber` draws the number in a small disc at the start of each message.
- **Geometry for editors.**
  - `boxes` holds the heads and, by event key, the notes and fragment frames.
  - `connectors` holds the messages and `labels` their label pills.
  - `events` holds the row band of every event, for dragging and hit-testing.
- **Checks.** Composition checks do not apply: the layout cannot overlap by construction.

### D4. Scenarios

```text
scenario approved "Pago aprobado" {
  choose check "Aprobado"     // a branch of alt or critical, by condition or 1-based index
  repeat retries 2            // iterations of a loop, 1 to 100
  skip reminder               // an opt or break not taken
  take audit                  // an opt or break taken (the default)
}
```

- **Defaults.** Unlisted fragments take their first branch, one iteration, and are taken. `par`
  keeps all its branches; `region` is always drawn.
- **Errors (`sequence.scenario`):**
  - an unknown fragment;
  - an operator that does not take the choice;
  - an unknown branch;
  - iterations out of range.
- **Resolution.** `resolveScenario(diagram, id)` returns the flattened event list.
  - Resolved alternatives, options and breaks lose their frames.
  - Loops become repeated bodies, each framed `loop [c k/n]`; a single pass keeps `[c]`.
  - Message keys of repeated bodies get `@k`.
- **Users.** `LayoutOptions.scenario` lays out a scenario. `meltemi-diagrams export --scenario <id>`
  writes `<stem>.<scenario>.svg` (`<stem>.<diagram>.<scenario>.svg` in files with several
  diagrams), and stories will refer to scenarios.

### D5. Editing rules as operations

| Operation | Effect |
|---|---|
| `reorderParticipant { participant, index }` | Moves the declaration among the participant declarations of its block (implicit ones are declared there); no message changes |
| `moveEvent { event, direction: "up" \| "down" }` | Swaps an event statement with its neighbour in the same block, or moves it into or out of an adjacent fragment branch; refused with `edit.invalid-value` when the result breaks D2 |
| `setSpacing { event, space }` | Writes, replaces or removes `space <event> n`; anonymous messages are named first |
| `setSpacing { participant, gap }` | The same with `gap` |
| `insertEvent { after?, inside?, statement }` | Inserts a message, activation, lifecycle event, note, divider or delay after an event, or first in a fragment branch |
| `wrapInFragment { events, operator, condition, id? }` | Wraps consecutive sibling events in a new fragment |
| `unwrapFragment { fragment }` | Replaces a fragment with the events of its first branch, and refuses when other branches hold events |
| `addBranch { fragment, condition }` | Adds `else`, `and` or `option` |
| `setFragmentCondition { fragment, branch, condition }` | Changes a branch condition |
| `setElementProperty` with `kind` | Writes or removes `kind async` on a message |

Existing operations apply as they are: `createElement` with the participant kinds, `createRelation`
(appending the message at the end), `renameElement`, `removeElement` (cascading into messages,
activations, lifecycle events, notes and spacing), the relation operations, labels and styles.
Flow-only operations (`setPosition`, `setSize`, `setRoute`, `arrange`) are refused with
`edit.invalid-value` naming the sequence operations.

### D6. Editor tools

- **Canvas.**
  - The render carries `profile: "sequence"` and the `events` rows.
  - Palette: participant (P), actor (A), message (C), note (O), fragment (F: wraps the selected
    messages, with an operator menu), activation (Alt+A toggles on the selected participant at the
    selected message), divider.
  - Dragging a participant horizontally reorders it at the drop position.
  - Dragging a message, note or fragment vertically changes its `space`, clamped so it never
    passes a neighbour. Alt+Up and Alt+Down move the selected event (`moveEvent`).
  - The scenario picker in the toolbar previews a scenario read-only.
- **Inspector.**
  - Messages: kind (call, reply, async), space before.
  - Notes: text, position, participants.
  - Fragments: operator, conditions.
  - Participants: kind, gap before.
  - Diagram: autonumber.
- **Language services.** Completion of the vocabulary, participants, fragments and branches in
  scenarios; hover for events; definition from scenario references to fragments; quick fixes
  (declare an unknown participant, remove a stray `deactivate`).
- **Commands.** Export SVG asks for "All events" or a scenario when the diagram has scenarios.

## Risks / Trade-offs

- [The shared model grows another profile] → The profile table keeps vocabularies apart, and the
  events live in their own field.
- [Branch-local checking is simple] → It matches the common cases (each branch deactivates) and
  never reports a false error for branches written apart.
- [A clamped drag cannot reorder] → This is the proposal's rule. Alt+Up and Alt+Down make the
  reorder explicit and validated.
