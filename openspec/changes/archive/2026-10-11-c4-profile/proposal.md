## Why

The proposal's third diagram type is the architecture model with C4 views: context, containers
and components drawn from one shared model, where an entity keeps its identity across views and
each view keeps its own composition. Today `model` blocks and `diagram <id>: c4 using <model>`
parse and are reported as `block.unsupported` and `profile.unsupported`. Roadmap change 11 asks
for the complete profile now: model blocks with nesting and qualified references, validated
views, shared identity with independent composition, local label overrides, traceable grouped
views, links from sequence and free objects to model entities, renames that reach every view, and
its editor tools.

## What Changes

- **Model blocks compile.** `model <id> { }` declares entities and relations:
  - `person`, `system`, `container`, `datastore` and `component`, each `<kind> <id> ["Label"]
    [{ … }]`, with `description`, `technology` and `external` in their blocks;
  - nesting: systems hold containers and datastores, containers hold components;
  - relations `a -> b: "Label" as id { technology "…"; description "…" }` anywhere in the model,
    with qualified references (`shop.api`) resolved from the innermost enclosing entity outwards,
    independent of declaration and file order;
  - `model.*` diagnostics for misplaced kinds, unknown entities and invalid relations.
- **C4 views compile.** `diagram <id>: c4 using <model> { }` with:
  - `level context|container|component` and `scope <entity>`, validated against each other;
  - `include` and `exclude` lists of qualified entities, validated against the level and scope,
    with a documented default set when `include` is absent;
  - `label <entity-or-relation> "Text"`: a local label that never renames the entity;
  - relations derived from the model: relations between hidden descendants are lifted to their
    visible ancestors, each drawn arrow keeps the model relations it stands for, and arrows are
    combined only by an explicit relation statement of the view, which must stand for at least one
    model relation;
  - `title`, `description`, `direction`, `layout`, `routing`, `theme`, `preset`, `canvas`,
    `placement`, `style`, `class`, `rule` and `animate`, with qualified targets.
  - `c4.*` diagnostics for levels, scopes, entities out of level and unsupported relations.
- **Shared identity across files.** A view may use a model of its file or an imported one
  (`using commerce`, `using models.commerce`). The project compiles views against imported models,
  so validation, export and the editor see the same view everywhere.
- **Drawing.** C4 views use the flow layout (ELK and every mode) with C4 shapes: persons, software
  systems, containers, datastores and components with a type line (`[Container: React]`) and
  description, external systems in grey, the scope as a dashed boundary, and relation labels with
  their technology.
- **Links to the model.** `link <model>.<entity path>` in sequence and free diagrams (and through
  imports) ties an object to a model entity; an object without its own label takes the entity's
  label, and hover and the inspector show the entity's metadata. Structure never becomes a
  sequence by itself.
- **Renames reach every view.** Renaming an entity rewrites its declaration, model relations,
  every view's references and every link, in the file and, in the editor, across the project.
- **Editing.** New edit operations for the model (create, rename, remove, set properties of
  entities and relations) and for views (include, exclude, local labels); view placement, styles
  and arrange work with qualified ids.
- **Editor tools.** Language services for models and views (completion of kinds, levels, scopes
  and allowed entities; hover with entity metadata; definition, references and rename across views
  and links; quick fixes), the canvas for C4 views (an "add from the model" picker, drag and the
  layout modes, removal that excludes, an inspector with the entity's fields and the local label)
  and project-wide rename in VS Code.
- **CLI.** `validate` and `export` handle models and views; `layout` arranges views.
- **Gating.** `c4` is no longer parse-only; `profile.unsupported` disappears with it. `story` and
  `export` blocks stay parse-only until their changes.

## Capabilities

### New Capabilities

- `architecture-model`: model blocks, entities, nesting, relations, qualified references and their
  diagnostics; JSON.
- `c4-views`: levels, scopes, include and exclude, defaults, local labels, derived and combined
  relations with traceability, imported models, and links from other profiles to entities.
- `c4-layout`: drawing of C4 elements, boundaries and relations on the flow layout.
- `c4-editing`: model and view edit operations and renames across views.
- `c4-editor-tools`: language services, canvas, inspector and project-wide rename.

### Modified Capabilities

- `flow-diagram-model`: profile gating no longer rejects `c4`; `model` blocks compile.

## Impact

- `@meltemi/diagrams-model`: `models` in the document, `analyzeModel`, `analyzeC4View`, compile
  options with a model resolver, links to models, JSON.
- `@meltemi/diagrams-project`: views and links resolved against imported models; cross-file rename
  plans.
- `@meltemi/diagrams-layout`, `@meltemi/diagrams-render`: C4 element kinds and boundaries.
- `@meltemi/diagrams-edit`, `@meltemi/diagrams-editor`, `packages/vscode`, `@meltemi/diagrams-cli`.
- Corpus, docs (`docs/language/c4.md`, decision 0020), the skill.
