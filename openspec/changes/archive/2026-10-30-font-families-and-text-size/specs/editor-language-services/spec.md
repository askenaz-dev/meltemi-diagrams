## MODIFIED Requirements

### Requirement: Completion
`completions(analysis, offset)` SHALL return the items that are valid at the cursor, according to the innermost block, the statement keyword and the argument index:

- top-level words;
- the statements of the flow body and the element ids that start a relation;
- element ids after `->`, `-->`, `--`, `---`, `<->` and `<-->`;
- the statements of element blocks;
- the enumerated values of diagram properties;
- the themes in scope inside `theme "`;
- placement statements, then element or relation ids by argument;
- the ports of an element after `<element>.`;
- style properties and their values: enums, colour token names, classes in scope, `verticalAlign` with `top`, `middle` and `bottom` in free diagrams, `fontWeight` with the four weights in every profile, and `font` with every bundled and project family of the document's font library as a quoted string, project fonts first and then the groups in `FONT_GROUPS` order, each with its group as detail;
- icon references matching the typed prefix, at most 200;
- animation properties and their values;
- theme tokens and their values, `sketch` with `none`, `light` and `rough`, and `font` and `mono` with the same families as the style property.

Each item SHALL carry a kind and a short detail.

#### Scenario: Ports after a dot
- **WHEN** completion runs after `route publish from api.east to bus.` and `bus` declares the port `in`
- **THEN** the items are `in`, `north`, `south`, `east`, `west` and `auto`

#### Scenario: Values of a property
- **WHEN** completion runs after `layout ` in a flow body
- **THEN** the items are `auto`, `assisted` and `manual`

#### Scenario: Relation targets
- **WHEN** completion runs after `api -> ` in a diagram that declares `api`, `db` and `cache`
- **THEN** the items include `db` and `cache`

#### Scenario: Targets after a line token
- **WHEN** completion runs after `api -- ` and after `api --- ` in the same diagram
- **THEN** the items include `db` and `cache` both times

#### Scenario: Sketch token values
- **WHEN** completion runs after `sketch ` inside a `theme` block
- **THEN** the items are `none`, `light` and `rough`, and `sketch` itself is offered among the tokens at the start of a theme statement

#### Scenario: Font values
- **WHEN** completion runs after `font ` inside a `style` block of a flow diagram whose project has the font `Company Sans`
- **THEN** the items start with `"Company Sans"` (detail "project font"), then `"Inter"` and the other sans families, the serif, monospace and handwriting families, each quoted with its group as detail, and `font` itself is offered among the style properties in a sequence diagram's style block

#### Scenario: Font values without a library
- **WHEN** completion runs after `font ` in a host analysing without fonts
- **THEN** the items are the seventeen bundled families, quoted

### Requirement: Hover
`hover(analysis, offset)` SHALL describe the token under the cursor in Markdown:

- an element: its kind, label, description, written or default position and size, and ports;
- a relation: its endpoints, label and route;
- a port: its side and position;
- a keyword or style property: one line from the language reference;
- a theme: its base and frame;
- an icon reference: its pack, licence and a preview image;
- the value of a `font` style property or theme token: the family the text is measured with (a bundled family with its group, or a project font), or that no bundled or project family matches and the text is measured with estimates.

#### Scenario: Element hover
- **WHEN** the cursor is on `api` in `client -> api` and `api` is declared as `api["API Gateway"]` with `place api at (360, 180)`
- **THEN** the hover names the kind `node`, the label `API Gateway`, the position (360, 180) and the default size

#### Scenario: Font hover
- **WHEN** the cursor is on `"Roboto"` in `style api { font "Roboto" }`, then on `"Comic Sans MS"` in `style db { font "Comic Sans MS" }`
- **THEN** the first hover says the text is measured with Roboto (sans, bundled), and the second says no bundled or project family matches `Comic Sans MS` and the text is measured with estimates
