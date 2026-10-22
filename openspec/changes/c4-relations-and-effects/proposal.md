## Why

A C4 view draws the relations of its model, and the canvas treats them as untouchable: dragging
an end of an arrow answers "Relations of a view come from the model; change them there", Delete
on an arrow says the same, drawing a new arrow between two entities writes a combination the
compiler rejects when the model has no such relation, and the style strip and the Effects
section refuse every relation the model did not name with `as <id>` ("Name the relation in the
model before styling it"). That is the state of every C4 view that `meltemi-diagrams import`
makes from a Mermaid C4 diagram, since Mermaid relations have no ids, and of every view whose
model lives in another file of the project, where even the model's own fields are read-only in
the inspector. The sequence profile has the same gap: an imported Mermaid sequence diagram has
anonymous messages, and the inspector hides the Effects section for them while it names
anonymous flow relations on demand. The owner hit both on 2026-10-22: a context view over an
imported model whose arrows could not be reconnected, and imported diagrams that could not be
animated. This change makes the model editable from the view, wherever the model lives, and
makes every relation, message, note and fragment take effects and styles by naming it first, as
flow relations already do. Post-1.0 change, outside the roadmap; it builds on `c4-profile`,
`c4-editing`, `motion-editing`, `project-explorer` (multi-file edits in one undo step) and
`module-imports`.

## What Changes

- **Relations of a C4 view are edited in the model, from the canvas.** Dragging from a
  connection handle, the relation tool and "Connect to…" write `a -> b` in the model (`->` only;
  models have no dashed or two-way relations), and the new arrow is selected. Dragging an end of
  an arrow onto another entity rewrites that end of the model relation (`reconnectModelRelation`,
  new); an arrow that stands for several model relations (a combination) refuses, naming them.
  Delete removes the model relation with every statement of the project that names it, asking
  first through the existing dependents dialog, which also lists the other views that draw it.
- **Anonymous model relations are named on demand.** A style, an effect, a local label, a
  pinned end, a bend or a label position on a relation the model did not name first writes
  `as <from>_<to>` (entity paths joined with `_`) into the model relation, in the same undo step,
  and the status line says so, as it does for flow relations. The inspector shows the Style and
  Effects sections for every C4 relation. The refusals `nameRelation`, `c4Refused.setEnd` and
  `session.modelRelation` disappear.
- **A model in another file of the project is written too.** The session hands the host an
  ordered list of steps over files (the model's file, then the view's); the project plans them
  in order, so the view's step sees the id the model's step wrote, and the host applies every
  file in one undo step, as the explorer's moves already do. The theme panel's edits in another
  file use the same mechanism. The inspector's model fields (entity label, description,
  technology, external; relation label, technology, description) and the id of an entity or a
  relation become writable when the model is in another file of the project; renaming an entity
  reaches every file, as Rename Symbol does.
- **Effects on anonymous messages, notes and fragments.** In sequence diagrams the Effects
  section shows for every message, note and fragment; turning an effect on names the target
  first (`as <from>_<to>` for a message, `note1`/`alt1`-style ids for notes and fragments), in
  the same undo step.
- **The canvas offers `->` alone in C4 views.** The arrow split button and the relation tool
  show the one kind a model accepts; Shift changes nothing there. The wording of the two-way
  refusal names `->` only.
- **Documentation.** The editor guide's C4 section and its "Naming relations" note, in English
  and Spanish; the changelog's 1.10.0 section; decision 0051.

## Non-goals

- The Mermaid, PlantUML and Markdown importers keep writing anonymous relations and messages;
  the editor names them when something needs a name (`diagram-import`, `mermaid-import`).
- The hosted service's roles and the live session's guest rules decide who may write a file;
  this change writes through the same path and adds no rule of its own (`cloud-projects`,
  `live-sessions`).
- The delivery change owns the pipelines and the release of what this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `c4-editing`: `reconnectModelRelation` joins the model operations; `removeModelRelation` lists
  dependents without cascade and reaches every file of the project; view operations on an
  anonymous model relation name it in the model first; model edits are planned as ordered steps
  over the files of the project.
- `c4-editor-tools`: the C4 canvas creates, reconnects and deletes model relations and names
  anonymous ones for routes and labels; the inspector styles and animates every relation and
  writes the model's fields when the model is in another file; the hosts apply steps over files
  in one undo step.
- `motion-editing`: the Effects section shows for anonymous relations, sequence messages, notes,
  fragments and C4 model relations, naming the target first.

## Impact

- `packages/edit`: `reconnectModelRelation`, `removeModelRelation` with dependents and cascade,
  `setModelRelationProperty` reused to name relations; messages `en`/`es`; `c4.test.ts`.
- `packages/editor`: `session.ts` (`c4Action` gains `connect`, `setEnd`, `setVia`, `remove`,
  `moveLabel` and the field paths; steps for a model in another file), `targets.ts` (naming a
  model relation, messages, notes and fragments), `effects.ts`, `inspector.ts`, `c4.ts`,
  `projects.ts` (`planSteps`, `removeModelRelationInProject`), `canvas/protocol.ts`
  (`SessionResult.project` as steps), messages `en`/`es`; `session.test.ts`, `c4.test.ts`,
  `effects.test.ts`, `sequence.test.ts`, `themes.test.ts`.
- `packages/canvas`: the arrow kinds of C4 views; a webview scenario of the browser suite.
- `packages/playground` (`studio.ts` `applyProject`) and `packages/vscode`
  (`extension/canvas.ts` `applyProjectEdits`): steps over files.
- `docs/editor.md`, `docs/es/editor.md`, `CHANGELOG.md`, `docs/decisions/0051-*.md`.
