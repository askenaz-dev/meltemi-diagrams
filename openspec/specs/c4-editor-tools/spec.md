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
On a C4 view the render SHALL carry `profile: "c4"`. The palette SHALL offer one tool per entity kind the view's level allows (Person and System on a context view; Container, Datastore, Person and System on a container view; Component, Person and System on a component view) and "Add from the model…", listing allowed entities that are not drawn, which includes the chosen entity at the drop point. A click or a drop of an entity tool SHALL plan `createEntity` in the model with a fresh `<kind><n>` id and an empty label, inside the view's scope for a container, a datastore or a component and at the model's root otherwise, then `includeEntity` when the view would not draw it, then `setPosition` at the drop point in assisted and manual mode, in one plan; the new element SHALL be selected and its label editor opened. Paste and Duplicate SHALL declare copies of the copied entities the same way (same kind, parent, label, technology, description and `external`; ids `<id>_2`, `<id>_3`…; no relations), offset as flow paste is. Delete SHALL exclude elements. Dragging, the layout modes and Arrange SHALL write the view's placement only. Relations SHALL be edited in the model: dragging from a connection handle, the relation tool and the context menu's **Connect to…** SHALL plan `createModelRelation` from the source entity to the target (`->`; the arrow split button and the relation tool SHALL offer no other kind on C4 views, Shift SHALL change nothing, and a two-way request SHALL be refused saying relations of C4 views go one way, `->`), with an id and the view's `route` when an end is pinned, and SHALL select the new relation; dropping an end of a drawn relation that stands for one model relation onto another entity SHALL plan `reconnectModelRelation` for that end, with the dropped port, so the view's existing `route` is rewritten in the same operation and never planned against; dropping it on a point or a port of the same entity, dragging a bend or a midpoint, and moving its label SHALL name the model relation first when it has no id and write the view's `route` or placement; Delete on such a relation SHALL plan `removeModelRelation` without cascade and, when it is refused with dependents, SHALL list them in the dialog (the statements that name the relation and the other views that draw it) and cascade after confirmation. A combination SHALL refuse reconnecting, naming the model relations it stands for, SHALL be named `as <from>_<to>` in the view's statement when a route, a bend or a label position needs an id, and SHALL be removed from the view as today. A label typed on a drawn relation SHALL be written as the model relation's label when that relation has none, and as the view's local label otherwise; a label typed on an entity whose model label is empty (one just created) SHALL be written as the entity's label in the model. Moving an element into another system or container SHALL be refused with the advice to move the entity in the model's text. When the model is in another file of the project, every one of these edits SHALL reach the host as steps over files and SHALL be applied, with the view's own statements, in one undo step; the status line SHALL name the model's file.

#### Scenario: Add from the model
- **WHEN** `bank` is chosen in "Add from the model…" on a container view
- **THEN** `bank` joins `include` and the canvas shows it

#### Scenario: A container from the palette
- **WHEN** the Container tool of the `containers` view of the C4 template (scope `product`, no `include`) is clicked at (640, 300)
- **THEN** `models/system.meltemi` gains `container container1 ""` after `datastore db` inside `product`, the view draws it at the click with its label editor open, the status line names the model's file, and one undo step removes it

#### Scenario: A person on a container view with an include list
- **WHEN** the Person tool is dropped on a container view that has `include shop.web, shop.api`
- **THEN** the model gains `person person1 ""` at its root, the view's `include` gains `person1`, and in `layout manual` the view gains `place person1 at (…)` at the drop

#### Scenario: Paste a container
- **WHEN** `shop.web` is copied and pasted on the `containers` view
- **THEN** the model gains `container web_2 "Web app" { technology "TypeScript" }` inside `shop`, the view draws it offset from `shop.web`, and no relation of `shop.web` is copied

#### Scenario: A kind the level does not draw
- **WHEN** a component view's palette is read
- **THEN** it offers Component, Person and System and no Container tool, and a `create` action carrying `container` is refused with `edit.invalid-value` naming the kinds the level draws

#### Scenario: Draw a relation
- **WHEN** a connection is dragged from `customer` to `bank` on the context view of the commerce file
- **THEN** the model gains `customer -> bank`, the view draws it and the new relation is selected

#### Scenario: Reconnect an end
- **WHEN** the end at `shop` of the drawn relation standing for `customer -> shop.web: "Compra" as visit` is dropped on `bank` on the context view
- **THEN** the model statement reads `customer -> bank: "Compra" as visit` and the arrow goes from `customer` to `bank`

