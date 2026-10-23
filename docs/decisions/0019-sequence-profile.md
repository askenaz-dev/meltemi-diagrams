# 0019. The sequence profile

Status: accepted (sequence-profile change, 10 October 2026)

## Context

The proposal's sequence example has actors, participants, calls and replies, activations and an
`alt`/`else`; it also asks for options, loops, concurrency, self-calls, notes and asynchronous
messages. It sets four editing rules: reordering participants changes no message; spacing and
labels keep the vertical order; crossing a message needs an explicit, validated reorder; and
activations and fragments stay with their messages. Playback needs a chosen path through
alternatives and a finite number of loop passes. The Mermaid and PlantUML importers (roadmap
change 12) need the constructs those notations share: participant types and boxes, creation and
destruction, notes, every fragment, dividers, delays and numbering.

## Decision

- **One model, with ordered events.** Sequence diagrams compile into the shared `FlowDiagram`
  structure with `type: "sequence"`: participants are elements of eight kinds, participant boxes
  are groups, and messages are relations with `async`. `events` holds the ordered tree of events
  (messages, activations, lifecycle, notes, fragments with branches, dividers, delays) and
  `eventsByKey` indexes them by key: the relation key of a message, the written id of a note or
  fragment, or `<kind>#<n>`. `SEQUENCE_PROFILE` joins the profile table of decision 0018, so
  rename, removal, labels, styles, links, the inspector and the language services reuse the code
  of the other profiles. Note and fragment ids share the namespace and the references of elements
  and relations, so definition, references and rename follow them.
- **Order-checked rules.** Events are checked in order with a state per participant (active depth,
  created, destroyed): `sequence.activation` and `sequence.lifecycle`. Each branch of `alt`, `par`
  and `critical` starts from the state before the fragment, and the first branch's state
  continues; open activations at the end are allowed.
- **A specialised layout.** `layoutSequence` needs no engine: columns from measured heads, label
  widths and `gap`; rows from the events in order and `space`. It returns heads, notes and
  fragment frames in `boxes`, messages in `connectors` and `labels`, and every event's row in
  `events`, which editors use to drag and hit-test. Composition checks do not apply.
- **Scenarios.** `scenario <id> { choose; repeat; skip; take }` names one path.
  `resolveScenario` flattens it: decided frames disappear, loops repeat their body with keys
  suffixed `@k`, and `par` and `region` stay whole. `LayoutOptions.scenario`, `export --scenario`,
  the canvas preview and Export SVG use it; stories will refer to scenarios.
- **Editing rules as operations.** `reorderParticipant`, `moveEvent` (validated against the rules),
  `setSpacing`, `insertEvent`, `wrapInFragment`, `unwrapFragment`, `addBranch`,
  `setFragmentCondition`, `setFragmentOperator`, `setEventText`, `setNotePlacement`,
  `renameEvent`, `removeEvent` and `toggleActivation`. Flow geometry (`setPosition`, `setSize`,
  `setRoute`, `arrange`) is refused with the sequence operations named. Removing what an event
  names removes its `space`, styles and scenario choices with it.
- **Canvas.** Drags reuse the `move` action: a head dragged sideways becomes `reorderParticipant`
  at the drop position, and a message, note or fragment dragged vertically becomes `setSpacing`,
  clamped at 0 so it never passes its neighbour. Crossing is Alt+Up and Alt+Down.

## Alternatives considered

- **A separate sequence model.** Rename, styles, links, the inspector and the clipboard would be
  written again for the same ids.
- **Coordinates for events.** Positions would contradict the order and break the editing rules;
  `space` and `gap` add room without moving anything past anything.
- **ELK for sequences.** Layered layout knows nothing of lifelines and time; a direct layout is
  deterministic and simple.
- **Conditions as expressions.** Conditions stay descriptions; scenarios choose branches by name or
  number.
- **Free vertical drags.** A drag that could cross events would reorder by accident; the proposal
  asks for explicit, validated moves.

## Consequences

- Sequence diagrams get validation, export, completion, hover, navigation, quick fixes, the
  canvas, the inspector and the CLI from the shared pipeline.
- `c4` is the only profile left parse-only, until the model and C4 change.
- The importers map Mermaid `sequenceDiagram` and PlantUML sequences onto this vocabulary, and
  playback will animate a scenario's resolved events.
- Heads are measured as drawn and the drawing takes the theme's `muted` colour since
  [decision 0052](0052-canvas-feel-and-naming.md).
