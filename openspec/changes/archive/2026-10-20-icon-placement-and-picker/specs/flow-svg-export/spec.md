## MODIFIED Requirements

### Requirement: Manual layout geometry
`layoutDiagram` SHALL produce a scene for a flow diagram whose non-group elements all have a `place`, or whose positions an engine arranges (see `layout-modes`). Each element box SHALL be centred on its `place`. Its size SHALL be the `size` statement, or the default size of its kind when `size` is absent:

- `node` 160 x 56 and `data` 160 x 64, widened when the widest measured text line (label or description) plus 16 px on each side is larger, and when an icon beside the text (`iconPosition left` or `right`) needs the room, or taller for one above or below it (`top`, `bottom`);
- `decision` 160 x 80, grown until its text fits the diamond's inscribed area, as a shaped node does;
- a `node` with a `shape` takes that shape's default size and grows until its text fits the shape's inscribed area; `shape icon` is 64 x 64, or `iconSize` when a number is written, grown by half the theme padding on each side when `fill`, `stroke` or `pattern` frames it, with its label outside;
- a `node` or `data` with `iconPosition center` 120 x 120, widened for its label;
- `tag`: measured text width plus 18, by 18;
- `note`: longest measured line by 18 per line plus 4.

A group without `place` and `size` SHALL take the bounding box of its children expanded by 16 px on the sides and bottom and by its header on top: 40 px for a titled group, widened to fit its measured title, and 16 px for an untitled one (label `""`, no description, no styled icon); a child drawn with `shape icon` counts with its label. With both statements it SHALL use them. The canvas SHALL be the bounding box of every item plus a 20 px margin.

#### Scenario: Placed nodes with and without size
- **WHEN** `api` is placed at (360, 180) with size (200, 56) and `db` is placed at (700, 180) without size
- **THEN** the scene has a 200 x 56 rect centred on (360, 180) for `api` and a 160 x 56 rect centred on (700, 180) for `db`

#### Scenario: Default size grows to fit a long label
- **WHEN** `svc["Payments reconciliation service"]` is placed without size and the label measures more than 128 px
- **THEN** its rect is as wide as the label plus 32 px, rounded up, and as tall as the default 56 px

#### Scenario: Decision grows until its text fits the diamond
- **WHEN** `decision ok "Approved?"` and `decision long "Is the payment approved by risk?"` are placed without size
- **THEN** `ok` keeps the default 160 x 80, and `long` is 80 tall, wider than a `node` with the same label, and has every corner of its label's glyphs inside the diamond

#### Scenario: Icon below the text grows the node
- **WHEN** `api["API"]` has `style api { icon "tabler:server"; iconPosition bottom; iconSize 40 }` and no size
- **THEN** its rect is taller than 56 px, the icon is drawn 40 px wide under the label, and both lie inside the rect with the theme padding

#### Scenario: Icon shape in a group
- **WHEN** `group g` without placement holds `fn` with `style fn { icon "aws:lambda"; shape icon }` placed at (100, 100)
- **THEN** the group rect encloses the icon's square and the label under it, expanded by its padding

#### Scenario: Group derived from its children
- **WHEN** group `backend` has no placement and contains `api` at (100, 100) and `db` at (300, 100), both 160 x 56
- **THEN** the group rect spans x 4..396 and y 32..144 and is drawn before its children

#### Scenario: Untitled group derived from its children
- **WHEN** `group backend ""` has no placement and contains `api` at (100, 100) and `db` at (300, 100), both 160 x 56
- **THEN** the group rect spans x 4..396 and y 56..144, holds no text item, and is drawn before its children

#### Scenario: Missing placement in manual layout
- **WHEN** a `layout manual` diagram declares `cache` without a `place`
- **THEN** `layout.missing-placement` is reported on the declaration of `cache` and no scene is produced

#### Scenario: Unplaced elements in assisted layout
- **WHEN** a `layout assisted` diagram has one element without `place` and no engine is given
- **THEN** `layout.mode-unsupported` is reported on the `layout` property and no scene is produced; with the ELK engine, or with every element placed, a scene is produced
