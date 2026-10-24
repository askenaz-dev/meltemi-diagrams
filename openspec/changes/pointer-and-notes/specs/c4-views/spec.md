## ADDED Requirements

### Requirement: Notes in views
A C4 view SHALL accept `note <id> "Text" [on <entity path>]`, the one declaration a view holds: a view-local annotation that is never written to the model and never an entity. It SHALL compile into an element of kind `note` with `entity` null, at the top level of the view (never inside the boundary), with the flow note's drawing, and SHALL accept `class` and `url` in its block (`description`, `layer` and `link` are `prop.unknown` in a view, as every other property). The target of `on` SHALL be an entity path the view draws; a path the model has that the view does not draw SHALL be `ref.unknown-element` with the hint that names how to include it, an unknown path `ref.unknown-element` as well, and the note itself `prop.invalid-value`. A note's id SHALL share the view's namespace with the drawn paths (`ref.duplicate-id` on a clash). Entity kinds and the shorthand SHALL stay refused in a view; `include`, `exclude`, `label` and relation statements naming a note SHALL be `ref.unknown-entity`. Styles, classes, rules and effects of the view SHALL apply to notes as to any element; the catalog and the HTML views SHALL draw them as the flow pipeline does.

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
- **THEN** `ref.unknown-entity` is reported on `n` in the `include`

#### Scenario: A style on a note of a view
- **WHEN** the view writes `style cache { fill "#fff3bf"; stroke "#e8a600" }` and `animate cache { effect pulse }`
- **THEN** it compiles without diagnostics and the note is drawn with the outline and pulses

## MODIFIED Requirements

### Requirement: Views compile against a model
`diagram <id>: c4 using <model> { }` SHALL compile into a diagram with `type: "c4"` whose elements are entities of the model, with entity paths as ids, and the view's own notes ("Notes in views"). `using` SHALL name a model of the file, a member import or `<namespace>.<model>`; any other name SHALL be `ref.unknown-model`. A view SHALL accept `level`, `scope`, `include`, `exclude`, `label`, relation statements, `note` declarations, `title`, `description`, `direction`, `layout`, `routing`, `theme`, `preset`, `canvas`, `placement`, `style`, `class`, `rule` and `animate`.

#### Scenario: The proposal's container view
- **WHEN** the view `containers` of `corpus/valid/c4/commerce.meltemi` compiles
- **THEN** it draws `customer`, `shop.web`, `shop.api` and `shop.db`, the boundary `shop` holding the three containers, and the relations `visit`, `request` and `persist`
