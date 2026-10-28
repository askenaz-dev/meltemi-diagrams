## Context

**Spacing today.** `SequenceAnalyzer.placementStatement` (`packages/model/src/sequence.ts:665-725`)
accepts `space`, `gap` and `label` in `placement` (`SEQUENCE_PROFILE.placementStatements`,
`packages/model/src/schema.ts:674`): the amount is a `NumberLiteral` with no unit or `px`, refused
below 0 with `diagnostics.sequence.pixels` (`:683-691`), `gap` names any participant through
`participant(token, stmt, "gap")` (`:243-273`, `:694`), `space` a named message, note or fragment,
and `duplicatePlacement(stmt, name)` keys `placement.duplicate` on the statement and the target. The
entries are `SpaceEntry { statement: "space", amount }` and `GapEntry { statement: "gap", amount }`
(`packages/model/src/types.ts:295-304`), serialised with `target` and `amount`
(`docs/language/model-json.md:155-156`). The diagram properties are `theme`, `title`, `description`,
`preset`, `canvas` and `autonumber` (`schema.ts:640-650`), read by the flow analyzer's property
switch (`packages/model/src/flow.ts:1334-1372`) into `properties.autonumber: number | null`
(`types.ts:371`). The layout (`packages/layout/src/sequence.ts:95`) scales by
`f = theme.labelSize / 13`, measures heads at `:116-122` (boxes `max(96f, label + 2 padding)`,
figures `max(48f, label + 8)`), and places the columns at `:148-158`: `xs[0] = widths[0] / 2` and
`xs[i] = xs[i-1] + widths[i-1]/2 + widths[i]/2 + round(40 f) + (gaps.get(p.id) ?? 0)`, so the
first participant's gap is never read and 40 is a constant (`:155`). `walk` (`:161-203`) collects
constraints: a message needs `labelWidth + discRoom + 24` between its columns (`:175`), a self-call
`SELF_WIDTH + room + 16` towards the next column or into `rightExtra` on the last (`:170-174`), notes
their width (`:178-198`, `leftExtra` and `rightExtra` on the outer columns); the constraints are
applied in order and a deficit shifts every later column (`:204-208`). Rows: `rowGap = round(14 f)`
(`:212`), `process(list)` adds `spaces.get(baseKey(event.key))` above each event (`:274-276`), draws
messages between `edge(a, dir)` and `edge(b, -dir)` where `edge` (`:246-250`) moves an end to the
active bar's edge (`BAR = 10`, `BAR_STEP = 5`, `:58-59`), and sets `last = { participants, y }`
after every message; `activate` opens a `Bar` at `last.y` when the previous message touched the
participant, else at `y`, pushing it on `stacks` (`:366-380`); `deactivate` pops it and closes at
`last.y` or `y`, at least 12 tall (`:381-387`); open bars reach the end (`:500-501`); the canvas
extras are `leftExtra` and `rightExtra` only (`:523-525`); `lifeline()` draws the bars
`BAR_STEP` apart (`:776-808`). The edit operation `setSpacing { diagram, target, targetKind:
"event" | "participant", amount: number | null }` (`packages/edit/src/types.ts:471-476`;
`packages/edit/src/sequence.ts:266-303`) treats `amount <= 0` as removal (`:268`), names an anonymous
event first (`namedEvent`, `:247-264`), replaces the number token or inserts `space <id> <n>` /
`gap <id> <n>` through `insertPlacements`. `reorderParticipant` returns no edit when the index is
unchanged (`:174`). The editor's `sequenceMove` (`packages/editor/src/sequence.ts:97-124`) turns a
head drag into `reorderParticipant` at the count of declared siblings whose centre is left of the
drop point, and an event drag into `setSpacing` clamped at 0; `participantFields` adds `gap`
("Gap before", placeholder "0", `:350-356`), `spaceField` "Space before" (`:304-310`),
`sequenceDiagramFields` title, description, `autonumber` ("Number messages from") and theme
(`:476-507`), composed at `packages/editor/src/inspector.ts:781` before the shared canvas fields;
`sequenceFieldOperations` refuses negatives for `gap` and `space` with `reasons.pixels`
(`:526-528`, `:539-541`; words at `packages/editor/src/messages/en.ts:190-210`, `es.ts:171-188`).
The canvas clamps a participant drag to x (`packages/canvas/src/app.ts:4398-4402`) and moves the
head and lifeline live (`followPointer`, `:2898-2915`; no preview request on sequences, `:2950-2956`);
an event drag has `min: -event.space` (`:4282-4288`) and moves its row live (`previewEvent`,
`:3108`); `nudgeSequence` (`:5517`) swaps participants on Left and Right and changes `space` on
Up and Down; `DRAG_THRESHOLD` is 3 screen pixels (`:385`).

