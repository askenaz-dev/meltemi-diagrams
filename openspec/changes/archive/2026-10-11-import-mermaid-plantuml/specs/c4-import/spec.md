## ADDED Requirements

### Requirement: C4 macros into a model
Mermaid `C4*` diagrams and C4-PlantUML blocks SHALL be read as macro calls with positional and
named (`$descr=`, `$techn=`, `$tags=`, `$link=`, `$sprite=`, …) arguments, and boundaries with
`{ … }`. Each source diagram SHALL produce a `model <id>_model` and a view `diagram <id>: c4 using
<id>_model`. `Person` and `Person_Ext` SHALL become persons, `System`, `System_Ext`, `SystemDb`,
`SystemDb_Ext`, `SystemQueue` and `SystemQueue_Ext` systems, `Container`, `ContainerQueue` and
`Container_Ext` containers, `ContainerDb` and `ContainerDb_Ext` datastores, `Component`,
`ComponentDb`, `ComponentQueue` and `Component_Ext` components; `_Ext` SHALL add `external` to
persons and systems and be approximated elsewhere, as SHALL the `Db` and `Queue` forms of systems,
containers' queues and components. Descriptions and technologies SHALL become `description` and
`technology`. `$tags`, `$link`, `$sprite`, `AddElementTag`, `AddRelTag`, `UpdateElementStyle`,
`UpdateRelStyle`, `UpdateBoundaryStyle`, `UpdateLayoutConfig`, `SHOW_LEGEND`, `LAYOUT_WITH_LEGEND`,
`HIDE_STEREOTYPE` and `SHOW_PERSON_*` SHALL be dropped (not essential).

#### Scenario: Container diagram
- **WHEN** a C4-PlantUML block includes `C4_Container`, declares `Person(user, "User")`,
  `System_Boundary(shop, "Shop") { Container(api, "API", "Kotlin", "Orders") }` and
  `Rel(user, api, "Uses", "HTTPS")`
- **THEN** the model has `person user "User"`, `system shop "Shop"` holding `container api "API"`
  with technology `Kotlin` and description `Orders`, and `user -> shop.api: "Uses"` with
  technology `HTTPS`

### Requirement: Boundaries and nesting
`System_Boundary` SHALL become the system that holds its containers and datastores;
`Container_Boundary` the container that holds its components, inside the system of its enclosing
boundary. `Enterprise_Boundary` and `Boundary` SHALL be flattened with `import.approximated`.
Containers outside any system boundary SHALL go into the scope's system or, without one, a
synthetic system named after the diagram's title (`system` without a title), and components outside
any container boundary into the scope's container or a synthetic container, all approximated. A
`Container_Boundary` around containers and no components SHALL be read as their system's boundary
(approximated), as Mermaid's own examples write it. At
the component level, containers outside the container boundary SHALL go into the same system as
the boundary's container.

#### Scenario: Synthetic system
- **WHEN** a `C4Container` diagram declares containers without a `System_Boundary`
- **THEN** they are placed in a system named after the title, with an `import.approximated` finding

### Requirement: C4 relations
`Rel`, `Rel_U|D|L|R`, `Rel_Up|Down|Left|Right`, `Rel_Neighbor` and `RelIndex` SHALL become model
relations from source to target, with the label and `technology` (directions approximated);
`Rel_Back` and `Rel_Back_Neighbor` SHALL be reversed; `BiRel` and its directions SHALL become two
relations (approximated). Relation endpoints SHALL be written as full model paths.

#### Scenario: Back relation
- **WHEN** a diagram has `Rel_Back(db, api, "Reads")`
- **THEN** the model has `api -> db: "Reads"` with the paths of both entities

### Requirement: The C4 view
The view SHALL take its level from the Mermaid keyword (`C4Context` context, `C4Container`
container, `C4Component` component, `C4Dynamic` container with `import.approximated`) or from the
included C4-PlantUML file, defaulting by the kinds used. Its scope SHALL be the only
`System_Boundary` (container level) or `Container_Boundary` (component level); with several, the
first SHALL be the scope and the others SHALL be represented by their system (approximated). The
view SHALL `include` every drawn entity that its level allows, and `LAYOUT_LEFT_RIGHT` and
`LAYOUT_LANDSCAPE` SHALL give `direction LR`, `LAYOUT_TOP_DOWN` `direction TB`.

#### Scenario: Context view
- **WHEN** a `C4Context` diagram has two persons and three systems
- **THEN** the view is `level context` and includes the five entities
