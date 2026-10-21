# architecture-model Specification

## Purpose
Architecture models declare persons, systems, containers, datastores and components once, nested by kind, with relations between qualified paths that resolve regardless of order.
## Requirements
### Requirement: Model blocks compile
`model <id> { }` SHALL compile into `document.models`. Entities SHALL be `person`, `system`, `container`, `datastore` and `component`, written `<kind> <id> ["Label"] [{ … }]`, with the label defaulting to the id. Entity blocks SHALL take `description "…"`, `technology "…"`, `external` (persons and systems only) and child entities. Model ids SHALL share the file namespace with diagrams and themes.

#### Scenario: The proposal's model
- **WHEN** `corpus/valid/c4/commerce.meltemi` compiles
- **THEN** the model `commerce` has the entities `customer`, `shop`, `shop.web`, `shop.api` and `shop.db` with their kinds, labels and technologies, and the relations `visit`, `request` and `persist`

### Requirement: Nesting and paths
Persons and systems SHALL sit at the model's root, containers and datastores in systems, and components in containers; any other placement SHALL be `model.invalid-nesting`. An entity's path SHALL join the ids from the root with dots. Sibling ids SHALL be unique (`ref.duplicate-id`).

#### Scenario: A component in a system
- **WHEN** `system shop { component orders }` is written
- **THEN** `model.invalid-nesting` is reported on `component`, saying components belong in containers

### Requirement: Model relations and qualified references
Relations SHALL be written at the model's root or in an entity block, as `a -> b: "Label" as id { technology "…"; description "…" }`. Endpoints SHALL resolve from the innermost enclosing entity outwards, then from the root, after every entity of the model is declared. An unknown endpoint SHALL be `ref.unknown-entity` with the closest paths as hints. A relation from an entity to itself or between an entity and its ancestor SHALL be `model.invalid-relation`. Relation ids SHALL be unique per model; anonymous relations SHALL have the key `<from>-><to>#<n>`.

#### Scenario: Relative endpoints
- **WHEN** `system shop { container api; datastore db; api -> db as persist }` is written
- **THEN** `persist` goes from `shop.api` to `shop.db`

#### Scenario: Order does not matter
- **WHEN** a relation names `shop.api` above the declaration of `shop`
- **THEN** the relation resolves without diagnostics

### Requirement: Model JSON
The model JSON SHALL list `models` after `themes`, each with `id`, `range`, `entities` (`path`, `id`, `kind`, `label`, `description`, `technology`, `external`, `parent`, `range`, `idRange`) and `relations` (`key`, `id`, `from`, `to`, `label`, `technology`, `description`, `range`).

#### Scenario: Stable JSON
- **WHEN** the commerce corpus file is turned into JSON
- **THEN** it matches its `.model.json` snapshot

