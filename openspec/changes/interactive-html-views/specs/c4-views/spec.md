## ADDED Requirements

### Requirement: Child views of an entity
`childLevel(kind)` in `@meltemi/diagrams-model` SHALL return `container` for a `system`, `component`
for a `container` and null for a `person`, a `datastore` and a `component`. `isChildView(view,
model, entity)` SHALL be true when a compiled C4 view uses the same model (the model's file and id),
has `level === childLevel(entity.kind)` and `scope === entity.path`; a context view scoped to a
system is not a child view of that system. Hosts that resolve the child view of an entity SHALL
consider only views without errors (and, in a catalog, not excluded), ordered the views of the
drawing's own file first by source position and then the project's files by sorted path, and
SHALL open the first while listing every candidate.

#### Scenario: A system opens its containers
- **WHEN** `shop` of `corpus/valid/c4/commerce.meltemi` is resolved
- **THEN** `childLevel("system")` is `container` and `isChildView` is true for the `containers` view
  only

#### Scenario: A container opens its components
- **WHEN** `shop.api` is resolved
- **THEN** the `components` view is its child view

#### Scenario: A datastore has no child view
- **WHEN** `shop.db` is resolved
- **THEN** `childLevel("datastore")` is null and `isChildView` is false for every view of the file

#### Scenario: Same file first
- **WHEN** two container views scoped to `shop` compile without errors, one in the drawing's file
  and one in another file of the project
- **THEN** the one in the drawing's file opens and both are listed as candidates
