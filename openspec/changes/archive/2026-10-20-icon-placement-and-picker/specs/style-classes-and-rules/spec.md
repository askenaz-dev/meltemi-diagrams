## MODIFIED Requirements

### Requirement: Icon style properties
Style blocks, classes and rules SHALL accept:

- `iconColor`, a quoted colour or a colour token name, which paints monochrome icons;
- `iconPosition left|right|top|bottom|center`, which places the icon of a node, decision, data store or box: beside or above or below the text, the icon and the text forming one row or column centred in the text area, or, with `center`, as the picture of the box with the label at an edge;
- `labelPosition top|bottom|left|right`, the edge the label sits at when the icon is the centre piece (`iconPosition center`, inside the box; `shape icon`, outside the icon); `bottom` by default;
- `iconSize auto` or a number from 8 to 128 (px or unitless), the icon's side: `auto` fits the box (or is the icon shape's default size); the theme's `iconSize` stays the default beside text. A number in a box without `size` grows the box to hold the icon; a written `size` clamps the icon to the room it has.

They follow the same precedence as the other properties, so `rule data { icon "tabler:database" }` gives every data store an icon. `iconPosition`, `labelPosition` or `iconSize` on a relation target of a `style` statement or a relation rule SHALL be `prop.invalid-value`. `iconColor` with a bare word that is not a colour token SHALL be `prop.invalid-value`. A `labelPosition` on an element whose icon is not the centre piece, groups included, SHALL be reported by the layout as `layout.label-position-ignored` (warning) with the hint to set `iconPosition center` or `shape icon`; on groups, tags, notes, free texts, icons, images and C4 entities, whose icon is never the centre piece, the hint SHALL be to remove it. A `labelPosition` that a theme's rule or class gives SHALL be reported once, on the diagram's `theme`, when none of the elements it styles has its icon as the centre piece.

#### Scenario: Icon for every data store
- **WHEN** a diagram contains `rule data { icon "tabler:database"; iconColor accent }` and two data stores
- **THEN** both stores are drawn with the Tabler database icon in the theme accent

#### Scenario: Icon position on a relation
- **WHEN** a style statement targeting a relation contains `iconPosition top`
- **THEN** `prop.invalid-value` is reported on `iconPosition` with the hint that it applies to elements

#### Scenario: Icon at the right, sized
- **WHEN** `style api { icon "tabler:server"; iconPosition right; iconSize 32 }` targets a node without `size`
- **THEN** the icon is drawn 32 px wide right of the label, the node is wide enough for both with the theme padding, and the style entry records `iconSize` 32

#### Scenario: Icon size out of range or on a relation
- **WHEN** a style block contains `iconSize 200`, and another targets a relation with `iconSize 24`
- **THEN** `prop.invalid-value` is reported on `200` naming 8 to 128, and on the relation's `iconSize` with the hint that it applies to elements

#### Scenario: Label position without a centred icon
- **WHEN** `style api { icon "tabler:server"; labelPosition top }` targets a node with the default icon position
- **THEN** `layout.label-position-ignored` is reported on `labelPosition` with the hint to set `iconPosition center` or `shape icon`, and the node draws as without it

#### Scenario: Label position from a theme
- **WHEN** a theme has `rule node { labelPosition top }` and a diagram drawn with it has three nodes without centred icons
- **THEN** `layout.label-position-ignored` is reported once, on the diagram's `theme`, not on each node

#### Scenario: Label position on a group
- **WHEN** `style g { icon "tabler:server"; labelPosition top }` targets a group
- **THEN** `layout.label-position-ignored` is reported on `labelPosition` with the hint to remove it, and the group draws as without it
