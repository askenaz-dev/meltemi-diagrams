## Why

The owner reported three problems with sequence diagrams on 2026-10-29, after drawing one on the
canvas.

- **A long message label keeps participants apart.** Dragging a participant's head closer to its
  neighbour was refused by the drawing: the status line said `Gap before participant1: -300
  written, 106 drawn: the labels need the room.` (`packages/editor/src/messages/en.ts:326`),
  because the label "Esto es una prueba de un texto Largo", sent from the second actor to that
  participant across another lifeline, is kept on one line. The layout measures a message label
  as one line (`messageLabel`, `packages/layout/src/sequence.ts:127-128`), adds a column
  constraint of its whole width plus 24 between the two ends (`:182-195`, applied at `:224-228`),
  reports `layout.gap-floor` when a negative `gap` asks for less (`:229-256`), gives every message
  row one line of label (`labelHeight`, `:261`; the arrow at `y + labelHeight + 4`, `:369`; the
  label box one line high, `:377-398`) and draws the label as one text item (`emitter.message`,
  `:1062-1079`), so a `\n` written in it is drawn as a space. The owner asked for the text to wrap.
- **Sequence diagrams have no tags.** Flow diagrams have `tag <id> "PKCE"` pills
  (`docs/language/grammar-0.2.md:140`; the `tag` drawer, `packages/layout/src/layout.ts:5451-5490`,
  in the theme's `tag` and `tagText` colours at `tagSize` in the mono font, sized at `:4455-4461`)
  and the canvas's Tag tool, T (`packages/editor/src/canvas/keyboard.ts:179`). A sequence diagram
  refuses `tag` as a flow declaration (`OTHER_DECLARATIONS`, `packages/model/src/sequence.ts:105-117`)
  and has nothing to mark a message as "PKCE", "v2" or "idempotent", or a participant as
  "external" or "legacy". The owner asked for "un componente que permita agregar labels (o badge)".
- **Activations are code only.** The canvas offers an activation through Alt+A
  (`keyboard.ts:205`) and the context menu's **Activate the receiver** on a message
  (`packages/canvas/src/app.ts:8727-8734`), both running `toggleActivation`
  (`app.ts:7618-7622`; `packages/edit/src/sequence.ts:716-783`). There is no toolbar button and no
  inspector field; an activation bar is a rectangle inside its participant's lifeline group
  (`emitter.lifeline`, `sequence.ts:845-882`), so a press on it is a press on the lifeline, it
  cannot be dragged, and Delete cannot remove it: `removeEvent` of an `activate` leaves its
  `deactivate` unmatched and is refused (`packages/edit/src/sequence.ts:588-612`).

The base is ready for each. `wrapLines` (`packages/layout/src/text.ts:95-160`, decision 0064)
breaks a text at a width with the layout's own measurer, and the canvas's inline editor already
wraps a sticky's text as the card draws it (`InlineOptions.wrap`, `packages/canvas/src/inline.ts:196-199`;
`wrappedFrame`, `:58-80`; the sticky's `TextPlace`, `packages/editor/src/text-places.ts:160-198`).
The flow tag's pill, tokens and font exist. `moveEvent` relocates an event statement with its
comments and validates the result (`relocate`, `packages/edit/src/sequence.ts:120-159`; `moveEvent`,
`:203-283`), and a batch plans operations one after another on recompiled text
(`planBatch`, `packages/edit/src/batch.ts:110-140`). Post-1.0 change, outside the roadmap
(`docs/roadmap-1.0.md`); it builds on `sequence-profile` (roadmap 10, decision 0019),
`sequence-spacing-and-nested-calls` (decision 0060) and `whiteboard-tools` (decision 0064), and
records decision 0065.

## What Changes

- **Message labels wrap when their participants are pulled closer.** A message label keeps its
  line and pushes its columns apart as today. A pull (a negative `gap`, what a head drag writes, or
  a `spacing` below the default) is taken from that natural distance, so the pair moves by exactly
  the amount written, and a label left less room than its width wraps at the room between the
  lifelines (their distance minus 12 on each side and the number disc), at spaces, a word wider
  than the room broken; `\n` always breaks a line; lines are 1.25 times the label size apart; the
  row grows by the extra lines and the arrow sits under the last one. A pull stops at the longest
  word of each label plus the margins, and `layout.gap-floor` fires only when even that does not
  fit. A self-call keeps its label beside the loop (broken at `\n` only); `label <message> at n%
  offset (dx, dy)` still moves the wrapped block. The label audit measures each drawn line. The
  canvas's inline editor of a message label wraps at the same room and grows down as the row will.
  **BREAKING** for drawings with a negative `gap` between participants that labels pushed apart:
  the gap is now measured from the pushed distance, so they draw closer (the corpus, gallery and
  acceptance snapshots are re-recorded). Drawings without a pull do not change.
- **Tags on messages and participants.** `tag "Text"` statements in the block of a message
  (`return` included) or of a participant of a sequence diagram, several in order, are drawn as
  the flow tag's pills (theme `tag` and `tagText`, `tagSize`, mono): a message's on its arrow
  line next to its source end, the pill covering the line; a participant's over the top edge of
  its head like a badge (above a figure). The model records them (`Element.tags`, `Relation.tags`,
  an empty list when none) and the model JSON adds `tags` after `classes` (version stays `0.1`).
  An empty text, a line break, an id, a repeated text on one owner, and a `tag` outside a message
  or participant block of a sequence diagram are diagnostics. Effects and stories that target the
  owner take its tags with it.
- **Tags on the canvas.** T (free on the sequence profile) and a **Tag** palette button add
  `tag "Tag"` (the word in the interface language) to the selected message or participant and open
  the inline editor on the new pill; a double click on a pill edits it in place, an empty text
  removes it; the context menu of a pill offers **Edit tag** and **Remove tag**; the inspector
  shows **Tags**, an ordered list with add and remove. New operations `addTag`, `setTag` and
  `removeTag` write the statements, creating or removing the block as needed.
- **Activation in the interface.** An **Activate** palette button (a lifeline with a bar; "Activate
  the receiver (Alt+A)"; pressed when the selected message's receiver is activated after it;
  disabled without a message or participant selected) runs the same toggle as Alt+A. The inspector
  of a message shows **Activates the receiver**, a checkbox that writes or removes the
  `activate`/`deactivate` pair, checked and read-only with the reason on a call whose block
  activates it. Activation bars become selectable: a press on a written bar selects its `activate`
  event and the status line names the participant and the messages it spans; handles at its top
  and bottom drag the `activate` or the `deactivate` to another event row with a live preview,
  refused with the reason when the order rules forbid it; Delete and the bar's context menu
  (**Remove activation**) remove the pair. A press on the bar of a call's block selects the call.
  `moveEvent` gains a destination form (`to: { after | before: <event> }`) and `removeEvent` of an
  `activate` or `deactivate` removes its pair.
- **Language services, docs, skill, words.** Completion offers `tag` in message and participant
  blocks of sequence diagrams and hover describes a tag and its owner; `docs/language/sequence.md`,
  `grammar-0.2.md`, `model-json.md`, `docs/editor.md` and their Spanish copies; the skill's
  `reference/sequence.md` (synced, `assist:guide` regenerated); English and Spanish words for every
  new control (the glossary's tag → marca, activation → activación); the changelog's open section
  (`## 1.11.0`); decision 0065.

## Non-goals

- Gantt charts, a new diagram type proposed at the same time: the `gantt-diagrams` change
  (decision 0066). This change touches no file of it; where both edit the palette, the docs or the
  changelog, the second to apply rebases on the first.
- Importing tags or wrapped labels from Mermaid (`%%{wrap}%%`, `<br/>`) or PlantUML (stereotypes
  `<<…>>`): the importers' coverage is pinned by their own specs, and broadening it toward every
  source construct is the proposal's 1.0 exclusion of universal import.
- Tags with their own id, style or effect: a tag is an annotation of its owner (decision D5), not
  an element, as flow's `tag <id>` is.
- The delivery change owns the pipelines and the 1.11.0 release of what this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sequence-diagram-model`: ADDED "Tags"; MODIFIED "Messages" (a message's block takes `tag`, and
  its `prop.unknown` hint names it).
- `sequence-layout`: ADDED "Message labels wrap", "Tags are drawn" and "Activation bars as
  objects"; MODIFIED "Columns" (the longest word, not the whole label, pushes a pair apart).
- `sequence-editing`: ADDED "Tag operations"; MODIFIED "Explicit event moves" (the destination
  form) and "Editing events" (`removeEvent` removes an activation's pair).
- `sequence-editor-tools`: ADDED "Activate on the toolbar", "Activation bars on the canvas",
  "Tags on the canvas" and "Message labels typed where they wrap"; MODIFIED "Sequence canvas" (the
  render's tags and activations, the Tag and Activate buttons, T), "Sequence inspector and
  scenarios" (Tags, Activates the receiver) and "Sequence language services" (`tag`).
- `model-json-interchange`: ADDED "Tags in JSON".
- `label-audit`: MODIFIED "Labels checked in the drawing" (a tag's pill holds its text; a wrapped
  label is checked line by line).
- `change-review`: MODIFIED "Semantic differences" (tags are compared).

## Impact

- `packages/model`: `src/schema.ts` (the sequence profile's message and participant blocks taking
  `tag`, `:734-775`), `src/types.ts` (`TagUse`, `Element.tags`, `Relation.tags`, `:170-283`),
  `src/flow.ts` (`elementBlock` reading `tag` statements as it reads `layer` and `link`,
  `:1124-1177`; every other `Element` and `Relation` constructor with `tags: []`),
  `src/sequence.ts` (the refusals and hints, `:105-148`, `:505-523`), `src/json.ts`
  (`ElementJson.tags`, `RelationJson.tags`, `:259-336`, `:724-793`), `src/diff.ts` (the part
  `tags`, `:79-91`, `:250-350`), `src/messages/en.ts` and `es.ts`; tests `sequence.test.ts`,
  `json.test.ts`, `diff.test.ts`, `corpus.test.ts`.
- `packages/layout`: `src/sequence.ts` (wrapped labels, the longest-word constraint, the rows, tag
  pills on messages and heads, the badge room above the heads, bars as their own scene groups,
  `boxes` for bars, `LayoutResult.messageTexts` and `LayoutResult.tags`), `src/layout.ts`
  (`LayoutResult`, `:184-260`), `src/scene.ts` (the `tag` role and `GroupItem.tag`),
  `src/audit.ts` (a tag's pill as its text's background, `:241-243`); tests `sequence.test.ts`,
  `audit.test.ts`.
- `packages/render`: `src/svg.ts` (`data-tag` on a tag's group, `:330-334`), `src/sketch.ts` (the
  `tag` role sketched, `:30-38`); `test/svg.test.ts`.
- `packages/edit`: `src/types.ts` (`addTag`, `setTag`, `removeTag`; `moveEvent.to`, `:523-527`),
  `src/tags.ts` (new, after `setDescription`, `src/labels.ts:65-102`), `src/sequence.ts`
  (`moveEvent`'s destination, `removeEvent`'s pair), `src/plan.ts`; tests `sequence.test.ts`.
- `packages/editor`: `src/canvas/protocol.ts` (`TextPlace.wrap`, `RelationInfo.tags` and
  `activation`, `ElementInfo.tags`, `EventInfo.box` and `pair` for activations, the actions
  `addTag`, `setTag`, `removeTag` and `moveActivation`, `PreviewedAction` and the preview's
  `reason`, the field type `boolean` and `InspectorField.note`), `src/sequence.ts` (`eventInfos`,
  `sequenceAction`, `messageFields`, `participantFields`, `sequenceFieldOperations`),
  `src/text-places.ts` (wrapped message labels, tags), `src/session.ts`, `src/canvas/keyboard.ts`
  (T on sequence), `src/services/completion.ts` and `hover.ts`, `src/messages/*`; tests
  `sequence.test.ts`, `canvas.test.ts`, `text-places.test.ts`, `services.test.ts`.
- `packages/canvas`: `src/app.ts` (the Tag and Activate buttons, `PALETTE` `:500-522` and the
  sequence buttons `:4498-4527`, `createTag` on sequence `:7632-7670`, the `barEnd` drag, `hit()`
  for pills and bars `:5601-5636`, the context menus `:8680-8760`, `openInline` `:8233-8269`),
  `src/inline.ts` (the `grow` wrap), `src/inspector.ts` (the Tags list and the checkbox,
  `fieldControl` `:177-238`), `src/glyphs.ts`, `canvas.css`, `src/messages/en.ts` and `es.ts`,
  `src/view-only.ts`; tests `messages.test.ts`, `view-only.test.ts`, `inline.test.ts`.
- `packages/vscode`: `test/webview/run.ts` (the sequence fixtures `SEQUENCE` and `CALLS`,
  `:340-390`: wrapping, tags, the Activate button, bar selection, drag and removal).
- `packages/playground`: `test/browser/run.ts` (a tag and an activation on the playground's
  sequence diagram).
- `packages/assist`: `src/guide.ts` regenerated from the skill's references.
- Corpus and acceptance: `corpus/valid/sequence/tags.meltemi` (new) with its snapshots, every
  sequence `.model.json` (the `tags` key) and `.svg` (wrapped labels) re-recorded,
  `corpus/invalid/prop.invalid-value-tag.meltemi`, `corpus/acceptance/sequence/long-labels` and the
  visual references re-recorded.
- `docs/language/{sequence,grammar-0.2,model-json}.md`, `docs/editor.md` and their Spanish copies;
  `skills/meltemi-diagrams/reference/sequence.md` (synced); `CHANGELOG.md`;
  `docs/decisions/0065-sequence-wrap-tags-and-activation.md`.
