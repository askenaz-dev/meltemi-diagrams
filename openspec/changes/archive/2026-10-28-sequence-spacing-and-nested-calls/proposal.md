## Why

Two things the owner met on 2026-10-27 in the playground's sequence diagram (the screenshot of
diagrams.meltemi.dev 1.9.0: participants Actor, Actor, Test, Service, Database, a call Test → Service
labelled "Calling API", the inspector headed DIAGRAM TEST with Theme, Title, Description, Number
messages from and Canvas) have one cause each in the code. The first is "the distance between
participants is fixed and follows the text". The language does have two spacing statements, both in
`placement`: `space <event> <n>` (room above a message, note or fragment) and `gap <participant> <n>`
(room left of a participant), read by `placementStatement`
(`packages/model/src/sequence.ts:665-725`); the inspector shows them as **Space before** on a
selected event and **Gap before** on a selected participant (`packages/editor/src/sequence.ts:304-310`,
`350-356`; `docs/editor.md:743-745`). But nothing makes them findable or sufficient. The diagram's
own inspector (`sequenceDiagramFields`, `packages/editor/src/sequence.ts:476-507`, the panel in the
screenshot) has nothing about spacing. The base distance is the constant `Math.round(40 * f)` at
`packages/layout/src/sequence.ts:155`, on top of half of each head and the room every message label
needs (`:148-158`, `:161-208`: a deficit shifts every later column at `:204-208`), so a `gap` can only
widen a pair, never tighten it: the model refuses negatives with `prop.invalid-value` and the `pixels`
message (`packages/model/src/sequence.ts:683-691`), the inspector refuses them too (`editor/src/sequence.ts:526-528`),
and the distance Test–Service in the screenshot is set by "Calling API" and nothing can bring it
closer. A `gap` on the first participant compiles and draws nothing (the `i === 0` branch at
`layout/src/sequence.ts:150-152` never reads it), there is no room right of the last participant
beyond what self-calls and side notes add (`:523-525`), and no `space` below an event (`space` is
added above at `:276`). On the canvas a head dragged sideways follows the pointer with its lifeline
(`packages/canvas/src/app.ts:2898-2915`, `4398`), but the drop becomes `reorderParticipant` at the
index of the siblings left of the drop point (`packages/editor/src/sequence.ts:97-124`), which is a
no-op when the index did not change (`packages/edit/src/sequence.ts:174`), so a head dragged
without crossing a neighbour snaps back: that is what "fixed" looks like.

The second is "how do I say that a call is made inside another call". Messages are relations
(`->` a call, `-->` a reply, `kind async`; `packages/model/src/schema.ts:666-672`,
`packages/model/src/flow.ts:1209-1233`), `Relation` has no field tying a reply to its call
(`packages/model/src/types.ts:204-244`), `MessageEvent` holds the relation key only (`:423-426`), and
`EventPlace` is `{ fragment, branch }` (`:405-409`), so nesting exists for fragments only:
`buildEvents` walks the diagram body and fragment branches (`packages/model/src/sequence.ts:275-320`).
A message block takes only `description`, `assumption`, `class` and `kind`
(`SEQUENCE_PROFILE.relationProperties`, `schema.ts:666-671`): `elementBlock` hands the block to
`readPropertyBlock`, which reports any statement that is not a property with `prop.unknown`
(`flow.ts:949-1000`, `packages/model/src/style-values.ts:393-398`). Activation is explicit,
`activate p` / `deactivate p` checked in order (`sequence.ts:574-592`), and the only link between a
call and its reply is a guess: `toggleActivation` (Alt+A) writes `deactivate` after the first later
message from the callee back to the sender (`packages/edit/src/sequence.ts:653-657`), recording
nothing. The grammar already parses what the owner wants to write: `relation = ref arrow ref
[":" STRING] ["as" IDENT] [block]` and `block = "{" { separator | statement } "}"`
(`docs/language/grammar-0.2.md:66-69`), so `a -> b: "Pay" { b -> c: "Auth" }` is a valid tree that
the analyzer refuses today. The PlantUML and Mermaid importers already carry the idea from the
other notations, `++`/`--` and `return`, `+`/`-` (`packages/import/src/plantuml/sequence.ts:118`,
`287-310`; `packages/import/src/mermaid/sequence.ts:418-455`), and flatten it into explicit pairs.