**Messages and events today.** A relation statement is `ref arrow ref [":" STRING] ["as" IDENT]
[block]` and a block holds statements (`docs/language/grammar-0.2.md:66-69`; decision 0003), so the
parser already accepts events inside a message block. `SequenceAnalyzer.classifyEvent`
(`packages/model/src/sequence.ts:133-154`) puts relation statements and `EVENT_KEYWORDS` statements
in `out.events`, and `collectRelations` (`:157-169`) walks fragment clauses to collect every
relation statement for `buildRelations`; `afterRelations` (`:188-206`) maps statements to relations
(`relationOf`), builds `this.events = buildEvents(classified.events, [])` and runs `checkOrder`.
`buildEvents` (`:275-320`) makes a `MessageEvent { key: relation.key, relation, path }` per relation
statement, reports anything else that is not an event keyword with `prop.unknown`
(`unknownInFragment`, `:308`) and dispatches to `keywordEvent` (`:322`), whose `fragment` branch
(`:469`) recurses with `[...path, { fragment: key, branch }]`. Relation blocks are read by
`elementBlock` (`packages/model/src/flow.ts:949-1000`) through `readPropertyBlock`
(`packages/model/src/style-values.ts:375`), which reports a statement that is not a
`KeywordStatement` with `prop.unknown` and `values.onlyProperties` (`:393-398`), and an unknown
keyword likewise; `buildRelation` (`flow.ts:1209-1233`) sets `line` from the arrow, `heads`,
`twoWay`, `async: values.kind === "async"`, `label`, `node: stmt`; `assignKeys` gives
`id ?? <from>-><to>#<n>` in source order (`:1299-1305`; decision 0004). `Relation.node` is typed
`RelationStatement` (`types.ts:244`) and read wherever a relation's statement is edited, drawn or
copied, among them `setRelationLine`
(the arrow token, `packages/edit/src/relations.ts:116-122`), `reconnectRelation` (`source` and
`target`, `:131`), `removeRelation` (`start` and `end`, `:75`), the naming of a relation (`label`
or `target`, `packages/edit/src/plan.ts:620-624`, `874-876`), `namedEvent` (`edit/src/sequence.ts:253`)
and the clipboard (`packages/editor/src/clipboard.ts:105`). `checkOrder` (`sequence.ts:556`) keeps a
`LifeState`, a `Lifeline` per participant (`depth`, `appeared`, `created`, `destroyed`; `:48-55`),
and reports
`sequence.activation` for a `deactivate` at depth 0 (`:574-592`). The event tree reaches the
layout (`:274`, `process` recursing into branches at `:461`), the scenarios (`resolveEvents`,
`packages/model/src/scenario.ts:35-49`, suffixing keys with `@k` inside repeated loops), the JSON
(`eventJson`, `packages/model/src/json.ts:655-668`) and the editor (`eventInfos`,
`packages/editor/src/sequence.ts:55-90`, `parent` from the last `path` entry's `fragment`;
`containerOf` and `eventsOfBlock` in `edit/src/sequence.ts:83-88`, `681-686`; `moveEvent`
`:186-245`; `wrap` at `editor/src/sequence.ts:277`; hover's `eventPlace`,
`packages/editor/src/services/hover.ts:111-121`). `toggleActivation` (`edit/src/sequence.ts:616-679`)
writes the pair, finding the reply by a search (`:653-657`). The canvas offers the sequence
commands P, A, O, F, Alt+Up, Alt+Down and Alt+A (`packages/editor/src/canvas/keyboard.ts:169-175`;
`Alt+G` and `Alt+Shift+G` group and ungroup at `:139-140`), its context menu lists Move up, Move
down, Activate the receiver, Add a note, Wrap in a fragment, Add a divider and Add a delay
(`app.ts:6417-6445`), and the sequence `CanvasAction`s are `moveEvent`, `toggleActivation`,
`insertEvent` and `wrap` (`packages/editor/src/canvas/protocol.ts:878-890`, validated at
`:1234-1240`, handled by `sequenceAction`, `editor/src/sequence.ts:192-294`, routed at
`packages/editor/src/session.ts:1570-1590`). The importers map PlantUML `++`/`--`/`return`
(`packages/import/src/plantuml/sequence.ts:118`, `287-310`: a dashed reply to the activator plus
`deactivate`) and Mermaid `+`/`-` (`packages/import/src/mermaid/sequence.ts:418-455`) to explicit
pairs; their specs pin that output. The TextMate grammar lists the sequence event keywords
(`packages/vscode/syntaxes/meltemi.tmLanguage.json:89-90`) and the diagram property words
(`:102`); completion offers participants after `activate` and `gap` (`packages/editor/src/services/completion.ts:336`,
`:752-753`). The formatter prints any block by the canonical rules (`source-formatting` "Canonical
layout"; a test for a one-line relation block exists). The corpus has `corpus/valid/sequence/payment.meltemi`
and `constructs.meltemi`, whose SVG snapshots the visual suite pins; invalid cases are named by their
code (`corpus/invalid/<code>.meltemi` with `<code>.diagnostics.json`).

## Goals / Non-Goals

**Goals:**

- The distance between participants is a number the person sets: per diagram, per pair, on either
  side, tighter or wider, from the text, the inspector and a head drag, and a value the layout
  cannot honour is reported, never swallowed.
- "This call happens inside that call" is written once, in the call's block; the reply that
  answers it is `return`; the activation bar follows from the nesting; every tool that walks events
  (layout, scenarios, JSON, edits, canvas, hover) sees the nesting.
- Language 0.2 stays: every valid file keeps its model, its keys and its drawing, except the
  first participant's `gap`, which was read and ignored (a defect: the written value now draws).

**Non-Goals:**

- Coordinates for participants or events, or free vertical drags (decision 0019's rejections stand,
  `docs/decisions/0019-sequence-profile.md:53-60`).
- A negative `space` (rows have no measured floor) and a row spacing property (the `spacing`
  decision records the alternative, an open question the default).
- The importers' output and Alt+A's pair, decided below and left to the owner as open questions.
- Resize handles between columns, or any new overlay on the canvas.

## Decisions

### `spacing` is a diagram property, not a theme token or a placement statement

`SEQUENCE_PROFILE.diagramProperties` gains `spacing: { kind: "number", min: 0, max: 400 }`
(`schema.ts:643-650`), the flow analyzer's property switch stores `properties.spacing: number | null`
(`types.ts:371`, `flow.ts:1370-1372`; null means the default), and the layout's base becomes
`diagram.properties.spacing ?? Math.round(40 * f)` at `layout/src/sequence.ts:155`: a written value
is the person's number in diagram units, not scaled by the theme, as `gap` is not. The inspector's
`sequenceDiagramFields` adds `{ name: "spacing", label: "Participant spacing", type: "number",
placeholder: "40" }` after `autonumber`, written by the existing `setDiagramProperty` path
(`inspector.ts:1326`); completion offers it with the other diagram properties (from the profile
table, no code), the grammar's property words gain it (`tmLanguage.json:102`), and `model-json.md`
gains the row under `properties`. Alternatives: (a) a theme token (`theme.sequenceSpacing`): a theme
is shared by many diagrams and the owner asks for one diagram; (b) a `placement` statement
`spacing <n>`: it is not about one target, and the diagram inspector is where the screenshot looks;
(c) only per-pair `gap`s (writing one per pair to tighten a whole diagram). Recommendation: the
diagram property. Rows: `spacing` takes one number. A second one (`spacing 40 20`) or a
`rowSpacing` property would set the 14-unit row gap (`:212`) for the whole diagram; the owner asked
about the distance between participants, rows take `space … before` and, with this change,
`space … after`, and a row gap has no measured floor to explain. Recommendation: columns only, with
the row property as an open question whose default is no.

### `space` and `gap` take a side, and both sides of a pair add up

`space <event> <n> [before|after]` and `gap <participant> <n> [before|after]` are read by
`placementStatement`: a third argument that is the identifier `before` or `after`, anything else
reported with the statement's form; `SpaceEntry` and `GapEntry` gain `side: "before" | "after"`,
`duplicatePlacement` keys on target and side, and `placementJson` writes `side`. The layout reads
`gap` sides into `gapsBefore` and `gapsAfter`: the distance of the pair (i-1, i) is
`halves + base + (gapsAfter(p[i-1]) ?? 0) + (gapsBefore(p[i]) ?? 0)`, `gapsBefore(p[0])` is added to
`xs[0]` and `leftExtra` keeps its own role, and `gapsAfter(last)` joins `rightExtra` at `:524`, so
the canvas grows on that side. `space … after` is added to `y` after the event's row in `process`
(after `rows.set`, so the row band itself excludes it and a drag of the next event keeps its own
`space`); on the last event it adds to the end of the lifelines. The editor writes `before` only
(a drag, a head drag, Up and Down), and the formatter keeps a written `before`. Alternatives:
(a) `gap` only, no `space … after` (the owner's words are "space before or after", and the last
event has no "next" to put a `before` on); (b) new statements `gapAfter`/`spaceAfter` (two more
keywords for the same idea, two more completion lists); (c) refusing a `before` and an `after` on
the same pair (`gap b 20 after` and `gap c 20 before` would be in conflict for no reason; summing
is what "extra room" means). Recommendation: the side, `before` by default, sums.

### A `gap` may be negative, down to a floor the layout reports

`placementStatement` accepts a negative amount for `gap` (the `amount.value < 0` branch at `:686`
applies to `space` only, with `pixels` reworded "0 or more" for `space` and "a number of pixels" for
`gap`), except on the edge: `gap <first> <n> before` and `gap <last> <n> after` with `n < 0` are
`prop.invalid-value` with the hint "there is nothing left of `customer` to tighten; a gap on the
outer side is 0 or more" (the analyzer knows the order: `this.elements` without groups). The layout
computes each pair's written distance `halves + base + gaps` and clamps it at the pair's floor,
`widths[i-1]/2 + widths[i]/2 + HEAD_CLEARANCE` with `HEAD_CLEARANCE = 8`, then runs the constraints
as today; afterwards, for every pair whose written gap sum is negative and whose final distance is
wider than the written one, it pushes a diagnostic `layout.gap-floor` (warning) on the `gap`
statement's range (`entry.range`), "The gap before `service` is -12 here, not -30: the heads and
the labels between `test` and `service` need the room", naming the applied amount
`distance - halves - base - <the other side's gap>` (an integer); when both sides are written, the
warning goes on the `before`. The warning is part of the layout's `diagnostics` (as
`layout.degenerate-line` and `layout.vertical-align-ignored` are), so the CLI, the problems list and
the hover report it; `pnpm conformance` drops it as it drops every `layout.*` code
(`packages/acceptance/src/conformance.ts:132-136`), and `corpus/invalid/layout.gap-floor.meltemi`
with its `.diagnostics.json` pins it through `packages/layout/test/corpus.test.ts:33-45`, which runs
every `corpus/invalid/layout.*` file (`docs/language/diagnostics.md:96`). A positive gap
absorbed by a longer label stays silent, as today: its meaning is "at least this much more", and
the policy forbids changing what a valid file means. The inspector's `sequenceFieldOperations`
accepts a negative `gap` except on the edge (reason text "Write a number of pixels; before the first
participant and after the last, 0 or more."), `setSpacing` rounds and writes a negative amount and
treats only 0 and null as removal (`:268` changes to `amount === null || amount === 0`), and the
canvas's "Gap before" field has no `min`. Alternatives: (a) refuse negatives and offer `spacing`
alone (a single long label in the screenshot's diagram would still fix the pair); (b) clamp
silently (config's "conflicts produce diagnostics, never silent moves"); (c) let `gap` override the
label room and let labels overlap (a drawing nobody wants, and the label audit would flag it);
(d) a `prop.invalid-value` from the model when the gap is below the floor (the model measures no
text); (e) clamping a negative gap on the edge to 0 with the floor warning instead of refusing it (a
warning for a value that can never mean anything, where the inspector refuses it with a reason
before anything is written). Recommendation: negative down to the floor, with the warning from the
layout, and the error on the edge.

### The first participant's `gap … before` is room left of it

The `i === 0` branch (`:150-152`) becomes `widths[0] / 2 + max(0, gapsBefore(p[0]) ?? 0)`, and the
canvas's leftmost edge (`:523`) stays `xs[0] - widths[0]/2 - leftExtra`, so the room is inside the
drawing. A file that already writes a `gap` on its first participant draws differently: the value
was written to be seen and the layout never read it, a defect of the layout that decision 0060 and
the changelog's Fixed entry name (the policy promises the same drawing "for the same tool version",
`policy.md:35-36`). Alternative: keep ignoring it and refuse it in the model (a valid file would
become invalid, `policy.md:48`). Recommendation: draw it.

### A head drag writes `gap` unless a neighbour's centre is crossed

`sequenceMove` keeps its index computation and, when the index equals the participant's current
index among its declared siblings (the case that returns no edit today), emits
`setSpacing { target: id, targetKind: "participant", side: "before", amount: round(gapOf(id) +
delta.x) }`, clamped at 0 for the diagram's first participant only, so a drag of the first head left
writes nothing and snaps back, as it does today, while any other head goes negative down to the
floor; crossing a neighbour's centre still reorders and writes no gap. A drag under `DRAG_THRESHOLD`
never reaches `move` (the canvas's existing rule), so a click does not write a gap. The live preview
is the existing `followPointer`, and the announcement says "Gap before bank: 24". When the layout of
the result reports `layout.gap-floor` on the statement the drag wrote, the session sets
`pendingStatus` (`packages/editor/src/session.ts:168`, sent as the `status` message with the
render, `:326-328`) to "Gap before service: -30 written, -12 drawn: the labels need the room", so a
head that lands short of the pointer reads as a rule, not a defect. Left and Right keep swapping
(`nudgeSequence`); no key changes a gap, since the inspector's field is one Tab away.
Alternatives: (a) resize handles between columns (new overlay, hit-testing and keyboard access in
`app.ts` and the webview suite; the head is what the owner drags); (b) Alt-drag for spacing and
plain drag for reorder (two gestures for one head, and Alt already means "without the grid");
(c) a gap written on every drag, reorder or not (a reorder would also move the gap the person did
not ask for); (d) a head drag that keeps reordering only, the gap written from the inspector alone
(a head that snaps back is what "fixed" looked like to the owner). Recommendation: the one gesture,
decided by the centre crossing, which is the rule `sequenceMove` already applies.

### The call block is the form for connected calls

A message block in a sequence diagram may hold, besides the properties, any event statement:
messages, `return`, `activate`, `deactivate`, `create`, `destroy`, notes, fragments, `divider` and
`delay`. `elementBlock` is called with the block's property statements only: `SequenceAnalyzer`
splits a relation block into the statements that are events (`isEventStatement`: relation
statements, `return`, and `EVENT_KEYWORDS`; the predicate `packages/edit/src/create.ts:236-238`
already applies to place a new message after the last event) and the rest, hands the rest to `elementBlock` (so
`kind async`, `description`, `assumption` and `class` work as today and an unknown property keeps
its `prop.unknown`), and keeps the event statements for `buildEvents`. The events inside happen
after the call's arrow and before what follows the call statement; the callee is active for the
block (next decision). A block on a self-call, on an async call, on a two-way message and on a
written reply is allowed: the rule is the same for every message, and the bar is on `to`. Fragments
nest inside a call block and calls with blocks nest inside fragment branches; depth is bounded by
the parser's 100 levels. Alternatives: (a) a `reply <call>` property on written replies (N2: nesting
is implied by position, every linked call needs an `as` id, an unanswered call cannot be "inside"
anything); (b) `return` on explicit activations only (N3, PlantUML's model: the link is inferred
from the activation stack, and a call without an `activate` has no inside); (c) `++`/`--`
suffixes (N4: `--` is the solid line token, the lexer takes the longest run, so it needs new tokens
and parser changes). Recommendation: the block, which the grammar parses today, and which says
"inside" where the person reads it.

### `return` is a reply relation whose node is the `return` statement

`return ["Label"] [as <id>] [{ properties }]` inside a call block becomes a `Relation` with
`from` the call's `to`, `to` the call's `from`, `line: "dashed"`, `heads: "end"`, `twoWay: false`,
`async: false`, `label`, `id`, `classes` and `description` from its block (the relation property
table), `returns: <call key>` (a new field, null on every other relation and in every other
profile), and `node` the `KeywordStatement`: `Relation.node` becomes `RelationStatement |
KeywordStatement`, and the compiler lists every reader. The readers that touch sequence diagrams
branch on `relation.returns !== null`: `setRelationLine` and `reconnectRelation` refuse a return
(`edit.invalid-value`, "a `return` answers its call; unnest the call to write the reply by hand"),
the naming of a relation (`plan.ts:620-624`, `874-876`, `namedEvent`) inserts ` as <id>` after the
label string or after the keyword, `setRelationLabel` edits the string after `return`,
`removeRelation` deletes the statement as any other, and the clipboard copies it by range. The key
is `id ?? <callee>-><caller>#<n>` counted in source order with every other relation of that pair
(`collectRelations` walks call blocks and emits the `return` statements in place), so a diagram's
existing keys do not move and a `return` and a written reply between the same pair number
together. The message event of a `return` is an ordinary `MessageEvent`; the `returns` link lives
on the relation and the enclosing call is the last `{ message }` of its `path`. Everything that
handles messages handles returns unchanged: `autonumber`, `space`, `label … at`, styles and
classes, `animate`, the canvas's relation hit-testing, the inspector's message fields (with
**Message** reading `return`, read-only, and **From** and **To** read-only), hover and the JSON's
`relations`. Alternatives: (a) a `ReturnEvent` kind beside messages (every message feature would be
written again for returns, and the drawing is a message's); (b) keep `node: RelationStatement` and
synthesise a fake relation statement (a lie the edit layer would trip on). Recommendation: the
relation with its own node type.

### The implicit bar, and how it composes with explicit activations

In the layout, `process` handles a message with `events` by drawing the arrow, setting `last`, then
pushing `Bar { participant: to, depth: stack.length, top: arrowY }` on `stacks.get(to)` (so `edge()`
moves the ends of the nested messages to the bar's edge, as it does for an `activate`), processing
the nested events (which advance `y`), and popping the bar with `bottom = last.y` when the last
nested event was a message touching `to` (a `return` is one), else `y`, at least 12 tall; an empty
block draws a 12-unit bar. Explicit `activate to` inside the block pushes a deeper bar as today. In
the model, `checkOrder` enters a call's block with `line(to).depth++` and `line(to).implicit++`,
leaves it with both decremented, and reports `sequence.activation` for a `deactivate` of `to`
inside the block when `depth === implicit` ("`api` is active for the call `pay`; its bar ends with
the block") so the implicit bar is never popped by text; a `deactivate` of another participant, or
of `to` above an explicit `activate`, is checked as today. Branch states copy the counters as they
copy `depth`. `return` ends its statement list: a later event in the same list is
`sequence.return` ("`pay` already returned; move this event before the `return`"), and a `return`
outside any call block is `sequence.return` ("`return` answers a call: write it inside the call's
block, `a -> b { … return }`"; the PlantUML importer already names the same situation, a `return`
with no call to answer, `sequence.return` among its findings,
`packages/import/src/plantuml/sequence.ts:289-294`, and the model's code joins
`docs/language/diagnostics.md` beside `sequence.activation`); a `return` inside a fragment branch
inside a call ends that branch only, and the call's bar ends with its block's last event whatever it is. The row of a call is its
own arrow row (`rows.set(key, { y: start, height })` before the nested events are processed), and
nested events get their own rows, so the canvas hit-tests them as their own events. Alternatives:
(a) the bar from the call to its `return` only, the nested events outside it (a call without a
return would draw no bar, and the owner's "connected" is the whole block); (b) refusing an
explicit `activate` of the callee inside the block (a deeper bar is what PlantUML draws for a
re-entrant call, and nothing breaks). Recommendation: the bar is the block.

### Keys, places and the `events` of a message

`EventPlace` becomes `{ fragment: string; branch: number } | { message: string }` (the call's key);
`MessageEvent` gains `events: readonly SequenceEvent[]` (empty for a message without a block), and
every walker of the tree recurses into it: `buildEvents` (with `[...path, { message: key }]`),
`checkOrder`, `register`, the layout's `walk` and `process`, `resolveEvents`, `flattenEvents`,
`withNested` and `eventsOfBlock` in the edit package, `allEvents` and `eventInfos` in the editor
(`parent` is the fragment or the message of the last place), `eventPlace` in hover ("inside
`pay`"). Keys are unchanged: event keys of messages are their relation keys, notes and fragments
keep `<kind>#<n>` in order of appearance, and `nextKey` counts across the whole tree as it does
across fragments. `containerOf` returns the call's block for a `{ message }` place (the block is on
`relation.node`; a `return` statement has none, so a `return` is never a container). The JSON's
message event gains `events: EventJson[]` after `relation`, and `RelationJson` gains `returns:
string | null` after `async`; `MODEL_JSON_VERSION` stays `0.1`, since no existing field changes.
Alternative: a `call` field on every nested event instead of a place (two ways to say where an
event is; `path` is what every tool reads). Recommendation: the place.

### Edit operations: nest, unnest, move, insert, remove, toggle

- `nestInCall { diagram, call, events }`: `call` is a message key, `events` the keys of consecutive
  siblings that directly follow the call in its block (refused otherwise with `edit.unsafe-target`
  naming the rule; a `return` among them is refused, since it would answer a different call);
  when the call has no block, the statement gains ` {` + the moved text re-indented one level +
  `}`; when it has one, the moved text goes after its last statement (properties included), as
  `relocate`'s `end` destination writes it. The moved text is the source slice, so comments move
  with it, and `verifyNoNewErrors` guards the result.
- `unnestCall { diagram, call }`: the block's event statements are written after the call statement
  at its indentation (comments with them); every `return` that answers the call, at any fragment
  depth inside the block, is rewritten in place to `<callee> --> <caller>[: "Label"] [as <id>]
  [{ … }]` (its key is unchanged, since the pair and the order are); the block is removed when only
  events were in it and kept with its properties otherwise. The rewrite keeps every statement
  where it is relative to the others (a nested call keeps its own block and its own returns), so
  the only refusal is a call without a block (`edit.unsafe-target`).
- `moveEvent`: a `{ message }` place is a container like a branch: Alt+Up on the first nested
  event moves it out before the call, Alt+Down on the last moves it out after the call, and an
  event whose neighbour is a call with a block moves into it (moving up, to the end of the block
  but before a trailing `return`, so the return stays last; moving down, to the start), as it
  enters a fragment today; a move that puts a `return` outside its call or after another `return`
  fails `verifyNoNewErrors` and is refused with the reason.
- `insertEvent { inside: { message: key } }`: appends to the call's block, creating it when none;
  `after` works for nested events through `containerOf`. `sequenceAction`'s new `addReturn`
  inserts `return` (no label) this way for the selected call, or for the call enclosing the
  selected event.
- `removeRelation` of a call with a block deletes the statement whole and lists, as `removeEvent`
  does for a fragment, the dependents of the nested events and relations (their `space`, styles,
  animations, scenario choices, stories) through `eventDependents` and `relationDependents`;
  `removeEvent` keeps refusing messages (a `return` is removed with `removeRelation`).
- `toggleActivation` on a call that has a block is refused with `edit.invalid-value` ("the block of
  `pay` already activates `api`"), and on a nested message works inside the block as today.
- `wrapInFragment` of nested events works through `containerOf` (same block, consecutive); the
  `wrap` action's outer-event filter reads fragment places only, as today.
- `setSpacing` gains `side?: "before" | "after"` (default `before`) and the sign rules above;
  `removeElement` lists the participant's `gap` statements of both sides.

Alternatives: a single `setNesting` operation with a direction (two operations read better in
`EditOperation` and in the tests, as `wrapInFragment`/`unwrapFragment` do); making `nestInCall` also
turn a trailing written reply into a `return` (an edit that changes two things; the person presses
Alt+R for the return). Recommendation: the operations above.

### Canvas: keys, menu, inspector

`CanvasCommand` gains `nestInCall` (Alt+N), `unnestCall` (Alt+Shift+N) and `addReturn` (Alt+R) on
the `sequence` profile, described in `keys.ts` in both languages, beside Alt+A; `CanvasAction`
gains `nestInCall { ids }`, `unnestCall { ids }` and `addReturn { ids }`, validated like
`toggleActivation`; `sequenceAction` turns them into the operations: for `nestInCall` the selected
events, in order, must be preceded in their block by a message (the call), else the reason "Select
the events right after the call they belong to"; `unnestCall` and `addReturn` take the selected
message, or the call enclosing the selected event. The context menu lists **Nest in the call**
(Alt+N), **Unnest the call** (Alt+Shift+N) and **Return to the caller** (Alt+R) after **Activate
the receiver** (`app.ts:6428-6433`), disabled in a scenario preview and on a read-only canvas as the
others are. Alt+N, Alt+Shift+N and Alt+R are free on every profile (`keyboard.ts:116-184`); N
alone is `createNode` on flow (`:153`) and nothing on sequence, so the letter reads as "nest" there,
and R alone is the relation tool everywhere (`:152`). The
inspector's `messageFields` gives a return **Message** with the option `return` and
`readonly: true`, and **From** and **To** read-only (`reconnectRelation` refuses them anyway); the
**Space before** and **Space after** fields apply. Alternatives: Alt+A on a call creating a block
instead of a pair (Alt+A is the documented explicit activation, and the pair is what the importers
write); a toolbar button (the toolbar's sequence buttons are creation tools; nesting is an edit of
a selection, like Alt+A); dragging the selected events onto a call's arrow or bar (a drop target
with its outline, hit-testing and webview scenarios, for what two keys do). Recommendation: the
three commands.

### Scenario resolution keeps nesting

`resolveEvents` returns a message with its `events` resolved recursively (so a fragment inside a
call is decided and a loop inside a call repeats), and `resolveFragment`'s loop suffix applies to
a call's key and, through the recursion, to its nested keys, so `poll@2` holds `poll_reply@2` and
the layout's `baseKey` strips the suffix for `space` as today. `flattenEvents` includes nested
events after their call. Alternative: flattening call blocks in scenarios (the bar would vanish
in exports of a scenario). Recommendation: keep the tree.

### Model JSON, services, grammar, formatter and corpus

`placementJson` writes `side` on `space` and `gap` entries; `properties.spacing`;
`RelationJson.returns`; `EventJson` message `events`. Completion: `return` among the statements
offered inside a relation block of a sequence diagram (with `kind`, `description`, `assumption`
and `class`), `before` and `after` after `space <id> <n>` and `gap <id> <n>`, `spacing` from the
profile's diagram properties; `keywordDoc("return")` in both languages; hover on a `return`
statement shows the message hover with "returns from `pay`", and `eventPlace` renders a `{ message }`
place as the call's key. The TextMate grammar adds `return` to the sequence keywords and `spacing`
to the property words; `before` and `after` are identifiers by position and stay uncoloured, as
`at` is. The formatter has no special case: a call block is a block, so `a -> b: "Pay" {
return "OK" }` stays on one line and a multi-line block indents its events; a format test pins
both. The corpus gains `corpus/valid/sequence/calls.meltemi` (a nested call with a `return`, a call
inside a fragment, a fragment inside a call, a loop around a call with a scenario repeating it,
`spacing 56`, `gap … after` on the last participant, a negative `gap`, `space … after` on the last
event) with its `.model.json` and `.svg`, and `corpus/invalid/sequence.return.meltemi` (a `return`
at the diagram level and an event after a `return`) with its `.diagnostics.json`; `payment` and
`constructs` keep their snapshots byte for byte, which the visual suite checks.

### Importers stay on explicit pairs

The PlantUML and Mermaid importers keep writing `activate`/`deactivate` pairs and written replies:
their specs pin that output (`plantuml-import` "Return", `mermaid-import` "Activation shorthand"),
their users read the result against the source they wrote, and a flat file whose activations do
not close in the order they opened has no block to hold them. Alternative: emit a call block when a
PlantUML `++` (or `activate`) and its `return` or `--`, or a Mermaid `+` and its `-`, close in the
order they opened, with the events between them as the block and the `return` written as `return`,
and the pair otherwise; it changes the import corpora's snapshots, the scenarios "Return" of
`plantuml-import` and "Activation shorthand" of `mermaid-import` and the PlantUML and Mermaid
tracks of the docs, and gives the result a shape the source does not have. Alt+N and Alt+R turn an
imported pair into a block. Recommendation: unchanged, as an open question for the owner.

## Motion

The head drag's live preview is the existing `followPointer`: the head and its lifeline under the
pointer, no easing (`app.ts:2898-2915`). The drop re-renders and the head lands where the layout
puts it; when the floor wins, the status line says so. A call block's bar, the rows of its events
and a `return` appear with the re-render after Alt+N, Alt+R or an edit of the text, as an
`activate` pair does today. Nothing new animates, so `prefers-reduced-motion` has nothing more to
turn off, and the new inspector fields are number fields like **Gap before**.

## Risks / Trade-offs

- [`Relation.node` widens to two statement kinds and a reader misses the branch] → the compiler
  lists every reader; a test runs every relation operation on a `return` and asserts the refusals
  and the edits.
- [A tiny accidental head drag writes a `gap`] → the canvas's `DRAG_THRESHOLD` applies before
  `move` is sent, and the gesture is undone with Ctrl+Z like any edit; the webview test asserts a
  3-pixel drag writes nothing.
- [A negative `gap` reads as "nothing happened" when the floor wins] → `layout.gap-floor` names the
  amount applied, on the statement, in the problems list and the hover; after a head drag the
  status line says what was written and what is drawn.
- [`space … after` on an event and `space … before` on the next both written] → they add up, as the
  sides of `gap` do; the docs say so.
- [Nested rows confuse the canvas's event drag] → each nested event has its own row band and the
  call's band is its arrow row only; dragging a call moves its block with it in the live preview
  because `y` continues (the test asserts the nested rows move).
- [A file with a first-participant `gap` changes its drawing] → recorded in decision 0060 and the
  changelog as the defect it was.
- [Two bars on the callee, implicit and explicit, draw over each other] → the implicit bar is on
  the stack like any other and an explicit one nests `BAR_STEP` deeper, as two `activate`s do today.

## Open Questions

- Does "space before or after" mean the participants only, or the events too? Default: both;
  `space … after` on events is in, since the last event has no "next" to put a `before` on.
- Is a head drag that writes `gap` the gesture you expect, or should a head drag keep reordering
  only, with the gap written from the inspector? Default: the drag writes `gap`, and the inspector
  stays the precise way.
- Should `spacing` take a second number for rows (`spacing 40 20`), or should a `rowSpacing`
  property exist? Default: no; `space … before|after` and the 14-unit row gap stay, and the
  decision note records the alternative.
- Should the PlantUML (`++`/`return`) and Mermaid (`+`/`-`) importers emit call blocks and
  `return` where the activations nest, changing their snapshots and the "Return" and "Activation
  shorthand" scenarios? Default: no; they keep the pairs their sources write, and Alt+N and Alt+R
  make the block.
- Should Alt+A on a call without a block create the block and a `return` instead of an
  `activate`/`deactivate` pair? Default: no; Alt+A keeps the pair, Alt+N and Alt+R make the block.
- Are the keys Alt+N, Alt+Shift+N and Alt+R right, or should nesting be a drag of events onto a
  call? Default: the keys and the menu, no drag.
- Should a negative `gap` before the first participant or after the last be refused, or clamped to
  0 with the floor warning? Default: refused, with the reason in the inspector and the model.
