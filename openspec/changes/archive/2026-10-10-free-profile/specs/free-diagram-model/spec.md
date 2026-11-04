## ADDED Requirements

### Requirement: Free diagrams compile
`diagram <id>: free { }` SHALL compile into the same diagram model as flow, with `type` set to `free`. It SHALL accept:

- the declarations `box`, `text`, `icon`, `image` and `group`, and the shorthand `id["Label"]` (a box) and `id[("Label")]` (a box with `shape cylinder`);
- relations `->` and `-->` with labels, ids and blocks;
- `placement` with `place`, `size`, `route`, `label` and the constraints;
- `style`, `class`, `rule` and `animate`;
- the diagram properties of flow and `layers`, with `layout manual` as the default.

Flow kinds (`node`, `decision`, `data`, `note`, `tag`) SHALL be `prop.unknown` in a free diagram, with a hint listing the free kinds.

#### Scenario: The proposal's example
- **WHEN** the free example of the proposal (`text heading`, two boxes, a relation, placement, a route and an animation) is compiled
- **THEN** it compiles without errors, `heading` is a `text` object, `api` and `events` are boxes, and the diagram's layout is `manual`

#### Scenario: Flow kinds in free
- **WHEN** a free diagram declares `decision ok "OK?"`
- **THEN** `prop.unknown` is reported with the hint "Free diagrams declare `box`, `text`, `icon`, `image` and `group`."

### Requirement: Free objects
- **`text <id> "Text"`** SHALL require its text.
- **`icon <id> "<pack>:<name>"`** SHALL require an icon reference, checked like style icons when the project has asset services.
- **`image <id> "<path>"`** SHALL require a path that is relative, uses `/`, has no URL scheme and stays inside the project root. It SHALL otherwise report `asset.outside-project`.

Elements SHALL expose `source` (the icon reference or image path). The style properties `shape` (`rounded`, `rectangle`, `ellipse`, `diamond`, `cylinder`, `pill`), `fontSize` (6 to 160), `fontWeight` (400, 500, 600, 700) and `textAlign` (`left`, `center`, `right`) SHALL be accepted in free diagrams and refused in flow diagrams with `prop.invalid-value`.

#### Scenario: Image path outside the project
- **WHEN** a free diagram declares `image logo "../../outside.png"` in a project whose root is the file's folder
- **THEN** `asset.outside-project` is reported on the path

#### Scenario: Shape in flow
- **WHEN** a flow diagram writes `style api { shape ellipse }`
- **THEN** `prop.invalid-value` is reported, naming free diagrams

### Requirement: Layers
`layers <name>, <name>...` SHALL declare layers from back to front. `main` SHALL always exist and SHALL come last when it is not listed. `layer <name>` in the block of an element or relation SHALL place it on that layer. An undeclared name SHALL be `ref.unknown-layer`, listing the layers. Elements and relations without `layer` SHALL be on `main`. Flow diagrams SHALL refuse `layers` and `layer` with `prop.unknown`.

#### Scenario: Unknown layer
- **WHEN** a free diagram declares `layers back` and a box writes `layer front`
- **THEN** `ref.unknown-layer` is reported with the hint "Layers: back, main."

### Requirement: Identity links
`link <diagram>.<element>` in an element block, in flow or free diagrams, SHALL record an identity link. The model SHALL resolve links to elements of other diagrams of the same file. A link whose first part is an import binding SHALL be left to the project, which SHALL resolve it through the binding. An unresolved link SHALL be `ref.unknown-link`. The diagram SHALL expose its links with their target and ranges.

#### Scenario: Link in the same file
- **WHEN** a free diagram's box writes `link checkout.api` and the file has `diagram checkout: flow` declaring `api`
- **THEN** the element's link targets diagram `checkout`, element `api`, and nothing is reported

#### Scenario: Unknown link
- **WHEN** a box writes `link checkout.ghost`
- **THEN** `ref.unknown-link` is reported on `ghost`
