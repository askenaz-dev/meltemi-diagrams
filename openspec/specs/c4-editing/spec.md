# c4-editing Specification

## Purpose
Edit operations change a model's entities and relations and a view's lists, labels and composition, and rename entities in every view and link.
## Requirements
### Requirement: Model edit operations
`createEntity`, `renameEntity`, `removeEntity`, `setEntityProperty` (`label`, `description`, `technology`, `external`), `createModelRelation`, `reconnectModelRelation`, `removeModelRelation` and `setModelRelationProperty` (`label`, `technology`, `description`, `id`) SHALL edit a model block with minimal text edits, and every result SHALL compile without new errors. `removeEntity` without cascade SHALL list child entities, model relations, view references and links as dependents. `reconnectModelRelation { model, relation, end, entity }` SHALL rewrite one end of a relation statement with the entity's path from the root, keeping its label, id and block, and SHALL be refused when the result is `model.invalid-relation` or names an unknown entity. `removeModelRelation { model, relation, cascade }` without cascade SHALL list as dependents every statement that names the relation (styles, animations, placement, routes, local labels and combinations standing for it alone) and every other view of the file that draws it, and with cascade SHALL remove the relation with those statements. `setModelRelationProperty` with `id` on an anonymous relation SHALL insert `as <id>` after its label.

#### Scenario: Add a container
- **WHEN** `createEntity { model: "commerce", parent: "shop", kind: "container", id: "worker" }` runs
- **THEN** `container worker "Worker"` is inserted after the last child of `shop`

#### Scenario: Move an end of a relation
- **WHEN** `reconnectModelRelation { model: "commerce", relation: "visit", end: "to", entity: "bank" }` runs on `customer -> shop.web: "Compra" as visit`
- **THEN** the statement reads `customer -> bank: "Compra" as visit` and the file compiles without errors

#### Scenario: An end onto its own ancestor is refused
- **WHEN** `reconnectModelRelation` moves the `to` end of `shop.web -> shop.api` to `shop`
- **THEN** the operation is refused with `edit.invalid-value` naming `model.invalid-relation`, and the text is unchanged

#### Scenario: Remove a relation that views name
- **WHEN** `removeModelRelation { model: "commerce", relation: "visit", cascade: false }` runs while `context` has `style visit { width 2 }` and `containers` draws the relation
- **THEN** the operation is refused with `edit.has-dependents` listing the style and "drawn in `containers`", and with `cascade: true` the relation and the style are removed and the file compiles without errors

#### Scenario: Name an anonymous relation
- **WHEN** `setModelRelationProperty { model: "commerce", relation: "customer->shop.web#1", property: "id", value: "customer_shop_web" }` runs
- **THEN** the statement reads `customer -> shop.web: "Uses" as customer_shop_web`

### Requirement: Renames reach every view
`renameEntity` SHALL rewrite the entity's declaration, the model relations that name it, every view reference (`scope`, `include`, `exclude`, `label`, relations, placement, styles) and every link of the file. The project SHALL plan the same rename for every file of the project that resolves the model.

#### Scenario: Rename a container
- **WHEN** `shop.api` is renamed to `orders` in the commerce file
- **THEN** the declaration, `shop.web -> shop.orders`, `include … shop.orders` and `place shop.orders at …` are rewritten and the file compiles without errors

### Requirement: View edit operations
`includeEntity` SHALL add an entity to `include` (or remove it from `exclude`), `excludeEntity` SHALL remove it from `include` (or add it to `exclude` when the view has no `include`) and remove the view statements that only target it, and `setLocalLabel` SHALL write, change or remove `label <target> "Text"`. Placement, constraint, style, animation and arrange operations SHALL accept qualified ids. A view statement planned for a drawn relation whose model relation has no id (`setStyleProperty`, `setAnimation`, `setRoute`, `setLocalLabel`, `moveLabel` and the placement of its label) SHALL be planned after `setModelRelationProperty { property: "id" }` naming the model relation `<from>_<to>` (entity paths with `_` for `.`, then `_2`, `_3`…), in the same plan. Operations that would write entity declarations into a view SHALL be refused with `edit.invalid-value` naming the model and view operations; a relation created in a C4 view SHALL be `createModelRelation` in its model.

#### Scenario: Exclude from a view
- **WHEN** `excludeEntity { diagram: "containers", entity: "shop.db" }` runs on the commerce file
- **THEN** `shop.db` leaves the `include` list and its `place` is removed, and the model is unchanged

#### Scenario: Move in one view only
- **WHEN** `shop.api` is moved in the view `containers`
- **THEN** only the `place` of `containers` changes

#### Scenario: A style on an anonymous model relation
- **WHEN** the width of the drawn relation `customer->shop#1` of the view `context` is set to 2 and its model relation `customer -> shop: "Uses"` has no id
- **THEN** one plan gives the model `customer -> shop: "Uses" as customer_shop` and the view `style customer_shop { width 2 }`, and the text compiles without errors

#### Scenario: A declaration in a view is refused
- **WHEN** `createElement { diagram: "context", kind: "node" }` runs on a C4 view
- **THEN** it is refused with `edit.invalid-value` naming `createEntity` and `includeEntity`

### Requirement: Model edits planned over the files of a project
`ProjectSessions.planSteps(documentPath, steps)` SHALL plan an ordered list of steps `{ file, operation }`, where `file` is a path of the project or null for the document itself: consecutive steps of one file SHALL become one batch plan against that file, the planned text SHALL stand as that file's content for the steps that follow, so a later file's statements resolve what an earlier file's steps wrote, and the result SHALL be the edits of every file against its current text, in one result, or the first rejection's reason. `renameEntity` and `removeModelRelation` steps SHALL reach every file of the project whose views resolve the model. Planning SHALL leave the project's files as they were.

#### Scenario: A style on a relation of a model in another file
- **WHEN** the steps are `setModelRelationProperty { id }` on `models/commerce.meltemi` and `setStyleProperty` on the view's file naming the new id
- **THEN** the result holds the `as` edit for the model's file and the `style` edit for the view's file, and both files compile together without errors when applied

#### Scenario: A removal reaches the views of other files
- **WHEN** the step is `removeModelRelation { cascade: true }` on `models/commerce.meltemi` and `views/context.meltemi` has `animate uses { effect flow }`
- **THEN** the result holds edits for both files and the project compiles without errors when they are applied

#### Scenario: A refused step plans nothing
- **WHEN** the second step names an entity the model does not have
- **THEN** the result is the rejection's reason, no edit is returned for the first file, and the project's texts are unchanged

