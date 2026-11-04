# 0051. Relations of C4 views are edited in the model, from the canvas

Status: accepted (c4-relations-and-effects change, 22 October 2026). Extends decision 0020.

## Context

A C4 view draws the relations of its model (decision 0020): each arrow keeps the model relation's
key, id, label and technology, lifted to the entities the view draws, or is a combination written
in the view. The canvas treated those arrows as untouchable: dragging an end answered "Relations
of a view come from the model; change them there", Delete said the same, a connection drawn
between two entities wrote a combination the compiler rejected when the model had no relation
behind it, and the style strip and the Effects section refused every relation the model had not
named with `as <id>`. That was the state of every view the Mermaid C4 import makes, since Mermaid
relations have no ids, and of every view whose model lives in another file of the project, where
the model's fields were read-only too. Sequence diagrams had the same gap for the messages, notes
and fragments an import leaves anonymous. The owner hit both on 2026-10-22.

## Decision

- **The model is where a relation is edited, and the canvas writes it there.** A connection in a
  view plans `createModelRelation` (`->`, the one kind a model accepts; Shift changes nothing).
  Dropping an end of an arrow that stands for one model relation onto another entity plans the
  new `reconnectModelRelation`, which rewrites that end with the entity's path from the root and
  keeps the id, label and block; a combination refuses, naming the relations it stands for. Delete
  plans `removeModelRelation`, which lists as dependents the statements that name the relation,
  the other views that draw it and the entities a view drew for that relation alone (they leave
  the default set with their statements), and removes it all after confirmation.
- **Anonymous model relations are named on demand.** A style, an effect, a route, a bend, a
  label position or a local label on a relation without an id first writes
  `setModelRelationProperty { property: "id" }` with `<from>_<to>` from the entity paths
  (`shop_api_bank`), in the same undo step, and the status line says so; the inspector shows the
  Style and Effects sections for every relation. A label typed on an arrow fills the model
  relation's label when it has none, and is the view's local label otherwise.
- **A model in another file is written through steps over files.** The session hands the host
  `project: { kind: "files", steps }`: the model's operations first, then the view's. The project
  plans them in order (`ProjectSessions.planSteps`), with each planned text standing as that
  file's content for the steps that follow, so the view's statements resolve the id the model's
  step wrote; a rename of an entity reaches every file, a renamed relation is renamed in other
  files' views, and a removed relation goes out of other files' views first, each asked what it
  loses so one dialog lists everything. The hosts apply the edits of every file in one undo step.
  The theme panel's edits in another file use the same mechanism.
- **Sequence targets are named the same way.** An effect on an anonymous message names it with
  `as <from>_<to>`; on an anonymous note or fragment, with `renameEvent` and `note1`, `alt1`…

## Alternatives considered

- **Combinations in the view as the handle of a model relation.** Single-file, but a combination
  has its own label and technology (none unless written), so the arrow would lose "Uses" and
  `[SMTP]` unless the language learnt to inherit them, and two model relations of one pair would
  merge into one arrow.
- **Keeping the relations read-only.** It sends people to the model's text for every arrow an
  import wrote, which is every arrow.
- **Returning a plan and a project edit together, applied separately.** Two undo steps, and the
  view's statement would be planned against a compilation that does not know the id yet, so it
  would be refused.
- **Having the host apply the model's step, wait for the analysis and ask the session again.**
  Asynchronous in both hosts and two undo steps in the playground.

## Consequences

- Every arrow of a C4 view, imported or hand-written, local or in another file, can be
  reconnected, deleted, created, styled, animated, routed and labelled from the canvas.
- Deleting a relation can make an entity leave a view's default set; the dialog says so and the
  entity's statements go with it, so the view never keeps a dangling `place`.
- `removeModelRelation` takes `cascade`; `forgetModelRelation` and `reconnectModelRelation` join
  the edit operations; `defaultEntities` joins the model package; `SessionResult.project` carries
  steps over files instead of a theme file.
- Entities created from the view and routes that follow a moved end came with
  [decision 0053](0053-c4-entities-and-routes.md).
