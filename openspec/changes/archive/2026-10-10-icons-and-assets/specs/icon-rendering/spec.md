## ADDED Requirements

### Requirement: Optical normalisation
Icons SHALL be drawn in an `iconSize` square. An icon's optical ratio is the larger side of its content box divided by the larger side of its view box. The content box is the bounding box of its paths, after transforms, grown by half the stroke width. A pack's ratio SHALL be the median over up to 64 of its icons in name order, or the `opticalScale` of its licence entry. Each icon's view box SHALL be scaled to a square of `iconSize × 0.833 / packRatio`, clamped to between 0.75 and 1.25 times `iconSize`, and centred in the icon square.

#### Scenario: Tabler fills its grid
- **WHEN** the ratio of the Tabler pack is computed
- **THEN** it is between 0.8 and 0.87, and a Tabler icon at `iconSize` 18 is drawn with its 24-unit view box scaled to between 17 and 19 px

#### Scenario: Edge-to-edge pack
- **WHEN** a folder pack's icons fill their whole view box
- **THEN** they are drawn about 0.83 times `iconSize`, so their content matches Tabler's

### Requirement: Icon placement
The `icon` style property SHALL draw the icon on its target:

- **nodes, decisions and data stores**, with `iconPosition left`: the icon, a gap of `round(iconSize × 0.4)` and the label and description lines left-aligned, the row centred in the box;
- the same targets with `iconPosition top`: the icon centred above the centred text, the column centred in the box;
- **groups**: before the title, with the icon's centre on the title's centre line;
- **tags and notes**: before the text, or the first line of a note, at 1.3 times the text size;
- **relations**: before the label text inside the pill; a relation with an icon and no label SHALL get an icon-only pill at its label position.

`iconPosition` SHALL apply only to nodes, decisions and data stores. Default box sizes SHALL include the icon, and `layout.text-overflow` SHALL count it. An unresolved icon SHALL draw nothing.

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
