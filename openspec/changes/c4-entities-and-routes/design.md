## Context

A C4 view (`packages/model/src/c4.ts`) draws the entities `allowedEntities(model, level, scope)`
lets it draw: all persons and systems on a context view, the scope's containers and datastores
plus persons and other systems on a container view, the scope's components plus the other
containers of its system, persons and other systems on a component view; without `include` it
draws the default set (the scope's children and the entities they relate to, `defaultEntities`).
The edit package (`packages/edit/src/c4.ts`) has `createEntity { model, entityKind, parent?, id?,
label? }`, which declares an entity after the last entity of its parent's block (or of the model's
body) with a fresh `<kind><n>` id, and `includeEntity`, which adds a path to `include`, removes
it from `exclude`, or turns the default set into an explicit list; nothing in the editor calls
`createEntity`. The canvas palette (`packages/canvas/src/app.ts`, `PALETTE`) has entries for
flow, free and sequence kinds only; on a C4 view the session's `c4Action` answers `create`,
`paste` and `duplicate` with `c4Refused` reasons, and the only way to add an element is "Add from
the model…" (`includeEntity` over the allowed entities not drawn).

`reconnectModelRelation { model, relation, end, entity }` (`c4.ts:655-672`) rewrites one end's
token of the model statement and verifies the file. The views' `route <id> from <a> to <b>
[via …]` statements name the drawn ends; the analyser (`packages/model/src/flow.ts`, `route`)
reports `placement.route-mismatch` when an end differs from the relation's lifted end, and a
diagram with any error gets no layout (`packages/editor/src/analysis.ts:88`), so the canvas
refuses every edit with `fixFirst`. The session's `setEnd` on a C4 view (`session.ts:1013-1072`)
plans `reconnectModelRelation` and, when a port is dropped, a `setRoute` whose `guardInvalidStatement`
(`packages/edit/src/plan.ts:419-430`) refuses when the existing route is not in `diagram.placement`
of the overlay's compilation, which is exactly the state after the model step. The flow
counterpart `reconnectRelation` (`packages/edit/src/relations.ts:131-180`) rewrites the route's
end in the same edit. `ProjectSessions.planSteps` (`packages/editor/src/projects.ts`) extends
`renameEntity` and `removeModelRelation` to other files (`relationReferences`, `forgetSteps`) and
verifies only the files it planned.

Combinations (`a -> b as x` in a view, standing for several model relations) are refused a style,
an effect, a route or a label while they have no id (`c4.nameCombination`, raised in
`targets.ts:141`, `c4.ts:208` and `session.ts:1077-1087, 1173-1183`); anonymous relations of every
other kind are named on demand. The C4 context menu names the connect action "Combine relations
to…" (`canvas/src/messages/en.ts:361`) although it plans `createModelRelation`; the edit reason
`oneWay` says "`->` or `-->`", and `c4.nameRelation` (`edit/src/c4.ts:251-254`) is never reached
from the session.

## Goals / Non-Goals

**Goals:**

- A C4 view grows from the canvas: persons, systems, containers, datastores and components are
  declared in the model from the palette, paste and duplicate, placed, selected and labelled in
  one undo step, whether the model is in the same file or in another file of the project.
- Moving an end of a relation never leaves a stale `route` behind, in the view edited, in the
  other views of the file or in the views of other files.
- No refusal on a C4 view asks the person to type something the canvas can write itself.

**Non-Goals:**

- Changing the language: no new statement, no change to lifting, combinations or `include`.
- Moving an entity between systems or containers from the canvas (`move.parent` stays refused and
  points at the model's text; a later change may add it).
- Degrading `placement.*` errors to warnings so an invalid route no longer blocks the canvas: a
  language change, kept out of this one.

## Decisions

### The palette offers the kinds the level allows, and the entity goes where the level says

The C4 palette gets one tool per kind `allowedKinds(level)`: context → Person, System; container
→ Container, Datastore, Person, System; component → Component, Person, System (a container view's
palette offers no Component, a component view's no Container, since neither would be drawn).
`c4Action` `create` plans `createEntity { model, entityKind, parent, id, label: "" }` with
`parent` = the view's scope for a child kind of the scope (container or datastore on a container
view, component on a component view) and none for persons and systems, then `includeEntity`
(a no-op when the recompiled view already draws it: a person or a system on a context view, a
child of the scope on a scoped view; otherwise the view's `include` grows, or the default set
becomes explicit, as `includeEntity` does today), then `setPosition` at the drop point in assisted
and manual mode (nothing in auto, as flow creation does), with `pendingSelection` and the inline
label editor on the new element. The id is `freshEntityId` of the edit package (`<kind><n>`),
also free in the view's file; the label starts empty so the editor prompts for one, as flow nodes
do. When the model is in another file the three operations become steps (`file: model's file`
for `createEntity`, `null` for the view's), through `planSteps`. Alternatives: (a) a single
"Entity…" tool asking the kind in a dialog: one more step for every box; (b) offering every kind
and refusing the ones the level does not draw: a tool that answers "cannot" is worse than none;
(c) creating at the root always and letting the person move it: the entity would not be drawn on
a scoped view. Recommendation: the kinds the level allows, placed by the level.

