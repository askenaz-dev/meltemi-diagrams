## Context

A C4 view (`packages/model/src/c4.ts`) draws the relations of its model: each drawn relation
keeps the model relation's key, id (when the model wrote `as <id>`), label and technology, with
its ends lifted to the nearest drawn ancestors, or it is an explicit combination written in the
view (`a -> b as x`) standing for the model relations of that pair. Styles, effects, routes,
label positions and local labels in the view name a relation by its id, so an anonymous model
relation can take none of them. The editor's session (`packages/editor/src/session.ts`,
`c4Action`) handles four view actions (`includeEntity`, `remove` of entities, `setLabel`,
`renameId`) and refuses the rest through `c4Refused`; `connect` falls through to the flow code,
which writes a relation statement into the view; `targets.ts` refuses to name a C4 relation
(`c4.nameRelation`); `inspector.ts` hides the Style and Effects sections of anonymous C4
relations; `c4.ts` makes the model's fields read-only when `c4.resolved.file` is not null. The
edit package (`packages/edit/src/c4.ts`) already has the model operations the canvas needs
(`createModelRelation`, `removeModelRelation`, `setModelRelationProperty` with `id`, which
inserts `as <id>` into an anonymous relation), but none for moving an end. The session can ask
the host for an edit in another file of the project only for themes
(`SessionResult.project: { kind: "themeFile", file, operation }`), which the playground
(`studio.ts` `applyProject`) and VS Code (`extension/canvas.ts` `applyProjectEdits`) plan with
`ProjectSessions.planInFile` and apply; both hosts apply a `Map<file, TextEdit[]>` in one undo
step already (the explorer's moves, `renameEntityInProject` for Rename Symbol). Sequence
diagrams name anonymous messages for styles and spacing (`styleTargets`, `setSpacing`) but
`effectOperations` refuses effects on anonymous messages, notes and fragments, and the inspector
hides their Effects section. The Mermaid importers write anonymous relations and messages.

## Goals / Non-Goals

**Goals:**

- Every relation a C4 view draws can be reconnected, deleted, created, styled, animated, routed
  and labelled from the canvas, whether its model is in the same file or in another file of the
  project, in one undo step each.
- Every relation, message, note and fragment of every profile takes effects from the inspector;
  anonymous ones are named first, as flow relations are.
- The mechanism that writes another file of the project is one, ordered and verified, and the
  theme panel uses it too.

**Non-Goals:**

- Changing the language: no new statement, no change to how combinations, lifting or local
  labels resolve.
- Naming relations at import time; the importers stay as they are.
- Access rules of the hosted service or the live session; the write goes through the same path
  as any edit of the file.

## Decisions

### A drawn relation is edited in the model, not through a combination in the view

Alternatives: (a) make the view's explicit combination the handle, writing `a -> b as a_b` in the
view and styling that: single-file, but a combination has its own label and technology (none
unless written), so the arrow would lose "Uses" and `[SMTP]` unless the language learnt to
inherit them, and two model relations of one pair would merge into one arrow; (b) keep the
relations read-only and send people to the model's text, as today. Decision: the model is the
truth of a relation, and the canvas writes it there: `createModelRelation`, `removeModelRelation`,
the new `reconnectModelRelation`, and `setModelRelationProperty { property: "id" }` to name
one. Styles, effects, routes and labels keep being view statements that name the model id, as
`docs/language/c4.md` describes. The status line names the model's file when it is not the
view's ("Written in `models/commerce.meltemi`").

### Naming an anonymous model relation

`freshModelRelationId(model, relation, taken)` in `packages/editor/src/targets.ts` gives
`<from>_<to>` with the entity paths' dots replaced by `_` (`shop_api_bank`), then `_2`, `_3`…,
free of the model's relation ids and entity paths, the ids of the model's file and the ids of the
view's file (`create.ts` `freeId` has the same `.`→`_` rule for entity paths). `styleTargets`
returns, for a C4 relation without an id, the operation
`setModelRelationProperty { model, relation: key, property: "id", value }` instead of
`materializeRelationId`, and the target id for the statements that follow. Alternatives: the last
segment of each path (`api_bank`, shorter but prone to collisions across systems); `rel<n>`
(meaningless in the text). The notice `named(ids)` of the status line stays.

### Reconnecting an end

New operation `reconnectModelRelation { model, relation, end: "from" | "to", entity }` in
`packages/edit/src/c4.ts` and `types.ts`: rewrites the end's reference token of the model
statement with the entity's path from the root, keeps the id, label, technology and block, and
verifies no new errors (`model.invalid-relation` for a self or ancestor end, `ref.unknown-entity`).
The session maps `setEnd` on a drawn relation whose `sources` has one key and that is not a
combination: when the dropped element differs from the drawn end, `reconnectModelRelation` with
the dropped entity (a lifted end, where the model relation points at a child of the drawn box,
moves to the dropped entity itself: that is what the drag says); when it is the same element
with a port or a point, the relation is named first and `setRoute` is written in the view, as in
flow diagrams; `setVia` and `moveLabel` name first the same way. A combination (`c4.combined`)
refuses `setEnd` with the reason "`x` stands for `a`, `b`; change them in the model" and keeps
taking routes by its own id. Alternative considered: `setModelRelationProperty` with `from`/`to`
properties; a separate operation reads better in the plan and leaves `setModelRelationProperty`
to the block properties and the id.

### Deleting a drawn relation

`removeModelRelation` gains `cascade: boolean`. Without cascade it lists, as `edit.has-dependents`,
every statement that names the relation: in the model's file (styles, animations, placement,
routes, labels and combinations standing for it alone, as it removes today) and, through the
project, in every other file whose views resolve the model, plus one dependent per other view
that draws the relation ("drawn in `containers`"), so the dialog says what the model loses. With
cascade it removes them all. `removeModelRelationInProject(program, model, key, cascade)` in
`packages/editor/src/projects.ts` mirrors `renameEntityInProject` and returns edits per file. The
session's `remove` in a C4 view plans it for drawn relations with one source, keeps
`removeRelation` for combinations, and reuses the retry-with-cascade message the canvas already
shows as a dialog. Alternative: refuse as today; or remove silently. Asking first is the
behaviour Delete has everywhere else when something else depends on the target.

