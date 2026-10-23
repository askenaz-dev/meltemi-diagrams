## MODIFIED Requirements

### Requirement: Model edit operations
`createEntity`, `renameEntity`, `removeEntity`, `setEntityProperty` (`label`, `description`, `technology`, `external`), `createModelRelation`, `reconnectModelRelation`, `removeModelRelation` and `setModelRelationProperty` (`label`, `technology`, `description`, `id`) SHALL edit a model block with minimal text edits, and every result SHALL compile without new errors. `removeEntity` without cascade SHALL list child entities, model relations, view references and links as dependents. `reconnectModelRelation { model, relation, end, entity, port? }` SHALL rewrite one end of a relation statement with the entity's path from the root, keeping its label, id and block, and SHALL be refused when the result is `model.invalid-relation` or names an unknown entity; in the same edit it SHALL rewrite the moved end of every `route <id>` statement of the file's views that draw the relation to the entity lifted to what that view draws, dropping that end's named port and point, carrying a compass port over, keeping the other end and `via`, writing `port` into the edited view's route when given (naming the relation first when it has none), leaving untouched a route whose lifted end does not change, and removing a route whose ends would meet; the file SHALL compile without `placement.route-mismatch` afterwards. `removeModelRelation { model, relation, cascade }` without cascade SHALL list as dependents every statement that names the relation (styles, animations, placement, routes, local labels and combinations standing for it alone) and every other view of the file that draws it, and with cascade SHALL remove the relation with those statements. `setModelRelationProperty` with `id` on an anonymous relation SHALL insert `as <id>` after its label.

#### Scenario: Add a container
- **WHEN** `createEntity { model: "commerce", parent: "shop", kind: "container", id: "worker" }` runs
- **THEN** `container worker "Worker"` is inserted after the last child of `shop`

#### Scenario: Move an end of a relation
- **WHEN** `reconnectModelRelation { model: "commerce", relation: "visit", end: "to", entity: "bank" }` runs on `customer -> shop.web: "Compra" as visit`
- **THEN** the statement reads `customer -> bank: "Compra" as visit` and the file compiles without errors

#### Scenario: A routed relation keeps a valid route
- **WHEN** the view `containers` has `route visit from customer.south to shop.web.north via [(200, 300)]` and `reconnectModelRelation` moves the `to` end of `visit` to `bank`
- **THEN** the route reads `route visit from customer.south to bank via [(200, 300)]`, the model statement ends at `bank`, and the file compiles without `placement.route-mismatch`

#### Scenario: A pinned port is dropped, a compass port carries over
- **WHEN** the view has `route visit from customer.east 25% to shop.web.in` where `in` is a named port of `web`, and the `to` end moves to `bank`
- **THEN** the route reads `route visit from customer.east 25% to bank`, since a named port never carries over, and a route whose moved end was `shop.web.north` would read `bank.north`

#### Scenario: A route in a lifted view
- **WHEN** the context view draws `visit` lifted as `customer -> shop` with `route visit from customer to shop` and the `to` end of the model relation moves from `shop.web` to `shop.api`
- **THEN** the context view's route is unchanged, because its lifted end is still `shop`

#### Scenario: An end onto its own ancestor is refused
- **WHEN** `reconnectModelRelation` moves the `to` end of `shop.web -> shop.api` to `shop`
- **THEN** the operation is refused with `edit.invalid-value` naming `model.invalid-relation`, and the text is unchanged

#### Scenario: An unknown entity is refused
- **WHEN** `reconnectModelRelation` moves an end to `warehouse`, which the model does not declare
- **THEN** the operation is refused with `edit.unsafe-target` naming `warehouse`, and no route is rewritten

#### Scenario: Remove a relation that views name
- **WHEN** `removeModelRelation { model: "commerce", relation: "visit", cascade: false }` runs while `context` has `style visit { width 2 }` and `containers` draws the relation
- **THEN** the operation is refused with `edit.has-dependents` listing the style and "drawn in `containers`", and with `cascade: true` the relation and the style are removed and the file compiles without errors

#### Scenario: Name an anonymous relation
- **WHEN** `setModelRelationProperty { model: "commerce", relation: "customer->shop.web#1", property: "id", value: "customer_shop_web" }` runs
- **THEN** the statement reads `customer -> shop.web: "Uses" as customer_shop_web`

### Requirement: Model edits planned over the files of a project
`ProjectSessions.planSteps(documentPath, steps)` SHALL plan an ordered list of steps `{ file, operation }`, where `file` is a path of the project or null for the document itself: consecutive steps of one file SHALL become one batch plan against that file, the planned text SHALL stand as that file's content for the steps that follow, so a later file's statements resolve what an earlier file's steps wrote, and the result SHALL be the edits of every file against its current text, in one result, or the first rejection's reason. `renameEntity`, `removeModelRelation` and `reconnectModelRelation` steps SHALL reach every file of the project whose views resolve the model: a reconnect SHALL rewrite the moved end of the `route <id>` statements of those files' views as it does in the model's own file. After planning, every file of the project whose views resolve the model SHALL be compiled with the planned texts, and a new error in any of them SHALL refuse the whole plan with its reason. Planning SHALL leave the project's files as they were.

#### Scenario: A style on a relation of a model in another file
- **WHEN** the steps are `setModelRelationProperty { id }` on `models/commerce.meltemi` and `setStyleProperty` on the view's file naming the new id
- **THEN** the result holds the `as` edit for the model's file and the `style` edit for the view's file, and both files compile together without errors when applied

#### Scenario: A removal reaches the views of other files
- **WHEN** the step is `removeModelRelation { cascade: true }` on `models/commerce.meltemi` and `views/context.meltemi` has `animate uses { effect flow }`
- **THEN** the result holds edits for both files and the project compiles without errors when they are applied

#### Scenario: A reconnect reaches the routes of other files
- **WHEN** the step is `reconnectModelRelation { relation: "uses", end: "to", entity: "product.api" }` on `models/system.meltemi` and `diagrams/views.meltemi` has `route uses from user to product.web via [(300, 200)]` in its container view
- **THEN** the result holds the model edit and a rewrite of that route to `route uses from user to product.api via [(300, 200)]`, and every file compiles without errors when they are applied

#### Scenario: A created entity reaches the view
- **WHEN** the steps are `createEntity { entityKind: "container", parent: "product", label: "" }` on `models/system.meltemi`, then `includeEntity` and `setPosition` of the new path on the view's file
- **THEN** the result holds the declaration in the model's file and, when the view lists `include`, the path appended there with its `place`, and the project compiles without errors when they are applied

#### Scenario: A refused step plans nothing
- **WHEN** the second step names an entity the model does not have
- **THEN** the result is the rejection's reason, no edit is returned for the first file, and the project's texts are unchanged

#### Scenario: A file nobody wrote would break
- **WHEN** a reconnect step is planned and a view of a third file, which no step wrote, would compile with a new error against the planned model
- **THEN** the result is that error's reason and nothing is returned for any file
