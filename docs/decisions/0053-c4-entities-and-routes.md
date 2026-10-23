# 0053. Entities are declared from a C4 view, and routes follow a moved end

Status: accepted (c4-entities-and-routes change, 22 October 2026). Extends decisions 0020 and 0051.

## Context

Decision 0051 made the relations of a C4 view editable in the model from the canvas, but the
canvas still could not add an entity: the palette of a C4 view had no tools, a click answered
"Views draw the entities of the model: add one with “Add from the model…”, or declare it in the
model", paste and Duplicate were refused, and "Add from the model…" offered nothing in the C4
template, whose views draw every allowed entity already. The owner put it as having to program
the diagram by hand, which is what Meltemi exists to spare. The same review found a bug:
`reconnectModelRelation` rewrote the model statement only, so the `route <id>` statements that
Arrange writes in a view kept the old end; the view then reported `placement.route-mismatch`,
which leaves it without a layout, and the next drop on a port answered "The `route` statement for
`uses` on line 25 is invalid; fix it before editing visually". Combinations without an id were
the last refusal asking for text (`Name the combination in the view (as <id>) before styling it`).

## Decision

- **The palette offers the kinds the level draws.** Context views: Person, Software system;
  container views: Container, Data store, Person, Software system; component views: Component,
  Person, Software system. The session sends them as the render's `tools`; the canvas draws a
  figure for persons and a cylinder for data stores.
- **A created entity is declared where the level puts it.** `createEntity` with a fresh
  `<kind><n>` id and an empty label, inside the view's scope for containers, data stores and
  components and at the model's root for persons and systems; then `includeEntity` (nothing when
  the view draws it by default) and `setPosition` at the drop. The new element is selected and its
  label editor opens; a label typed on an entity the model leaves empty is the model's label.
  When the model is in another file, the operations go as steps over files (decision 0051).
- **Copies, not references.** Copying from a C4 view writes a `model clipboard` block with the
  entities (kind, id, label, technology, description, `external`; containers and components in
  holder entities so the block compiles) and a free diagram with their positions. Paste and
  Duplicate declare copies under `<id>` or `<id>_2`, `_3`…, include and place them; relations are
  not copied.
- **Routes follow a moved end, in one operation.** `reconnectModelRelation` rewrites, in the same
  edit, the moved end of every `route <id>` of the file's views to the entity the view now draws
  (lifted), carrying a compass side over and dropping a point; a view that stops drawing the
  relation loses its route; the dropped port and point of the edited view are written there
  (`view`, `port`, `position`). `rewriteRouteEnd` does the same in the views of other files, and
  `ProjectSessions.planSteps` adds it after a reconnect, then compiles every file whose views
  resolve a written model and refuses the whole plan at the first new error.
- **Combinations are named on demand.** A style, an effect, a route or a label on a combination
  without an id first writes `as <from>_<to>` in the view's statement (`materializeRelationId`,
  which a C4 view accepts for its combinations only).

## Alternatives considered

- **A single "Entity…" tool that asks the kind**: one more step for every box.
- **Offering every kind and refusing the ones the level does not draw**: a tool that answers
  "cannot" is worse than none.
- **`setRoute` after the model's step**, as before: the compilation between the steps already
  holds the mismatch, which is the bug.
- **Removing every route of a moved relation**: loses the bends the person drew.
- **Copying an entity's relations with it**: a pasted container would at once relate to everything
  the original relates to.

## Consequences

- No action on a C4 view asks the person to type in the model's text, except moving an entity to
  another system or container.
- A move that would leave a view of another file with an error (a combination that stands for
  nothing, say) is refused with that view's reason, and nothing is written.
- New public surface: the edit operation `rewriteRouteEnd`, `reconnectModelRelation`'s `view`,
  `port` and `position`, the editor's `allowedKinds`, `entityParent`, `freshEntityPath`,
  `entityClipboard`, `copiedEntities` and `pasteEntities`, the words `c4.tools` and
  `c4.kindNotDrawn`; `c4Refused.create`, `paste`, `duplicate` and `c4.nameCombination` are gone.
  The language stays 0.2.
