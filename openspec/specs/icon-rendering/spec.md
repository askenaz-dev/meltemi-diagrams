# icon-rendering Specification

## Purpose
Optical normalisation, placement next to the label, colour and scene shape of icons on every element kind and on relation labels.
## Requirements
### Requirement: Optical normalisation
Icons SHALL be drawn in an `iconSize` square. An icon's optical ratio is the larger side of its content box divided by the larger side of its view box. The content box is the bounding box of its paths, after transforms, grown by half the stroke width. A pack's ratio SHALL be the median over up to 64 of its icons in name order, or the `opticalScale` of its licence entry. Each icon's view box SHALL be scaled to a square of `iconSize × 0.833 / packRatio`, clamped to between 0.75 and 1.25 times `iconSize`, and centred in the icon square. The icon of an element drawn with `shape icon` is the shape itself: its view box SHALL fill the icon square, without the pack's optical scale.

#### Scenario: Tabler fills its grid
- **WHEN** the ratio of the Tabler pack is computed
- **THEN** it is between 0.8 and 0.87, and a Tabler icon at `iconSize` 18 is drawn with its 24-unit view box scaled to between 17 and 19 px

#### Scenario: Edge-to-edge pack
- **WHEN** a folder pack's icons fill their whole view box
- **THEN** they are drawn about 0.83 times `iconSize`, so their content matches Tabler's

#### Scenario: An icon shape fills its square
- **WHEN** `fn["Lambda"]` has `style fn { icon "tabler:server"; shape icon }` and no `size`
- **THEN** the icon's 24-unit view box is scaled to the whole 64 px square, `scale(2.667)`, not to the Tabler ratio

### Requirement: Icon placement
The `icon` style property SHALL draw the icon on its target:

- **nodes, decisions, data stores and boxes**, with `iconPosition left` or `right`: the icon, a gap and the label and description lines left-aligned, the icon before the lines (`left`) or after them (`right`), the row centred in the shape's text area;
- the same targets with `iconPosition top` or `bottom`: the icon centred above or below the centred text, the column centred in the text area;
- the same targets with `iconPosition center`: the label and the description in a band inside the box at the `labelPosition` edge (`bottom` by default), and the icon centred in the rest of the text area, as large as fits with the theme padding around it, or the written `iconSize` when that is smaller;
- **nodes and boxes drawn with `shape icon`**: the icon alone, filling the element's square, and the label and description outside it at `labelPosition`;
- **C4 entities** (persons, software systems, containers, data stores and components): `left`, `right`, `top` and `bottom` as nodes draw them; `center` is drawn as `top`, since their kind decides their drawing;
- **groups**: before the title, with the icon's centre on the title's centre line;
- **tags and notes**: before the text, or the first line of a note, at 1.3 times the text size;
- **relations**: before the label text inside the pill; a relation with an icon and no label SHALL get an icon-only pill at its label position.

The icon beside the text SHALL be the element's `iconSize` when a number is written, else the theme's `iconSize`; `auto` beside the text is the theme's size in a box without `size` and fills the room the text leaves in a box with one. With `center` the icon SHALL fit the room above, below or beside the label unless a smaller number is written, and with `shape icon` it SHALL fill the element's square, inside its frame when one is drawn. The gap SHALL be `round(iconSize × 0.4)`, that of a 24 px icon when a larger `iconSize` is written on the element. `iconPosition`, `labelPosition` and `iconSize` SHALL not move or size the icons of groups, tags, notes and relations. Default box sizes SHALL include the icon, and `layout.text-overflow` SHALL count it. An unresolved icon SHALL draw nothing, except in an icon shape, which draws its dashed placeholder.

#### Scenario: Icon left of the label
- **WHEN** `api["API Gateway"]` has `icon "tabler:server"` under `technical.light`
- **THEN** the node group holds an `icon` group whose square ends a gap before the label text, the label is anchored at its start, and the box is wider than the same node without the icon

#### Scenario: Icon above the label
- **WHEN** the same node has `iconPosition top`
- **THEN** the icon is centred horizontally above the label, the label is centred, and the box is taller than without the icon

#### Scenario: Relation pill
- **WHEN** `a -> b as call` has `icon "tabler:lock"` and no label
- **THEN** the relation group holds a pill containing only the icon at the middle of the route

#### Scenario: Overflow counts the icon
- **WHEN** `size api (120, 56)` is set on a node whose label fits 120 px without its icon but not with it
- **THEN** `layout.text-overflow` is reported

#### Scenario: Icon right of the label on a box
- **WHEN** free `box api "API"` has `style api { icon "tabler:server"; iconPosition right }`
- **THEN** the label is anchored at its start and the icon's square begins a gap after the label's end

#### Scenario: A large icon keeps a 24 px icon's gap
- **WHEN** `big["Big"]` has `style big { icon "tabler:server"; iconSize 40 }`
- **THEN** the icon is 40 px wide and its square ends 10 px before the label, `round(24 × 0.4)`, not 16

#### Scenario: Centred on a C4 entity
- **WHEN** a C4 container has `style shop.web { icon "tabler:world"; iconPosition center }`
- **THEN** its icon is drawn above its text, as with `iconPosition top`

### Requirement: Icon colour and scene shape
Monochrome icons are icons whose paints are only `currentColor`, black or unset. They SHALL be painted with `iconColor`, else the target's text colour: the label colour of boxes and groups, `tagText` for tags, `muted` for notes, the label colour of relation pills. Other icons SHALL keep their paints, and their gradients SHALL become scene gradients with ids unique in the scene. An icon SHALL appear in the scene as a group with role `icon`, id equal to its reference, and a `translate(x y) scale(s)` transform, containing paths in view-box units with their fill, stroke, stroke width, opacity, fill rule and round caps and joins.

#### Scenario: Icon colour
- **WHEN** a node with a Tabler icon has `iconColor accent` under `technical.dark`
- **THEN** every path of its icon has stroke `#3B82F6`, and its label keeps the theme ink

#### Scenario: Multicolour icon
- **WHEN** a node uses `aws:lambda`, whose paths are orange and white
- **THEN** the paths keep `#ED7100` and `#FFFFFF` whatever `iconColor` says

#### Scenario: Two icons with gradients
- **WHEN** two nodes use the same icon with a linear gradient
- **THEN** the scene declares two gradients with different ids, and each icon refers to its own

