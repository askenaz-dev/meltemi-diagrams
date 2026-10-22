# 0020. Models and C4 views

Status: accepted (c4-profile change, 11 October 2026)

## Context

The proposal's architecture model represents context, containers and components from one shared
model. An entity keeps its identity between views; each view keeps its own composition; level and
scope are validated explicitly; `datastore` specialises a container; qualified references
(`shop.api`) resolve nested entities regardless of file order. Renaming an entity updates every
appearance, moving a box affects one view, a local label never renames. Grouped views keep
traceability to the original elements and relations, add no arrows for convenience, and never
collapse relations with incompatible meanings without an explicit rule. Sequence and free objects
may link to model entities, reusing identity and metadata.

## Decision

- **A separate model, shared views.** `model` blocks compile into `document.models`: entities with
  paths, kinds, labels, descriptions, technologies and `external`, nested by kind, and relations
  between paths resolved after the whole model is read, from the enclosing entity outwards. A view
  is a diagram of `type: "c4"` in the shared `FlowDiagram` structure whose elements are entities
  (ids are paths) and whose relations come from the model, so placement, styles, the flow layout,
  ELK, Arrange, the canvas and the inspector work on views unchanged.
- **Levels as allowed sets.** Each level and scope define the entities a view may draw and a default
  set (the scope's children and their neighbours); `include`, `exclude` and the scope are checked
  against them. The scope of a container or component view is drawn as a boundary group.
- **Lifted relations with sources.** Each end of a model relation is drawn at its nearest drawn
  ancestor; drawn relations keep the model keys they stand for (`sources`) and whether they were
  lifted (`derived`). Several relations between the same drawn pair stay several arrows unless the
  view writes a combination, which must stand for at least one model relation.
- **Local labels are view statements.** `label <target> "Text"` in the view replaces the text there;
  the model keeps its label.
- **Imported models through compile options.** `compile(text, { models })` resolves imported names;
  the project recompiles files whose views or links name imported models, and the compilation
  keeps its options so edits verify against the same models. Without a resolver such views stay
  silent and undrawn.
- **Entity references for renames.** Every token that names an entity (declarations, endpoints,
  view statements, links) is an `EntityReference` with its path. Renaming replaces the tokens of one
  path, in the file (`renameEntity`) or across the project (`renameEntityInProject`, used by VS
  Code's Rename Symbol).
- **C4 drawing on the flow layout.** Persons, boxes with a type line, cylinders, external grey and
  a dashed boundary; colours come from built-in classes on theme tokens applied before the view's
  styles; relation labels show their technology. The engine now leaves room for relation labels,
  for every flow diagram.

## Alternatives considered

- **A separate view model and layout.** C4 views are graphs with boxes and groups; the flow
  pipeline already lays them out, with every mode and the editor.
- **Implicit merging of parallel relations.** It would collapse relations with different meanings;
  the proposal asks for an explicit rule.
- **Positions in the model.** Each view keeps its own composition; the model holds identity only.
- **Model ids in element ids (`commerce.shop.api`).** Paths within the model are enough, since a view
  uses one model, and keep placement statements short.

## Consequences

- Views get validation, export, completion, hover, navigation across files, renames, quick fixes,
  the canvas with "Add from the model…", the inspector and `meltemi-diagrams layout`.
- Every diagram profile of the proposal compiles; `profile.unsupported` is gone. `story` and
  `export` blocks remain parse-only until their changes.
- The importers (change 12) map Mermaid `C4*` and C4-PlantUML onto models and views.
- The canvas edits the model's relations from a view, naming anonymous ones on demand and reaching
  a model in another file ([decision 0051](0051-c4-relations-from-the-canvas.md)).
