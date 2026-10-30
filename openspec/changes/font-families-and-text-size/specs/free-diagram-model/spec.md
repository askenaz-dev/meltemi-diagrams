## MODIFIED Requirements

### Requirement: Free objects
- **`text <id> "Text"`** SHALL require its text.
- **`icon <id> "<pack>:<name>"`** SHALL require an icon reference, checked like style icons when the project has asset services.
- **`image <id> "<path>"`** SHALL require a path that is relative, uses `/`, has no URL scheme and stays inside the project root. It SHALL otherwise report `asset.outside-project`.

Elements SHALL expose `source` (the icon reference or image path). The style property `shape` SHALL take `rounded`, `rectangle`, `square`, `ellipse`, `circle`, `diamond`, `cylinder`, `pill`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person`, `agent` or `icon`; it SHALL be accepted on free boxes and on flow `node`s, and refused with `prop.invalid-value` on free `text`, `icon` and `image` objects, on `decision`, `data`, `note`, `tag`, groups and relations, naming `node` and `box`, in `style` statements as in rules. `textAlign` (`left`, `center`, `right`) SHALL be accepted in free diagrams and refused in flow diagrams with `prop.invalid-value`; `fontSize` (6 to 160) and `fontWeight` (400, 500, 600, 700) SHALL be accepted in both profiles on the targets that draw text (`style-classes-and-rules`, "Text properties in every profile"). `radius` (0 to 64) SHALL be accepted on elements and groups of both profiles.

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
- **WHEN** a flow diagram writes `style api { fontSize 20 }` and `style db { textAlign left }`
- **THEN** the style entry of `api` has `fontSize` 20 without a diagnostic, and `prop.invalid-value` is reported on `textAlign`, naming free diagrams

#### Scenario: Unknown shape value
- **WHEN** a free diagram writes `style a { shape blob }`
- **THEN** `prop.invalid-value` is reported on `blob`, listing the twenty-four shapes
