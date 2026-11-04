# c4-views Specification

## Purpose
C4 views draw a model at the context, container or component level, validated by level and scope, with relations lifted to the drawn entities and traced to the model, explicit combinations, local labels, imported models and links from other profiles.
## Requirements
### Requirement: Views compile against a model
`diagram <id>: c4 using <model> { }` SHALL compile into a diagram with `type: "c4"` whose elements are entities of the model, with entity paths as ids, and the view's own notes ("Notes in views"). `using` SHALL name a model of the file, a member import or `<namespace>.<model>`; any other name SHALL be `ref.unknown-model`. A view SHALL accept `level`, `scope`, `include`, `exclude`, `label`, relation statements, `note` declarations, `title`, `description`, `direction`, `layout`, `routing`, `theme`, `preset`, `canvas`, `placement`, `style`, `class`, `rule` and `animate`.

#### Scenario: The proposal's container view
- **WHEN** the view `containers` of `corpus/valid/c4/commerce.meltemi` compiles
- **THEN** it draws `customer`, `shop.web`, `shop.api` and `shop.db`, the boundary `shop` holding the three containers, and the relations `visit`, `request` and `persist`

### Requirement: Levels and scopes
`level` SHALL be `context`, `container` or `component` (`c4.invalid-level` otherwise). A container view SHALL have a system as scope and a component view a container (`c4.scope-required`, `c4.invalid-scope`); a context view MAY have a system as scope. The scope of a container or component view SHALL be drawn as a boundary of kind `group` holding its included children.

#### Scenario: Missing scope
- **WHEN** a view writes `level container` without `scope`
- **THEN** `c4.scope-required` is reported on `level`

#### Scenario: A datastore as a component scope
- **WHEN** a component view writes `scope shop.db` and `shop.db` is a datastore
- **THEN** `c4.invalid-scope` is reported, saying datastores have no components

### Requirement: Include, exclude and the default set
`include` and `exclude` SHALL take qualified entities. Entities outside the level's allowed set SHALL be `c4.out-of-level`; the scope in `include` SHALL be `c4.out-of-level` with a hint that it is the boundary. Without `include`, a view SHALL draw its default set: every person and system for a context view without scope; otherwise the scope's children (or the scope itself for context) and the entities directly related to them at the view's level. `exclude` SHALL remove entities from the drawn set.

#### Scenario: A component in a container view
- **WHEN** a container view includes `shop.api.orders`
- **THEN** `c4.out-of-level` is reported, naming the container level

#### Scenario: The default set
- **WHEN** a container view of `shop` has no `include`
- **THEN** it draws the containers and datastores of `shop` and every person and system related to them

### Requirement: Derived relations with traceability
Each end of a model relation SHALL be drawn at its nearest visible ancestor-or-self; a relation whose ends meet or lack a visible ancestor SHALL not be drawn. Every drawn relation SHALL carry `sources` (the model relation keys it stands for) and `derived`. Several model relations lifted to the same pair SHALL stay several arrows.

#### Scenario: A context view lifts container relations
- **WHEN** a context view draws `customer` and `shop` and the model has `customer -> shop.web as visit`
- **THEN** one relation `visit` goes from `customer` to `shop`, with `derived: true` and `sources: ["visit"]`

### Requirement: Explicit combination
A relation statement in a view SHALL draw one arrow for every model relation whose visible ends are its ordered pair, replacing them, with their keys as `sources`. A relation statement whose pair has no model relation SHALL be `c4.unsupported-relation`.

#### Scenario: Combine two lifted relations
- **WHEN** a context view writes `customer -> shop: "Usa" as uses` and the model has two relations from `customer` to containers of `shop`
- **THEN** the view draws one relation `uses` with both model relations as sources

#### Scenario: No arrow for convenience
- **WHEN** a view writes `shop -> customer` and no model relation goes that way
- **THEN** `c4.unsupported-relation` is reported

### Requirement: Local labels
`label <entity> "Text"` and `label <relation> "Text"` at the view level SHALL replace the visible text in that view only, and SHALL never change the model. A target not drawn in the view SHALL be `ref.unknown-element` or `ref.unknown-relation`.

#### Scenario: Override a label
- **WHEN** the view writes `label shop.api "Orders API"`
- **THEN** the element `shop.api` of that view has the label `Orders API`, and the model and other views keep `API`

### Requirement: Imported models
`compile(text, { models })` SHALL resolve imported model names through the resolver. The project SHALL compile files whose views or links name imported models against those models, so that validation, export and the editor see the same view. Without a resolver, views of imported models SHALL compile without elements and without diagnostics.

#### Scenario: A view in another file
- **WHEN** `diagrams/containers.meltemi` imports `models/commerce.meltemi` and writes `diagram containers: c4 using commerce { … }`
- **THEN** the project compiles the view with the entities of `commerce`, and an unknown include is reported in `diagrams/containers.meltemi`

### Requirement: Links to model entities
`link <model>.<path>` in sequence and free diagrams, and through imports, SHALL tie an object to an entity; an unknown entity SHALL be `ref.unknown-link`. An object without its own label SHALL take the entity's label. No relation SHALL be derived from a link.

#### Scenario: A participant linked to an entity
- **WHEN** a sequence diagram declares `participant api { link commerce.shop.api }` without a label
- **THEN** the participant's label is `API`

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

### Requirement: Notes in views
A C4 view SHALL accept `note <id> "Text" [on <entity path>]`, the one declaration a view holds: a view-local annotation that is never written to the model and never an entity. It SHALL compile into an element of kind `note` with `entity` null, at the top level of the view (never inside the boundary), with the flow note's drawing, and SHALL accept `class` and `url` in its block (`description`, `layer` and `link` are `prop.unknown` in a view, as every other property). The target of `on` SHALL be an entity path the view draws; a path the model has that the view does not draw SHALL be `ref.unknown-element` with the hint that names how to include it, an unknown path `ref.unknown-element` as well, and the note itself `prop.invalid-value`. A note's id SHALL share the view's namespace with the drawn paths (`ref.duplicate-id` on a clash). Entity kinds and the shorthand SHALL stay refused in a view; A note SHALL be no entity: `include` and `exclude` naming it SHALL be `ref.unknown-entity`, and `label` and relation statements naming it SHALL be `ref.unknown-element`, as for any path the view does not draw. Styles, classes, rules and effects of the view SHALL apply to notes as to any element; the catalog and the HTML views SHALL draw them as the flow pipeline does.

#### Scenario: A note in a container view
- **WHEN** the view `containers` of the commerce file declares `note cache "Cached 5 min" on shop.api`
- **THEN** it compiles without diagnostics, the view's elements hold `cache` with kind `note`, `entity` null and `attachedTo` `shop.api`, the model is unchanged, and the view draws the note with a leader to `shop.api`

#### Scenario: A note on an entity the view does not draw
- **WHEN** the context view declares `note n "Text" on shop.api`
- **THEN** `ref.unknown-element` is reported on the path with the hint that the context level does not draw it

#### Scenario: An entity kind in a view
- **WHEN** a view declares `container worker "Worker"`
- **THEN** `prop.unknown` is reported with the hint to declare entities in the model, as today

#### Scenario: A note in a list
- **WHEN** a view declares `note n "Text"` and `include n`
- **THEN** `ref.unknown-entity` is reported on `n` in the `include`, and a relation or a `label` naming `n` reports `ref.unknown-element`

#### Scenario: A style on a note of a view
- **WHEN** the view writes `style cache { fill "#fff3bf"; stroke "#e8a600" }` and `animate cache { effect pulse }`
- **THEN** it compiles without diagnostics and the note is drawn with the outline and pulses

