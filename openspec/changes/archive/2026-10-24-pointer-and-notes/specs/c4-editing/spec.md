## ADDED Requirements

### Requirement: Note operations in views
`createElement { diagram, elementKind: "note", label?, at?, size?, attachedTo? }` on a C4 view SHALL declare `note <id> "Text" [on <path>]` in the view after its last note (or after the lists and before the blocks when it has none), with `place` and `size` as in other profiles, and SHALL be the one `createElement` a view accepts: every other kind SHALL stay refused with `edit.invalid-value` naming `createEntity` and `includeEntity`. `attachNote { diagram, note, element }` SHALL write, change or remove the `on` clause of a note of the view, the element an entity path the view draws (`edit.unsafe-target` otherwise). `excludeEntity` SHALL list the notes of the view attached to the entity as dependents of kind `attachment` and, cascading, SHALL strip their `on <path>` and keep the notes; `removeEntity` SHALL do the same in every view of the file for the removed entity and its descendants. `renameEntity` SHALL rewrite the attachment targets of every view of the file, and the project SHALL plan the same for every file that resolves the model. Paste and Duplicate on a view SHALL copy a note as a note of the view, keeping `on` when its target is drawn in the view.

#### Scenario: Create a note in a view
- **WHEN** `createElement { diagram: "containers", elementKind: "note", label: "Cached", at: (600, 80), attachedTo: "shop.api" }` runs on the commerce file
- **THEN** the view gains `note note1 "Cached" on shop.api` and `place note1 at (600, 80)`, and the model is unchanged

#### Scenario: A node in a view is still refused
- **WHEN** `createElement { diagram: "containers", elementKind: "node" }` runs
- **THEN** it is refused with `edit.invalid-value` naming `createEntity` and `includeEntity`

#### Scenario: Exclude an entity with a note
- **WHEN** the view has `note cache "Cached" on shop.api` and `excludeEntity { diagram: "containers", entity: "shop.api", cascade: false }` runs
- **THEN** it is refused with `edit.has-dependents` listing the attachment of `cache`, and with `cascade: true` the view reads `note cache "Cached"`, `shop.api` leaves the `include` list, and the file compiles without errors

#### Scenario: Remove an entity from the model
- **WHEN** `removeEntity { model: "commerce", entity: "shop.api", cascade: true }` runs while two views attach notes to `shop.api` and `shop.api.orders`
- **THEN** both notes lose their `on` clause and the file compiles without errors

#### Scenario: Rename reaches the attachment
- **WHEN** `shop.api` is renamed to `orders` while a view has `note cache "Cached" on shop.api`
- **THEN** the view reads `note cache "Cached" on shop.orders`

#### Scenario: Attach to an entity the view does not draw
- **WHEN** `attachNote { diagram: "context", note: "n", element: "shop.api" }` runs
- **THEN** it is refused with `edit.unsafe-target` naming `shop.api` and the view `context`
