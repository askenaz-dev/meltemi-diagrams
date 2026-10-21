## Context

- **Shared pipeline.** Flow, free and sequence diagrams compile into the shared `FlowDiagram`
  structure, are laid out by the flow pipeline (ELK and the three modes) or a specialised layout,
  and share the edit operations, the language services and the canvas (decisions 0018, 0019).
- **What parses today.** `model <id> { }` and `diagram <id>: c4 using <ref> { level …; scope …;
  include … }` parse; the proposal's example is `corpus/parse-only/commerce.meltemi`.
- **The proposal's rules.**
  - An entity keeps its identity between views; each view keeps its own composition.
  - Level and scope are validated explicitly.
  - `datastore` specialises a container; qualified references (`shop.api`) resolve nested
    entities without depending on the order files are loaded.
  - Renaming an entity updates every appearance; moving a box affects only its view; a local label
    overrides the visible text without renaming.
  - A view that groups services keeps traceability to the original entities and relations; no
    arrow is added for visual convenience, and relations with incompatible meanings are never
    collapsed without an explicit rule.
  - Sequence and free objects may link to model entities, reusing identity and metadata; a
    structural relation never becomes a sequence by itself.
- **Projects.** Models usually live in `models/` and views in `diagrams/`; imports are relative with
  explicit namespaces (change 3).

## Goals / Non-Goals

**Goals:** the model language, validated views at three levels, derived relations with
traceability, imported models, links from other profiles, renames across views and files, C4
drawing on the flow layout, edit operations and editor tools.

**Non-Goals:** deployment views and dynamic views (not in the proposal); importing C4 from Mermaid
or PlantUML (change 12); animation of views (changes 13 to 15).

## Decisions

### D1. The model language

```text
model commerce {
  person customer "Cliente" { description "Compra en línea" }
  system shop "Commerce" {
    container web "Web" { technology "React" }
    container api "API" {
      technology "Kotlin"
      component orders "Orders"
    }
    datastore db "Pedidos" { technology "PostgreSQL" }
    api -> db: "SQL" as persist      // relative to shop
  }
  system bank "Banco" { external }

  customer -> shop.web: "Compra" as visit
  shop.web -> shop.api: "HTTPS" as request { technology "JSON/HTTPS" }
}
```

- **Entities.** `<kind> <id> ["Label"] [{ … }]`. The label defaults to the id. Blocks take
  `description "…"`, `technology "…"`, `external` (persons and systems) and child entities.
- **Nesting.** Persons and systems at the model's root; containers and datastores in systems;
  components in containers. Anything else is `model.invalid-nesting`.
- **Paths.** An entity's path joins the ids from the root (`shop.api.orders`). Sibling ids are
  unique (`ref.duplicate-id`).
- **Relations.** At the model's root or inside an entity block. Endpoints resolve from the innermost enclosing entity outwards, then from the root;
  the whole model is declared before any endpoint resolves, so order never matters. Ids are unique
  per model. Relation blocks take `technology` and `description`. A relation from an entity to
  itself or between an entity and its ancestor is `model.invalid-relation`; an unknown endpoint is
  `ref.unknown-entity` with the closest paths as hints.
- **Document.** `document.models: ModelDefinition[]` with `entities` (in order, with `path`,
  `parent`, `kind`, `label`, `description`, `technology`, `external`, ranges), `entitiesByPath`,
  `relations` (`key` as in flow relations, with paths), and `references` (every entity token with
  its path, for navigation and rename). Model ids share the file namespace with diagrams and
  themes.

### D2. Views

`diagram <id>: c4 using <model> { … }` compiles into the shared `FlowDiagram` with `type: "c4"`
and a `c4` section (`model`, `level`, `scope`, `includes`, `excludes`, `labels`).

| Level       | Scope                    | Allowed entities                                                                     | Default when `include` is absent                         |
| ----------- | ------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `context`   | optional, a system       | persons, systems                                                                     | all; with a scope, the scope and the entities it relates to |
| `container` | required, a system       | the scope's containers and datastores, persons, other systems                        | the scope's children and the entities they relate to     |
| `component` | required, a container    | the scope's components, other containers and datastores of its system, persons, other systems | the scope's children and the entities they relate to |

- **Elements.** Element ids are entity paths; kinds are `person`, `system`, `container`,
  `datastore`, `component`. The scope of a container or component view is drawn as a boundary: an
  element of kind `group` with the scope's path, holding the included children. Elements carry
  `entity` (model and path), `technology` and `external`.
- **Lists.** `include` and `exclude` take qualified entities. An entity outside the level or scope
  is `c4.out-of-level`; the scope itself in `include` too, with a hint that it is the boundary.
  `exclude` removes from the default set or from `include`.
- **Diagnostics.** `c4.invalid-level`, `c4.scope-required`, `c4.invalid-scope`,
  `c4.out-of-level`, `c4.unsupported-relation`, `ref.unknown-model`, `ref.unknown-entity`.
- **Local labels.** `label <entity> "Text"` and `label <relation> "Text"` replace the visible text
  in this view only. In `placement`, `label <relation> at …` keeps its meaning.
- **Composition.** `placement`, `style`, `class`, `rule` and `animate` are per view, with
  qualified targets (`place shop.api at (…)`, `route request from shop.web.east to shop.api`). The
  model holds no positions.
