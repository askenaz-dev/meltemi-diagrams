## Why

A C4 view still cannot grow from the canvas: the palette of a C4 view has no entity tools, every
creation answers "Views draw the entities of the model: add one with “Add from the model…”, or
declare it in the model", paste answers "Copy entities in the model's text", and "Add from the
model…" only lists entities the model already has, so on the C4 template, whose views draw every
allowed entity, it says "Every entity this view can draw is already in it". The owner's words on
2026-10-22: that is almost programming the diagram by hand, exactly what Meltemi exists to solve.
The same day's test of `c4-relations-and-effects` found a bug in what it shipped: reconnecting an
end rewrites the model relation but not the `route <id> from … to …` statements the views hold,
so after Recompute layout has written routes in a `layout auto` view, the second reconnect of a
relation is refused with "The `route` statement for `uses` on line 25 is invalid; fix it before
editing visually", and a drop in the middle of a box writes the model and leaves the view with
`placement.route-mismatch`, which blocks the whole canvas. Combinations keep one refusal of the
old kind ("Name the combination in the view (`as <id>`) before styling it"), and the C4 context
menu still says "Combine relations to…" for an action that now creates a model relation. This
change lets the canvas declare entities in the model, keeps routes consistent when a relation
moves, names combinations on demand and fixes the wording. Post-1.0 change, outside the roadmap;
it builds on `c4-profile`, `c4-editing` and `c4-relations-and-effects` (steps over files).

## What Changes

- **Entities are created from the canvas.** The palette of a C4 view offers the entity kinds its
  level allows (Person and System on a context view; Container, Datastore, Person and System on a
  container view; Component, Person and System on a component view), each a tool like the box
  tool: a click or a drop declares the entity in the model, inside the view's scope when the kind
  is a child of it, at the model's root otherwise, with a fresh id and an empty label; the view
  lists it in `include` when that is needed for the view to draw it; in assisted and manual mode
  it is placed where it was dropped; the new entity is selected and its label editor opens, as
  flow creation does. When the model is in another file of the project, the edits reach the host
  as steps over files, in one undo step. Paste and Duplicate of entities declare copies in the
  model the same way. The refusals `c4Refused.create`, `paste` and `duplicate` disappear;
  `move.parent` stays, worded as the model's text.
- **Reconnecting keeps the routes.** `reconnectModelRelation` rewrites the moved end of every
  `route <id>` statement of the file's views, lifted to the entity each view draws, keeping the
  other end and the bends; `planSteps` reaches the routes of the other files' views and verifies
  every file whose views resolve the model. The canvas updates a route that exists instead of
  planning a new one against it. A reconnect never leaves a view with `placement.route-mismatch`.
- **Combinations are named on demand.** A style, an effect, a route, a bend or a label position
  on a combination without an id first writes `as <from>_<to>` into the view's statement, in the
  same plan, as anonymous relations are named; the refusal `nameCombination` disappears.
- **Wording.** The C4 context menu's **Connect to…**; the two-way refusal of models names `->`
  alone; the edit package's unreachable `c4.nameRelation` reason goes; the editor guide's
  "Combinations (C)" paragraph describes what the canvas writes now.
- **Documentation.** The editor guide's C4 section and refusal tables in English and Spanish, the
  changelog's 1.10.0 section, decision 0053.

## Non-goals

- The canvas feel (effects title and autoplay, rotation, sequence heads, the selection kept after
  naming a relation) belongs to `canvas-feel-and-naming`.
- Custom icons on C4 entities come with every other element's in `custom-icons`.
- Export defaults and the visibility of effects belong to `export-defaults-and-visible-effects`.
- The delivery change owns the pipelines and the release of what this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `c4-editing`: `reconnectModelRelation` rewrites the routes of the file's views; the project's
  `planSteps` extends a reconnect to the routes of other files and verifies every file whose views
  resolve the model; `createEntity` is reachable from a view's plan.
- `c4-editor-tools`: the C4 canvas declares entities from its palette, paste and duplicate; a
  reconnect updates the existing route; combinations are named for styles, effects, routes and
  labels; the context menu says **Connect to…**.

## Impact

- `packages/edit`: `reconnectModelRelation` (routes of the file's views), the reasons `oneWay` and
  `c4.nameRelation`; `test/c4.test.ts`.
- `packages/editor`: `session.ts` (`c4Action` gains `create`, `paste` and `duplicate`; `setEnd`
  updates the route), `targets.ts` and `c4.ts` (combinations named), `projects.ts` (`planSteps`
  extends a reconnect to other files' routes and verifies the files that resolve the model),
  `messages/en.ts` and `es.ts`; `test/c4.test.ts`, `test/session.test.ts`, `test/messages.test.ts`.
- `packages/canvas`: the palette of C4 views (`app.ts`), the context menu's wording, messages
  `en`/`es`; a webview scenario in `packages/vscode/test/webview/run.ts`.
- `packages/playground/test/model-steps.test.ts` (a created entity over two files).
- `docs/editor.md`, `docs/es/editor.md`, `CHANGELOG.md`, `docs/decisions/0053-*.md`.