### Paste and Duplicate declare copies

`paste` and `duplicate` on a C4 view plan, per copied entity, `createEntity` with the same kind,
parent (the view's scope for its children, the root otherwise), label and `technology`,
`description` and `external` copied through `setEntityProperty`, with ids `<id>_2`, `<id>_3`… free
in the model, then `includeEntity` and `setPosition` offset as flow paste is; relations are not
copied (the model's relations belong to pairs of entities, and a copy of a container has none).
Alternatives: keep refusing (today); copy the entity's relations too (a pasted container would at
once relate to everything the original relates to, which surprises more than it helps).
Recommendation: copies without relations; the person draws the ones the copy needs.

### `reconnectModelRelation` rewrites the routes of the file's views

The operation keeps its signature and, after rewriting the model end, visits every view of the
file that draws the relation (`drawnIn`, the same walk `removeModelRelation` uses for "drawn in")
and rewrites the moved end of its `route <id>` statement: the new end is the entity's path lifted
to that view's allowed set (`liftTo` of the model package), the old port and position of that end
are dropped (a compass port of the old end carries over as in the flow `reconnectRelation`; a
named port or a point never does), the other end and `via` stay; a view whose lifted end does not
change keeps its route untouched; a route whose ends become the same element (a relation lifted
onto itself is not drawn) is removed with its `via`. `verifyNoNewErrors` then covers the model
and every view of the file. The session's `setEnd` stops planning `setRoute` after the reconnect:
it passes the dropped port as `reconnectModelRelation.port` (new optional field, the `end` port
written into the edited view's route, naming the relation first when it has no id, as today) so
one operation writes everything, and the route's `guardInvalidStatement` is never met.
Alternatives: (a) `setRoute` after the model step, which is what fails today, since the overlay
compiled between the steps already holds the mismatch; (b) remove every route of the relation on
reconnect: loses bends the person drew; (c) make the view's `route` tolerate a mismatch: a
language change. Recommendation: rewrite in the same operation, as flow does.

### `planSteps` reaches other files and verifies the files that resolve the model

A `reconnectModelRelation` step is extended, as `renameEntity` and `removeModelRelation` are, to
every other file whose views resolve the model (`relationReferences` finds the `route` statements
naming the relation; each gets the same rewrite in its own file through a per-file plan of a new
internal operation `rewriteRouteEnd { diagram, relation, end, element }` of the edit package, used
by the extension only). After planning, `planSteps` compiles every file of the project that
resolves the model, not only the files it wrote, and refuses the whole plan with the first new
error, so a view in another file never ends with `placement.route-mismatch`. Alternative: verify
only the written files (today): a model edit can break a view nobody wrote.

### Combinations are named on demand

`nameable` in `targets.ts` stops excluding combinations: for a combination without an id,
`styleTargets` and the session's `setEnd`/`setVia`/`moveLabel`/`setLocalLabel` plan
`materializeRelationId` on the view's own statement with `freshModelRelationId`'s rule over the
drawn ends (`<from>_<to>`, paths with `_`, free in the model, its file and the view's file), then
the statement that needed the id. `c4.nameCombination` goes from `targets.ts`, `c4.ts`,
`session.ts` and the catalogues. Reconnecting a combination stays refused (`reconnectCombination`),
since its ends stand for several model relations. Alternative: keep the refusal; nothing in the
language needs it, and it is the last "type it yourself" refusal of a C4 view.

### Wording

The context menu's C4 entry becomes **Connect to…** (`canvas/src/messages/en.ts:361`, `es.ts:412`),
sharing the flow entry's text. `edit/src/messages` `oneWay` reads "`->`" alone for models (the
flow text stays where flow uses it). `c4.nameRelation` and its raise in `edit/src/c4.ts:251-254`
are removed: the session names relations before any view statement, so the branch is dead; the
`c4.test.ts` case that asserts it moves to asserting `edit.anonymous-relation` from `animate.ts`
for a plan that skips the naming. `c4Refused.create`, `paste` and `duplicate` leave the catalogue;
`move.parent` reads "The elements of a view sit where their entities are in the model; move them
between systems and containers in the model's text." (unchanged meaning, no longer the only exit).

## Risks / Trade-offs

- [A created entity is not drawn on the view] → `includeEntity` runs after `createEntity` in the
  same plan and is verified against the overlay, so the element is in the view's compilation
  before the position is written; the webview scenario asserts the new box is on the stage.
- [Routes of other files rewritten silently] → the status line names every file written, as
  steps do today; Ctrl+Z from the view's file undoes them all.
- [The lifted end of another view differs from the dropped entity] → the rewrite lifts per view
  with `liftTo`, and a view whose lifted end does not move keeps its route byte for byte; the edit
  tests cover a context view (lifted) and a container view (direct) of one relation.
- [A compass port carried to a differently shaped entity] → the same rule flow uses; the port
  stays a side name, which every box has.
- [Paste copies several entities with relations among them] → their relations are not copied;
  the person draws them; the guide says so.
- [The test studio has no ELK] → C4 test views keep `layout manual` with places; the `layout
  auto` reconnect fixture lives in the webview suite, where ELK runs.
