## MODIFIED Requirements

### Requirement: C4 canvas
On a C4 view the render SHALL carry `profile: "c4"`. The palette SHALL offer "Add from the model…", listing allowed entities that are not drawn, which includes the chosen entity at the drop point. Delete SHALL exclude elements. Dragging, the layout modes and Arrange SHALL write the view's placement only. Relations SHALL be edited in the model: dragging from a connection handle, the relation tool and "Connect to…" SHALL plan `createModelRelation` from the source entity to the target (`->`; the arrow split button and the relation tool SHALL offer no other kind on C4 views, Shift SHALL change nothing, and a two-way request SHALL be refused saying relations of C4 views go one way), with an id and the view's `route` when an end is pinned, and SHALL select the new relation; dropping an end of a drawn relation that stands for one model relation onto another entity SHALL plan `reconnectModelRelation` for that end; dropping it on a point or a port of the same entity, dragging a bend or a midpoint, and moving its label SHALL name the model relation first when it has no id and write the view's `route` or placement; Delete on such a relation SHALL plan `removeModelRelation` without cascade and, when it is refused with dependents, SHALL list them in the dialog (the statements that name the relation and the other views that draw it) and cascade after confirmation. A combination SHALL refuse reconnecting, naming the model relations it stands for, and SHALL be removed from the view as today. A label typed on a drawn relation SHALL be written as the model relation's label when that relation has none, and as the view's local label otherwise. When the model is in another file of the project, every one of these edits SHALL reach the host as steps over files and SHALL be applied, with the view's own statements, in one undo step; the status line SHALL name the model's file.

#### Scenario: Add from the model
- **WHEN** `bank` is chosen in "Add from the model…" on a container view
- **THEN** `bank` joins `include` and the canvas shows it

#### Scenario: Draw a relation
- **WHEN** a connection is dragged from `customer` to `bank` on the context view of the commerce file
- **THEN** the model gains `customer -> bank`, the view draws it and the new relation is selected

#### Scenario: Reconnect an end
- **WHEN** the end at `shop` of the drawn relation standing for `customer -> shop.web: "Compra" as visit` is dropped on `bank` on the context view
- **THEN** the model statement reads `customer -> bank: "Compra" as visit` and the arrow goes from `customer` to `bank`

#### Scenario: Reconnecting a combination is refused
- **WHEN** an end of the combination `uses` of the view `components` (`shop.web -> shop.api.orders: "Usa" as uses`) is dropped on `shop.api.payments`
- **THEN** the drop is refused with a reason naming the model relations the combination stands for, and the text is unchanged

#### Scenario: Delete a relation drawn elsewhere
- **WHEN** Delete is pressed on the drawn relation `visit` of the context view, which the view `containers` also draws
- **THEN** the dialog lists "drawn in `containers`", and confirming removes the model relation and the view statements that named it in one undo step

#### Scenario: A relation of a model in another file
- **WHEN** an end of a relation is reconnected on a view whose model is imported from `models/commerce.meltemi`
- **THEN** the host writes the model's file, the view redraws the arrow, the status line names `models/commerce.meltemi`, and Ctrl+Z from the view's file brings the arrow back

### Requirement: C4 inspector
The inspector SHALL show for an element its kind and path, the local label, and the entity's label, description, technology and `external`; for a relation its local label, the model label and technology, and its sources, followed by the Style and Effects sections whatever the relation's id, a style or an effect on a relation without an id naming the model relation first (`<from>_<to>` from the entity paths) in the same edit, with the status line saying so; for the view its level, scope, model, title, theme, direction, layout and routing. Entity and relation fields of the model, and the id of an entity or a relation, SHALL write into the model when it is in the same file, and SHALL write into the model's file through steps over files, applied in one undo step, when it is in another file of the project, with the model's file named under the fields and "Open the model" still offered. A rename SHALL reach every file of the project that resolves the model.

#### Scenario: Edit a technology
- **WHEN** `technology` of `shop.web` is set to `Vue` in the inspector of a view whose model is in the same file
- **THEN** the model's `container web` block reads `technology "Vue"`

#### Scenario: Flow particles on an anonymous relation of an imported Mermaid C4 diagram
- **WHEN** the drawn relation standing for `customerA -> SystemAA: "Uses"` is selected on the imported context view and Flow particles is turned on
- **THEN** the model statement reads `customerA -> SystemAA: "Uses" as customerA_SystemAA`, the view gains `animate customerA_SystemAA { effect flow }`, both in one undo step, and the status line says the relation was named

#### Scenario: A model field written in another file
- **WHEN** `technology` of `shop.web` is set to `Vue` on a view whose model is imported from `models/commerce.meltemi`
- **THEN** `models/commerce.meltemi` gains `technology "Vue"` in the `container web` block and the view redraws the type line

#### Scenario: An id in use is refused
- **WHEN** the id of a relation is set in the inspector to an id another relation of the model has
- **THEN** the edit is refused with the reason of `edit.id-conflict` and nothing is written
