## ADDED Requirements

### Requirement: Notes in free compositions
`note <id> "Text" [on <element>]` SHALL be a free kind: `note` joins the free profile's declarations ("Free diagrams compile"), the hint for a flow kind in a free diagram lists it among them, and `rule note { }` is accepted. A free note SHALL require its text, SHALL take `\n` line breaks, and SHALL accept in its block `description`, `class`, `layer`, `link` and `url`. The style properties `fill`, `stroke`, `pattern`, `line`, `width`, `color`, `radius`, `icon`, `iconColor`, `iconSize`, `rotation`, `fontSize`, `fontWeight` and `textAlign` SHALL be accepted on a free note, in `style` statements, classes and rules; `shape` SHALL be refused on it with `prop.invalid-value` naming `node` and `box`, as on texts. `node`, `decision`, `data` and `tag` SHALL stay `prop.unknown` in a free diagram with the hint listing the free kinds. Free notes SHALL appear in model JSON as elements of kind `note`.

#### Scenario: A free note
- **WHEN** a free diagram declares `note hint "Draft\nnot final" { layer front }` with `layers main, front` and `style hint { fill "#fff3bf"; stroke "#e8a600"; textAlign center }`
- **THEN** it compiles without diagnostics, `hint` has kind `note`, a two-line label and layer `front`, and its style entry has `fill`, `stroke` and `textAlign`

#### Scenario: The hint names the free kinds
- **WHEN** a free diagram declares `decision ok "OK?"`
- **THEN** `prop.unknown` is reported with a hint that lists the free kinds, `note` among them

#### Scenario: A note without text
- **WHEN** a free diagram declares `note n`
- **THEN** the declaration reports that `note n` needs its text, with the form `note <id> "Text" [on <element>]`

#### Scenario: Shape on a free note
- **WHEN** a free diagram writes `style n { shape pill }` on a note
- **THEN** `prop.invalid-value` is reported on `shape`, naming `node` and `box`

#### Scenario: Text properties on a flow note
- **WHEN** a flow diagram writes `style limits { textAlign center }` on a note
- **THEN** `prop.invalid-value` is reported, naming free diagrams

## MODIFIED Requirements

### Requirement: Free diagrams compile
`diagram <id>: free { }` SHALL compile into the same diagram model as flow, with `type` set to `free`. It SHALL accept:

- the declarations `box`, `text`, `icon`, `image`, `note` and `group`, and the shorthand `id["Label"]` (a box) and `id[("Label")]` (a box with `shape cylinder`);
- relations `->` and `-->` with labels, ids and blocks;
- `placement` with `place`, `size`, `route`, `label` and the constraints;
- `style`, `class`, `rule` and `animate`;
- the diagram properties of flow and `layers`, with `layout manual` as the default.

Flow kinds (`node`, `decision`, `data`, `tag`) SHALL be `prop.unknown` in a free diagram, with a hint listing the free kinds; `note` is a free kind ("Notes in free compositions").

#### Scenario: The proposal's example
- **WHEN** the free example of the proposal (`text heading`, two boxes, a relation, placement, a route and an animation) is compiled
- **THEN** it compiles without errors, `heading` is a `text` object, `api` and `events` are boxes, and the diagram's layout is `manual`

#### Scenario: Flow kinds in free
- **WHEN** a free diagram declares `decision ok "OK?"`
- **THEN** `prop.unknown` is reported with a hint that lists the free kinds, `note` among them
