# free-diagram-model Specification

## Purpose
The free profile: `diagram <id>: free { }` objects (box, text, icon, image, group), free style properties, layers and identity links between diagrams, compiled into the shared diagram model.
## Requirements
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

Elements SHALL expose `source` (the icon reference or image path). The style property `shape` SHALL take `rounded`, `rectangle`, `square`, `ellipse`, `circle`, `diamond`, `cylinder`, `pill`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person`, `agent` or `icon`; it SHALL be accepted on free boxes and on flow `node`s, and refused with `prop.invalid-value` on free `text`, `icon` and `image` objects, on `decision`, `data`, `note`, `tag`, groups and relations, naming `node` and `box`, in `style` statements as in rules. `fontSize` (6 to 160), `fontWeight` (400, 500, 600, 700) and `textAlign` (`left`, `center`, `right`) SHALL be accepted in free diagrams and refused in flow diagrams with `prop.invalid-value`. `radius` (0 to 64) SHALL be accepted on elements and groups of both profiles.

#### Scenario: Image path outside the project
- **WHEN** a free diagram declares `image logo "../../outside.png"` in a project whose root is the file's folder
- **THEN** `asset.outside-project` is reported on the path

#### Scenario: Shape in flow
- **WHEN** a flow diagram writes `style api { shape hexagon }` on a node
- **THEN** it compiles without diagnostics and the style entry of `api` has `shape` `hexagon`

#### Scenario: An agent node
- **WHEN** a flow diagram writes `style planner { shape agent }` on a node
- **THEN** it compiles without diagnostics and the style entry of `planner` has `shape` `agent`

#### Scenario: An icon as the shape
- **WHEN** a flow diagram writes `style lambda { icon "aws:lambda"; shape icon }` on a node
- **THEN** it compiles without diagnostics and the style entry of `lambda` has `shape` `icon`

#### Scenario: Shape on a decision
- **WHEN** a flow diagram writes `style ok { shape ellipse }` on a decision
- **THEN** `prop.invalid-value` is reported on `shape`, naming `node` and `box`

#### Scenario: Shape on a text, an icon or an image
- **WHEN** a free diagram writes `style t { shape hexagon }` on a text, `style i { shape star }` on an icon and `style p { shape pill }` on an image
- **THEN** `prop.invalid-value` is reported on each `shape`, naming `node` and `box`, as for `rule text { shape pill }`

#### Scenario: Text properties in flow
- **WHEN** a flow diagram writes `style api { fontSize 20 }`
- **THEN** `prop.invalid-value` is reported, naming free diagrams

#### Scenario: Unknown shape value
- **WHEN** a free diagram writes `style a { shape blob }`
- **THEN** `prop.invalid-value` is reported on `blob`, listing the twenty-four shapes

### Requirement: Layers
`layers <name>, <name>...` SHALL declare layers from back to front. `main` SHALL always exist and SHALL come last when it is not listed. `layer <name>` in the block of an element or relation SHALL place it on that layer. An undeclared name SHALL be `ref.unknown-layer`, listing the layers. Elements and relations without `layer` SHALL be on `main`. Flow diagrams SHALL accept `layers` and `layer` the same way; sequence diagrams and C4 views SHALL refuse them with `prop.unknown`.

#### Scenario: Unknown layer
- **WHEN** a free diagram declares `layers back` and a box writes `layer front`
- **THEN** `ref.unknown-layer` is reported with the hint "Layers: back, main."

#### Scenario: Layers in a flow diagram
- **WHEN** a flow diagram declares `layers back, main` with `group band "Band" { layer back }` and a node without `layer`
- **THEN** it compiles without diagnostics, the group is painted before the node, and a sequence diagram with `layers back` reports `prop.unknown`

### Requirement: Identity links
`link <diagram>.<element>` in an element block, in flow or free diagrams, SHALL record an identity link. The model SHALL resolve links to elements of other diagrams of the same file. A link whose first part is an import binding SHALL be left to the project, which SHALL resolve it through the binding. An unresolved link SHALL be `ref.unknown-link`. The diagram SHALL expose its links with their target and ranges.

#### Scenario: Link in the same file
- **WHEN** a free diagram's box writes `link checkout.api` and the file has `diagram checkout: flow` declaring `api`
- **THEN** the element's link targets diagram `checkout`, element `api`, and nothing is reported

#### Scenario: Unknown link
- **WHEN** a box writes `link checkout.ghost`
- **THEN** `ref.unknown-link` is reported on `ghost`

