# c4-editing Specification

## Purpose
Edit operations change a model's entities and relations and a view's lists, labels and composition, and rename entities in every view and link.
## Requirements
### Requirement: Model edit operations
`createEntity`, `renameEntity`, `removeEntity`, `setEntityProperty` (`label`, `description`, `technology`, `external`), `createModelRelation`, `removeModelRelation` and `setModelRelationProperty` (`label`, `technology`, `description`, `id`) SHALL edit a model block with minimal text edits, and every result SHALL compile without new errors. `removeEntity` without cascade SHALL list child entities, model relations, view references and links as dependents.

#### Scenario: Add a container
- **WHEN** `createEntity { model: "commerce", parent: "shop", kind: "container", id: "worker" }` runs
- **THEN** `container worker "Worker"` is inserted after the last child of `shop`

### Requirement: Renames reach every view
`renameEntity` SHALL rewrite the entity's declaration, the model relations that name it, every view reference (`scope`, `include`, `exclude`, `label`, relations, placement, styles) and every link of the file. The project SHALL plan the same rename for every file of the project that resolves the model.

#### Scenario: Rename a container
- **WHEN** `shop.api` is renamed to `orders` in the commerce file
- **THEN** the declaration, `shop.web -> shop.orders`, `include … shop.orders` and `place shop.orders at …` are rewritten and the file compiles without errors

### Requirement: View edit operations
`includeEntity` SHALL add an entity to `include` (or remove it from `exclude`), `excludeEntity` SHALL remove it from `include` (or add it to `exclude` when the view has no `include`) and remove the view statements that only target it, and `setLocalLabel` SHALL write, change or remove `label <target> "Text"`. Placement, constraint, style, animation and arrange operations SHALL accept qualified ids. Operations that would write declarations or relations into a view SHALL be refused with `edit.invalid-value` naming the model and view operations.

#### Scenario: Exclude from a view
- **WHEN** `excludeEntity { diagram: "containers", entity: "shop.db" }` runs on the commerce file
- **THEN** `shop.db` leaves the `include` list and its `place` is removed, and the model is unchanged

#### Scenario: Move in one view only
- **WHEN** `shop.api` is moved in the view `containers`
- **THEN** only the `place` of `containers` changes