#### Scenario: Reconnect twice after Recompute layout
- **WHEN** Recompute layout has written `route uses from user to product.web via [(…)]` in the `layout auto` container view of the C4 template, the `to` end of `uses` is dropped on `product.api` and then on `product.db`
- **THEN** each drop rewrites the model statement and the route's end together, the canvas keeps editing, and no status line says a `route` statement is invalid

#### Scenario: A drop in the middle of a box keeps the view valid
- **WHEN** the `to` end of a routed relation is dropped in the middle of `bank`, without a port
- **THEN** the route's `to` end becomes `bank`, the view compiles without `placement.route-mismatch` and the canvas is not blocked

#### Scenario: Reconnecting a combination is refused
- **WHEN** an end of the combination `uses` of the view `components` (`shop.web -> shop.api.orders: "Usa" as uses`) is dropped on `shop.api.payments`
- **THEN** the drop is refused with a reason naming the model relations the combination stands for, and the text is unchanged

#### Scenario: Delete a relation drawn elsewhere
- **WHEN** Delete is pressed on the drawn relation `visit` of the context view, which the view `containers` also draws
- **THEN** the dialog lists "drawn in `containers`", and confirming removes the model relation and the view statements that named it in one undo step

#### Scenario: A relation of a model in another file
- **WHEN** an end of a relation is reconnected on a view whose model is imported from `models/commerce.meltemi`
- **THEN** the host writes the model's file, the view redraws the arrow, the status line names `models/commerce.meltemi`, and Ctrl+Z from the view's file brings the arrow back

#### Scenario: Connect to… in the context menu
- **WHEN** the context menu of `customer` is opened on a C4 view
- **THEN** its entry reads **Connect to…** ("Conectar con…" in Spanish), and choosing `bank` writes `customer -> bank` in the model

### Requirement: C4 inspector
The inspector SHALL show for an element its kind and path, the local label, and the entity's label, description, technology and `external`; for a relation its local label, the model label and technology, and its sources, followed by the Style and Effects sections whatever the relation's id, a style or an effect on a relation without an id naming the model relation first (`<from>_<to>` from the entity paths) in the same edit, and on a combination without an id naming it in the view's own statement (`as <from>_<to>` from the drawn ends' paths, free in the model, its file and the view's file) in the same edit, with the status line saying so; for the view its level, scope, model, title, theme, direction, layout and routing. Entity and relation fields of the model, and the id of an entity or a relation, SHALL write into the model when it is in the same file, and SHALL write into the model's file through steps over files, applied in one undo step, when it is in another file of the project, with the model's file named under the fields and "Open the model" still offered. A rename SHALL reach every file of the project that resolves the model.

#### Scenario: Edit a technology
- **WHEN** `technology` of `shop.web` is set to `Vue` in the inspector of a view whose model is in the same file
- **THEN** the model's `container web` block reads `technology "Vue"`

#### Scenario: Flow particles on an anonymous relation of an imported Mermaid C4 diagram
- **WHEN** the drawn relation standing for `customerA -> SystemAA: "Uses"` is selected on the imported context view and Flow particles is turned on
- **THEN** the model statement reads `customerA -> SystemAA: "Uses" as customerA_SystemAA`, the view gains `animate customerA_SystemAA { effect flow }`, both in one undo step, and the status line says the relation was named

#### Scenario: A width on an anonymous combination
- **WHEN** the combination `shop.web -> shop.api` of the view `components`, written without `as`, is selected and its width is set to 2
- **THEN** the view's statement becomes `shop.web -> shop.api as shop_web_shop_api` with `style shop_web_shop_api { width 2 }`, in one undo step, and the status line says the combination was named

#### Scenario: A model field written in another file
- **WHEN** `technology` of `shop.web` is set to `Vue` on a view whose model is imported from `models/commerce.meltemi`
- **THEN** `models/commerce.meltemi` gains `technology "Vue"` in the `container web` block and the view redraws the type line

#### Scenario: An id in use is refused
- **WHEN** the id of a relation is set in the inspector to an id another relation of the model has
- **THEN** the edit is refused with the reason of `edit.id-conflict` and nothing is written

#### Scenario: A combination's fresh id avoids the model's ids
- **WHEN** the model already has a relation `as shop_web_shop_api` and a style is set on the anonymous combination `shop.web -> shop.api`
- **THEN** the combination is named `shop_web_shop_api_2` and the style names that id

### Requirement: Project-wide rename in VS Code
VS Code SHALL rename a model entity in the model's file and in every file of the project that resolves the model, as one workspace edit.

#### Scenario: Rename across files
- **WHEN** `shop.api` is renamed in a view of `diagrams/containers.meltemi` whose model is in `models/commerce.meltemi`
- **THEN** both files are edited and compile without errors