This change makes spacing adjustable per diagram, per pair and from the canvas, on both sides, and
adds the call block with `return`: the one form that says "inside this call", ties the reply to its
call and draws the activation from the nesting. Post-1.0 change, outside the roadmap
(`docs/roadmap-1.0.md`); it builds on `sequence-profile` (decision 0019), `canvas-feel-and-naming`
(decision 0052) and `agent-skill-install` (decision 0056), and records decision 0060. The language
stays 0.2: the diagram property, the sides, the negative amounts, the events inside a message block
and `return` are additions no valid file could contain (`docs/language/policy.md:33-50`).

## What Changes

- **`spacing <n>`, a sequence diagram property.** The base distance between adjacent heads, 40 by
  default (scaled by the theme's label size as today), from 0 to 400, in `SEQUENCE_PROFILE.diagramProperties`
  beside `autonumber`, in the model's `properties.spacing`, in the model JSON, and in the diagram's
  inspector as **Participant spacing** after **Number messages from**, written through
  `setDiagramProperty`.
- **A side for `space` and `gap`.** `space <event> <n> [before|after]` and
  `gap <participant> <n> [before|after]`; `before` is the default and what the editor writes.
  `gap … after` adds room right of a participant, the last one included; `space … after` adds room
  below an event, the last one included; a `before` of the first participant adds room left of it
  (today it is read and ignored). Both sides of one pair add up; `placement.duplicate` is per target
  and side. The model records `side` on `SpaceEntry` and `GapEntry`, and the JSON writes it.
- **A signed `gap`.** A `gap` may be negative: the pair comes closer than `spacing`, down to the
  floor the layout keeps (half of each head plus 8, so heads never touch, and the room of the message
  labels, self-calls and notes between the columns). When the floor wins over a negative gap the
  layout reports `layout.gap-floor` (warning) on the statement, naming the amount applied, so nothing
  is silent. A negative `gap` before the first participant or after the last is
  `prop.invalid-value`, since there is nothing to tighten. `space` stays 0 or more.
- **Head drags write `gap`.** On the canvas a head dragged sideways without crossing a neighbour's
  centre writes its **Gap before** by the distance dragged (`setSpacing`), crossing still reorders,
  and the first participant's drag stops at 0. When the floor keeps the head further out than it
  was dragged, the status line names the amount written and the amount drawn, so a head that lands
  short of the pointer reads as a rule. Left and Right keep swapping participants. The inspector of
  a participant shows **Gap before** and **Gap after**; of a message, note or fragment, **Space
  before** and **Space after**; **Gap before** accepts a negative number except on the first
  participant, **Gap after** except on the last.
- **Call blocks.** The block of a call may hold events: `customer -> api: "Pay" as pay { api -> bank:
  "Authorize" as authorize { return "OK" as ok }; return "Receipt" }`. The events happen inside the
  call, after its arrow and before what follows the statement; the callee is active for the block,
  an implicit bar from the call's arrow to the block's last event; the properties `description`,
  `assumption`, `class` and `kind` keep working in the same block. Fragments inside a call block,
  calls inside fragments and self-call blocks are allowed. Event keys and relation keys are what they
  are today (`id ?? <from>-><to>#<n>` in source order); `EventPlace` gains a `{ message }` place;
  `MessageEvent` gains `events`; the JSON message event gains `events`.
- **`return`.** `return ["Label"] [as <id>] [{ properties }]` inside a call block is a reply from the
  callee to the caller of the innermost enclosing call: a relation (dashed, open head, numbered,
  styled, labelled with `label … at`, spaced, named) whose `returns` names the call's key, written
  to the JSON. `return` outside a call block, and any event after a `return` in the same statement
  list, are `sequence.return`; a `deactivate` that would end the implicit bar inside the block is
  `sequence.activation`. An explicit `activate` inside the block nests a deeper bar, as today.
- **Edits.** `nestInCall { diagram, call, events }` moves the consecutive events that follow a call
  into its block (creating it) and `unnestCall { diagram, call }` moves them out, turning each
  `return` into a written reply; `moveEvent` moves into and out of a call block as it does for
  fragment branches; `insertEvent { inside: { message } }` appends to a call's block;
  `removeRelation` of a call removes its block and lists the nested events' dependents;
  `toggleActivation` refuses a call that has a block; `setSpacing` takes the side and the sign.
  Comments inside moved statements move with them.
- **Canvas.** Alt+N nests the selected events in the call before them (**Nest in the call**),
  Alt+Shift+N unnests the selected call (**Unnest the call**), Alt+R appends a `return` to the
  selected call (**Return to the caller**), in the context menu beside **Activate the receiver**;
  the inspector's **Message** field reads `return` for a return and is read-only there, with
  **From** and **To**; nested rows hit-test as their own events with the call as `parent`.
- **Scenarios.** `resolveScenario` keeps the nesting: a call's block is resolved like a branch, and a
  loop around a call suffixes the call's key and its nested keys with `@k`.
- **Language services, grammar, formatter, corpus.** Completion offers `return` in a call block,
  `before` and `after` after an amount, and `spacing` with the diagram properties; hover on a
  `return` names the call it answers and the place of a nested event names the call; the TextMate
  grammar colours `return` and `spacing`; the formatter needs no change and a test pins a call block;
  `corpus/valid/sequence/calls.meltemi` (model JSON and SVG) and `corpus/invalid/sequence.return.meltemi`
  join the conformance cases.
- **Importers unchanged.** PlantUML `++`/`--`/`return` and Mermaid `+`/`-` keep producing
  `activate`/`deactivate` pairs and written replies (`plantuml-import` "Return",
  `mermaid-import` "Activation shorthand"); Alt+N and Alt+R turn an imported pair into a call
  block. Emitting the block from the importers is a decision of the design and an open question.
- **Documentation.** `docs/language/sequence.md`, `grammar-0.2.md`, `diagnostics.md`,
  `model-json.md`, `docs/editor.md` and their Spanish copies; the skill's
  `reference/sequence.md` and `examples/sequence.meltemi` with `pnpm skills:sync` and
  `pnpm assist:guide`; the changelog's 1.10.0 section; decision 0060.

## Non-goals

- Exporting without the brand frame belongs to `unbranded-exports`; the collapsible inspector and
  the toolbar's tooltips to `inspector-collapse-and-tooltips`; the agent setup prompt and the
  agents page to `agent-setup-prompt`.
- The delivery change owns the pipelines and the release of what this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sequence-diagram-model`: MODIFIED "Messages" (a call's block may hold events; `return`),
  ADDED "Call blocks and returns" (what happens inside a call, the implicit activation, the
  `return` relation, `sequence.return`), MODIFIED "Ordered events" (events of a call, the
  `{ message }` place), MODIFIED "Order-checked rules" (the implicit bar, `deactivate` inside a
  block, `sequence.return`), MODIFIED "Sequence placement" (`spacing`, the sides, the signed
  `gap`, the edge rule), MODIFIED "Sequence diagrams in JSON" (`spacing`, `side`, `returns`,
  nested `events`).
- `sequence-layout`: MODIFIED "Columns" (`spacing`, both sides, the signed `gap`, the floor and
  `layout.gap-floor`, the first and last participant), MODIFIED "Rows keep event order"
  (`space … after`, the rows of a call's block), MODIFIED "Sequence drawing" (implicit bars,
  returns, the rows of nested events).
- `sequence-editing`: MODIFIED "Spacing keeps order" (the side, the sign), MODIFIED "Explicit
  event moves" (into and out of a call block), MODIFIED "Inserting events and fragments"
  (`inside: { message }`), MODIFIED "Editing events" (`toggleActivation` on a call with a block),
  ADDED "Nesting calls" (`nestInCall`, `unnestCall`), MODIFIED "Shared operations in sequence
  diagrams" (`removeRelation` of a call with a block; `gap` statements of both sides).
- `sequence-editor-tools`: MODIFIED "Sequence canvas" (head drags write `gap`, the status line when
  the floor wins; Alt+N, Alt+Shift+N, Alt+R; nested rows), MODIFIED "Sequence inspector and scenarios" (**Gap after**, **Space after**,
  **Participant spacing**, `return` in **Message**), MODIFIED "Sequence language services"
  (completion and hover).
- `sequence-scenarios`: MODIFIED "Scenario resolution" (call blocks resolved and suffixed).

## Impact

- `packages/model`: `src/types.ts` (`properties.spacing`, `SpaceEntry.side`, `GapEntry.side`,
  `Relation.returns`, `Relation.node` as a relation or a `return` statement, `EventPlace`
  `{ message }`, `MessageEvent.events`), `src/schema.ts` (`spacing` in `SEQUENCE_PROFILE.diagramProperties`,
  `return` in `SEQUENCE_EVENTS`), `src/sequence.ts` (`collectRelations` into call blocks and
  `return` relations, `buildEvents` for a call's block, `checkOrder` with the implicit depth and the
  `sequence.return` rules, `placementStatement` with the side and the sign), `src/flow.ts`
  (the message block read as properties plus events in sequence diagrams; `spacing`), `src/json.ts`,
  `src/scenario.ts`, `src/messages/en.ts` and `es.ts`; tests `test/sequence.test.ts` (the model
  and the scenarios), `test/json.test.ts`, `test/corpus.test.ts` (the new cases).
- `packages/layout`: `src/sequence.ts` (the base from `spacing`, both sides, the floor and the
  warning, the first and last participant, implicit bars from call blocks, nested rows, `return`
  arrows); `test/sequence.test.ts`; `test/corpus.test.ts` (which runs
  `corpus/invalid/layout.gap-floor.meltemi`); `corpus/valid/sequence/calls.svg`.
- `packages/edit`: `src/types.ts` (`setSpacing.side`, `nestInCall`, `unnestCall`,
  `insertEvent.inside` with `message`), `src/sequence.ts` (`containerOf` and `eventsOfBlock` for
  call blocks, `setSpacing`, `moveEvent`, `insertEvent`, `nestInCall`, `unnestCall`,
  `toggleActivation`), `src/relations.ts` (`removeRelation` of a call with a block, `setRelationLine`
  and `reconnectRelation` refusing a return), `src/plan.ts` (naming a return, dependents of
  nested events), `src/messages/en.ts` and `es.ts`; `test/sequence.test.ts`, `test/operations.test.ts`.
- `packages/editor`: `src/sequence.ts` (`sequenceMove` writing `gap`, `eventInfos` with the call as
  `parent`, the fields **Gap after**, **Space after**, **Participant spacing**, `return` in
  **Message**, the field operations, the actions `nestInCall`, `unnestCall`, `addReturn`),
  `src/canvas/protocol.ts` (the three actions, `EventInfo.parent` for a call), `src/canvas/keyboard.ts`
  (Alt+N, Alt+Shift+N, Alt+R), `src/session.ts` (routing, the status after a floor-clamped drag),
  `src/services/completion.ts`, `hover.ts`,
  `docs.ts`, `src/messages/en.ts`, `es.ts`, `keys.ts`, `services.ts`; tests `test/sequence.test.ts`,
  `test/canvas.test.ts`, `test/services.test.ts`.
- `packages/canvas`: `src/app.ts` (the three commands and menu entries, the first participant's
  drag stop), `src/messages/en.ts` and `es.ts`; `test/messages.test.ts`.
- `packages/vscode`: `syntaxes/meltemi.tmLanguage.json` (`return`, `spacing`); `test/webview/run.ts`
  (a short head drag writes `gap`, a long one reorders; a nested call's bar, Alt+N and Alt+R).
- `packages/language/test/format.test.ts` (a call block formats as any block);
  `packages/playground/test/browser/run.ts` (**Participant spacing** on the playground).
- `corpus/valid/sequence/calls.meltemi` with `.model.json` and `.svg`;
  `corpus/invalid/sequence.return.meltemi` and `corpus/invalid/layout.gap-floor.meltemi` with their
  `.diagnostics.json`.
- `skills/meltemi-diagrams/reference/sequence.md`, `examples/sequence.meltemi` and their copies
  through `pnpm skills:sync`; `pnpm assist:guide`; `docs/language/sequence.md`, `grammar-0.2.md`,
  `diagnostics.md`, `model-json.md`, `docs/editor.md` and `docs/es/…`; `CHANGELOG.md`;
  `docs/decisions/0060-sequence-spacing-and-nested-calls.md`.