### Creating a relation

`connect` in a C4 view plans `createModelRelation { model, from, to }`; with `pinned` ends it
adds `id: freshModelRelationId(...)` and the view's `setRoute`, as the flow code does with
`createRelation`. Models accept `->` only (`messages.c4.arrow`), so the canvas offers one arrow
kind on C4 views: the split button and the relation tool show `->`, Shift changes nothing, and
the `connect.twoWay` refusal reads "Relations of C4 views go one way: `->`." The new drawn
relation is selected by its model key (`<from>-><to>#<n>`, or its id when pinned), which the
view gives it.

### Labels typed on an arrow

Double-click and Enter on a drawn relation standing for one model relation write the model's
label (`setModelRelationProperty label`) when the model relation has no label, and the view's
local `label <id> "Text"` (naming the relation first) when it has one; a combination's label
stays its own statement's. The inspector keeps both fields, "Label in this view" and "Model
label". Alternatives: always local (a relation just drawn would get an unlabelled model relation
and a label other views never see); always the model's (a local override could not be typed on
the canvas). The rule fills what is empty and overrides what is not.

### Steps over the files of a project

`SessionResult.project` becomes
`{ kind: "files"; steps: readonly { file: string | null; operation: EditOperation }[] }` or
`{ kind: "createTheme"; … }` (`themeFile` goes; the theme panel emits one step). `file: null` is
the session's document. `ProjectSessions.planSteps(documentPath, steps)` in
`packages/editor/src/projects.ts` plans the steps in order: consecutive steps of one file become
one `batch` plan against that file's compilation, the planned text is set as a temporary overlay
and the project recompiled before the next file's steps, so a view's style sees the id the
model's step wrote; `renameEntity` and `removeModelRelation` steps are extended to every file of
the project with `renameEntityInProject` and `removeModelRelationInProject`; the overlays are
restored afterwards; the result is `{ ok: true, edits: ReadonlyMap<file, readonly TextEdit[]> }`
against each file's current text, or the first rejection's reason. The playground's
`applyProject` passes the map to `applyEdits`, which already makes one undo step across files;
VS Code's `applyProjectEdits` puts every file in one `WorkspaceEdit`. The session uses steps
whenever an action writes a model that is in another file (`c4Action`, `c4FieldOperations`,
`renameId`, `styleTargets` through the field operations), and an ordinary plan when the model is
local. Alternatives: (a) return `plan` and `project` together, applied separately: two undo
steps, and the view's statement would be planned against a compilation that does not know the
id yet, so `verifyNoNewErrors` would refuse it; (b) have the host apply the model's step, wait
for the analysis and ask the session again: asynchronous in both hosts and two undo steps in the
playground. Planning in the project with threaded overlays is what `planInFile` does for one
file, extended.

### Naming sequence targets for effects

`effectOperations` stops refusing anonymous messages, notes and fragments. `styleTargets` names
a message with `materializeRelationId` (as it already does for styles) and a note or a fragment
with `renameEvent { event: key, newId }` and a fresh `<kind><n>` id (`note1`, `alt1`, `loop2`),
free in the diagram; the inspector shows the Effects section for them. `reasons.nameForEffect`
goes. Alternative: keep the refusal and the hidden section; nothing in the language asks for it,
and the Mermaid import leaves every message anonymous.

### Writing the model's fields from a view in another file

`c4FieldOperations` loses its read-only branch: `entity.*` and `relation.*` fields and the
inspector's id become steps in the model's file; `renameId` plans `renameEntity` or
`setModelRelationProperty id` as a step that `planSteps` extends to the project. The inspector
keeps "Open the model" and shows the model's file under the fields instead of the read-only
placeholder. The flow of the current view's selection after a rename is unchanged.

## Risks / Trade-offs

- [A canvas edit changes other views of the model] → the status line names the model's file, and
  Delete lists the other views that draw the relation before removing it; the reconnect and the
  label write are undone with Ctrl+Z from the view's file, as every multi-file edit is.
- [VS Code undoes a `WorkspaceEdit` file by file] → the same holds for Rename Symbol today; the
  message after the edit names the files written.
- [Verification is per file] → the project planners extend removals and renames to every file,
  and the view's steps are verified against the overlay that already holds the model's edit, so
  a dangling id is refused before anything is written.
- [`namedRelation` on a drawn relation of an imported model would use the model file's offsets
  in the view's text] → after this change no view action materialises a model relation through
  the view's text; the C4 paths all go through `setModelRelationProperty`.
- [Live sessions and cloud projects] → `applyEdits` with several files is the path the explorer's
  moves take in those projects already; a guest without write access is refused where every
  edit is.
