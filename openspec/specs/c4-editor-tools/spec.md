# c4-editor-tools Specification

## Purpose
The language services, canvas, inspector and project-wide rename for models and C4 views in the editor.
## Requirements
### Requirement: Language services for models and views
Completion SHALL offer entity kinds allowed at the cursor's nesting, entity block properties, entity paths for relation endpoints, levels, scopes valid for the level, entities allowed by level and scope in `include` and `exclude`, models after `using`, and model paths after `link`. Hover SHALL show an entity's kind, path, technology, description and the views of the file that draw it. Definition and references SHALL lead from views and links to the model. Rename SHALL reach every view and link. Quick fixes SHALL remove an entity reported `c4.out-of-level`, add the scope for `c4.scope-required`, and offer close entity paths for `ref.unknown-entity`.

#### Scenario: Include completion
- **WHEN** completion runs after `include ` in a container view of `shop`
- **THEN** the items are the containers and datastores of `shop`, the persons and the other systems, without `shop.api.orders`

#### Scenario: Definition from a view
- **WHEN** go to definition runs on `api` in `include shop.api`
- **THEN** it leads to `container api` in the model

### Requirement: C4 canvas
On a C4 view the render SHALL carry `profile: "c4"`. The palette SHALL offer "Add from the model…", listing allowed entities that are not drawn, which includes the chosen entity at the drop point. Delete SHALL exclude elements. Dragging, the layout modes and Arrange SHALL write the view's placement only.

#### Scenario: Add from the model
- **WHEN** `bank` is chosen in "Add from the model…" on a container view
- **THEN** `bank` joins `include` and the canvas shows it

### Requirement: C4 inspector
The inspector SHALL show for an element its kind and path, the local label, and the entity's label, description, technology and `external`; for a relation its local label, the model label and technology, and its sources; for the view its level, scope, model, title, theme, direction, layout and routing. Entity fields SHALL write into the model when it is in the same file and SHALL be read-only otherwise, with "Open the model".

#### Scenario: Edit a technology
- **WHEN** `technology` of `shop.web` is set to `Vue` in the inspector of a view whose model is in the same file
- **THEN** the model's `container web` block reads `technology "Vue"`

### Requirement: Project-wide rename in VS Code
VS Code SHALL rename a model entity in the model's file and in every file of the project that resolves the model, as one workspace edit.

#### Scenario: Rename across files
- **WHEN** `shop.api` is renamed in a view of `diagrams/containers.meltemi` whose model is in `models/commerce.meltemi`
- **THEN** both files are edited and compile without errors

