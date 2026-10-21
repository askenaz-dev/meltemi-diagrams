## Why

The proposal's second diagram type is `sequence`: ordered messages, activations and fragments, where
changing the appearance must never change causality. Today `diagram <id>: sequence { }` parses
and is reported as `profile.unsupported`. Roadmap change 10 asks for the complete profile now:
its vocabulary, a layout that keeps event order, the editing rules of the proposal, the choice of a
scenario and of iterations for export, and its editor tools.

## What Changes

- **Sequence diagrams compile.** `diagram <id>: sequence { }` accepts:
  - participants of eight kinds: `participant`, `actor`, `boundary`, `control`, `entity`,
    `database`, `collections`, `queue`; participant boxes `box "Label" { … }`;
  - messages: `->` call, `-->` reply, `kind async` in the message block, self-calls, labels, ids
    and blocks; `autonumber`;
  - `activate`, `deactivate`, `create` and `destroy`;
  - notes `over`, `left of` and `right of` one or two participants;
  - fragments `alt`/`else`, `opt`, `loop`, `par`/`and`, `break`, `critical`/`option` and `group`,
    nested, with optional ids;
  - `divider` and `delay`;
  - `title`, `description`, `theme`, `preset`, `canvas`, `style`, `class`, `rule`, `animate`,
    `placement` (`space`, `gap`, `label`) and `scenario` blocks.
- **Event order.** The model keeps one ordered tree of events. Lifecycle and activation rules are
  checked in that order.
- **Specialised layout.** Participants in declaration order, columns spaced so labels fit, events
  top to bottom in source order. The layout draws:
  - lifelines, activation bars (nested), self-call loops and creation and destruction;
  - call, reply and async arrows, notes, fragment frames with their branch separators, dividers
    and delays;
  - automatic numbering.
- **Scenarios.** `scenario <id> ["Label"] { choose <fragment> "<branch>"; repeat <loop> <n>;
  skip <fragment>; take <fragment> }` names one path: one branch of each alternative and a finite
  number of iterations of each loop.
  - `meltemi-diagrams export --scenario <id>` and the editor render that path.
  - Stories will play it.
- **Editing rules from the proposal.**
  - Reordering participants changes their horizontal order and no message.
  - Spacing (`space` before an event, `gap` before a participant) and label offsets never change
    the order of events.
  - Moving an event past another is an explicit operation (`moveEvent`), validated.
  - Activations and fragments stay with their messages.
- **Edit operations:**
  - `reorderParticipant`, `moveEvent`, `setSpacing`, `insertEvent` (messages, activations,
    lifecycle, notes, dividers, delays at a position);
  - `wrapInFragment`, `unwrapFragment`, `addBranch`, `setFragmentCondition`;
  - `setElementProperty` for a message's `kind`;
  - the existing element and relation operations, applied to participants and messages.
- **Editor tools.**
  - Canvas: a palette for participants, actors and the other kinds, messages, notes, fragments and
    activations; dragging a participant reorders it; dragging a message changes its spacing
    without crossing a neighbour; Alt+Up and Alt+Down move an event explicitly.
  - Inspector fields for every element; a scenario picker that previews a scenario.
  - Language services for the vocabulary; the Export SVG command asks for a scenario.
- **New diagnostics:** `sequence.activation`, `sequence.lifecycle` and `sequence.scenario`.

## Capabilities

### New Capabilities

- `sequence-diagram-model`: the sequence vocabulary, ordered events, lifecycle and activation rules,
  and its JSON.
- `sequence-layout`: the specialised layout and rendering of sequence diagrams.
- `sequence-scenarios`: scenario blocks, their resolution into one path, and scenario export.
- `sequence-editing`: the editing rules and operations of sequence diagrams.
- `sequence-editor-tools`: canvas, inspector and language-service support for sequence diagrams.

### Modified Capabilities

- `flow-diagram-model`: profile gating lets `sequence` compile; only `c4` stays unsupported.

## Impact

- **`@meltemi/diagrams-model`:** the sequence profile, events, scenarios, JSON and the new codes.
- **`@meltemi/diagrams-layout` and `@meltemi/diagrams-render`:** sequence layout and new scene
  items.
- **`@meltemi/diagrams-edit`, `@meltemi/diagrams-editor`, `packages/vscode` and
  `@meltemi/diagrams-cli`:** the operations, tools and `--scenario`.
- **Corpus:**
  - the proposal's payment sequence moves to `valid`;
  - new sheets for every construct and scenario;
  - invalid sheets per new code;
  - `profile.unsupported` examples switch to `c4`.
- **Docs:** `docs/language/sequence.md`, the grammar, diagnostics, the editor guide, decision 0019
  and the skill.

## Non-goals

- The `c4` profile and links to model entities (roadmap change 11).
- Animated playback of scenarios (changes 13 to 15), which will use the scenarios defined here.