- **Source locations.** An element's `idToken` is its token in the `include` list, else its
  declaration when the model is in the same file, else the `using` reference; elements keep the
  model's order.

### D3. Relations in views

- **Lifting.** Each end of a model relation is drawn at its nearest visible ancestor-or-self. A
  relation whose ends meet at one element, or that has an end without a visible ancestor, is not
  drawn.
- **Traceability.** Every drawn relation carries `sources` (the model relation keys it stands for)
  and `derived` (true when an end was lifted). Direct and lifted relations keep the model relation's
  key, so styles and routes name them by their model id.
- **No implicit merging.** Several model relations lifted to the same pair stay several arrows.
- **Explicit combination.** A relation statement in the view, `customer -> shop: "Uses" as uses`,
  draws one arrow standing for every model relation whose visible ends are that ordered pair, and
  replaces them in the drawing. When no model relation has those ends it is
  `c4.unsupported-relation`: no arrow is drawn for visual convenience.

### D4. Imported models

- **Compile options.** `compile(text, { models })` takes a resolver from a name written in
  `using` or a link to a `ResolvedModel` (`definition`, the model's `file`). Local models win;
  names whose first part is an import binding are left silent without a resolver.
- **Projects.** `buildProgram` recompiles a file with a resolver over its imports when one of its
  views or links names an imported model, before the project checks run. `Compilation.options`
  keeps the resolver, so edit plans verify against the same models.
- **Unknown names.** A `using` name that is neither local nor imported is `ref.unknown-model` from
  compile; an imported name that does not resolve to a model is reported by the project.

### D5. Links to model entities

- **Grammar.** `link <block>.<rest>`: when `<block>` is a model (local, member import, or
  `<namespace>.<model>`), `<rest>` is an entity path; otherwise it is a diagram and its element as
  before (decision 0018).
- **Metadata.** An object that writes no label shows the entity's label; hover and the inspector
  show kind, technology and description. Nothing else is copied, and no relation follows.
- **Checks.** Unknown entities are `ref.unknown-link`; same-file links in compile, imported ones
  in the project.

### D6. Drawing

- **Layout.** C4 views use the flow pipeline (ELK, `auto`/`assisted`/`manual`, constraints, ports,
  routing, composition checks), with default sizes per kind.
- **Shapes.**
  - Person: a head above a rounded body box.
  - System, container and component: boxes with the label, a type line (`[Software System]`,
    `[Container: React]`, `[Component: Kotlin]`) and the description.
  - Datastore: a cylinder with `[Container: PostgreSQL]`.
  - External entities: muted, dashed.
  - Boundary: a dashed band titled with the scope's label and type.
- **Colours.** Built-in classes `c4_person`, `c4_system`, `c4_container`, `c4_component` and
  `c4_external` from theme tokens, applied before the view's own classes and styles, so themes,
  rules and styles still win.
- **Relations.** The label with `[technology]` as a second line.

### D7. Editing

- **Model operations.** `createEntity`, `renameEntity`, `removeEntity` (dependents: child
  entities, model relations, view references and links), `setEntityProperty` (`label`,
  `description`, `technology`, `external`), `createModelRelation`, `removeModelRelation`,
  `setModelRelationProperty` (`label`, `technology`, `description`, `id`).
- **View operations.** `includeEntity`, `excludeEntity`, `setLocalLabel`; `setPosition`,
  `setSize`, `setRoute`, `setLabelAnchor`, constraints, `arrange`, styles and animations with
  qualified ids; `setDiagramProperty` with `level` and `scope`.
- **Refusals.** In a view, operations that would write elements or relations into the view
  (`createElement`, `createRelation` except combinations, `setElementLabel`, `renameElement`,
  `removeElement`, `reconnectRelation`, …) are refused with `edit.invalid-value` naming the model
  and view operations; `removeElement` maps to `excludeEntity` in the canvas.
- **Renames.** `renameEntity` rewrites the declaration, model relations, every view reference and
  every link of the file. Across files, `@meltemi/diagrams-project` plans one rename per file of
  the project that resolves the model, and VS Code applies them as one workspace edit.

### D8. Editor tools

- **Language services.**
  - Completion: model kinds and block properties by nesting, endpoint paths, levels, scopes and
    allowed entities by level, models after `using`, model paths in `link`.
  - Hover: entity kind, path, technology, description and the views that draw it.
  - Definition and references: from views and links to the model, across files in the project.
  - Rename: across views and links.
  - Quick fixes: remove an entity out of level, declare a missing scope, close entity names.
- **Canvas.**
  - The palette offers "Add from the model…", a list of allowed entities not drawn yet.
  - Delete excludes; dragging and the layout modes write the view's placement.
  - The inspector shows the local label, the entity's fields (written into the model when it is in
    the same file, read-only with "Open the model" otherwise) and a relation's sources.
- **VS Code.** Rename across the project; "Open the model" command.

## Risks / Trade-offs

- [Recompiling files with imported models in every program build] → Only files whose views or
  links name an imported model are recompiled, against the already compiled imports.
- [Elements of imported models have no token in the view] → The `include` token or the `using`
  reference stands in, so navigation still lands in the view.
- [Many parallel lifted arrows] → Correct by the proposal's rule; one combination statement makes
  them one arrow with full traceability.
