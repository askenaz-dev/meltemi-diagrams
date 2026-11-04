# style-classes-and-rules Specification

## Purpose
Reusable style classes, built-in classes, kind rules, the style precedence and the `width`, `pattern` and `arrowhead` properties.
## Requirements
### Requirement: Class declarations
`class <id> { <style properties> }` SHALL declare a reusable set of style properties at the top level of a flow diagram or inside a theme block. A class SHALL accept the style properties `icon`, `fill`, `stroke`, `color`, `line`, `width`, `pattern` and `arrowhead`, with the same values as a `style` block. The checks SHALL be:

- `class` inside a class is `prop.unknown`, because classes do not chain;
- a class declared twice in the same diagram or theme is `ref.duplicate-id` on the second declaration;
- a class inside a group is `prop.unknown`;
- a class without an id or without a block is `prop.invalid-value`.

Classes SHALL have their own namespace, so a class may share its id with an element.

#### Scenario: Class in a diagram
- **WHEN** a diagram contains `class critical { stroke danger; width 2 }`
- **THEN** the diagram lists one class `critical` with `stroke` `@danger` and `width` 2

#### Scenario: Class in a theme
- **WHEN** a theme block contains `class proposed { line dashed; stroke warning }`
- **THEN** the theme definition lists the class `proposed`, and no `prop.unknown` is reported

#### Scenario: Chained class
- **WHEN** a class block contains `class other`
- **THEN** `prop.unknown` is reported on `class`, with the hint that classes cannot apply other classes

#### Scenario: Duplicate class
- **WHEN** a diagram declares `class hot { fill "#fee" }` twice
- **THEN** `ref.duplicate-id` is reported on the second `hot`, with a related range on the first

### Requirement: Applying classes
A `class <id>[, <id>…]` property SHALL apply classes to an element when written in its declaration block, to a relation when written in the relation block, and to every target of a `style` statement. The model SHALL record the class names with their ranges, in the order written, on the element, the relation or the style entry. A class name SHALL resolve, in this order, to:

1. a class of the diagram;
2. a class of the diagram's theme or one of its bases, the most specific theme first;
3. a built-in class.

A name that resolves to none SHALL be `theme.unknown-class` (warning) on the name, reported by project compilation, which knows the theme scope. The layout SHALL ignore unknown class names. A `class` property repeated for the same target by a later `style` statement SHALL be `prop.duplicate`; the class of an element block and the class of a `style` statement both apply.

#### Scenario: Class on an element and a relation
- **WHEN** a diagram contains `api["API"] { class critical }` and `api -> db as save { class proposed }`
- **THEN** `api` has the classes `critical`, the relation `save` has `proposed`, and their ranges point at the names

#### Scenario: Class in a style statement
- **WHEN** a diagram contains `style api, db { class critical }`
- **THEN** two style entries record the class `critical`

#### Scenario: Unknown class
- **WHEN** a file in a project applies `class hot` and neither the diagram, its theme chain nor the built-in classes define `hot`
- **THEN** `theme.unknown-class` is reported as a warning on `hot`, with the classes in scope in the hint

#### Scenario: Class from an imported theme
- **WHEN** a diagram sets `theme "company.corporate"`, imported from a file whose theme `corporate` declares `class external`, and applies `class external`
- **THEN** project compilation reports no `theme.unknown-class`, and the layout applies the class

### Requirement: Built-in classes
Every built-in theme SHALL provide these classes, which file themes inherit:

| Class | Properties |
|---|---|
| `highlight` | `stroke accent; width 2` |
| `critical` | `stroke danger; width 2` |
| `proposed` | `line dashed; stroke warning` |
| `deprecated` | `pattern hatch; stroke muted; color muted` |
| `external` | `line dashed; stroke muted` |

A class of the same name in a file theme or a diagram SHALL shadow the built-in class.

#### Scenario: Built-in class
- **WHEN** a node applies `class proposed` under `technical.light`
- **THEN** its rect is dashed with the `warning` colour of the theme

#### Scenario: Shadowed built-in class
- **WHEN** a diagram declares `class proposed { stroke "#000000" }` and a node applies `class proposed`
- **THEN** the rect stroke is `#000000` and the rect is not dashed

### Requirement: Kind rules
`rule <kind> { <style properties> }` SHALL apply style properties to every element of a kind (`node`, `decision`, `data`, `group`, `note`, `tag`) or to every relation (`relation`). Rules SHALL be accepted at the top level of a flow diagram and inside theme blocks, and SHALL take the class properties without `class`. `rule node` and `rule box` MAY set `shape`; `rule group`, `rule node`, `rule box` and `rule note` MAY set `radius`. The checks SHALL be:

- an unknown kind is `prop.invalid-value` listing the kinds;
- a property set twice for the same kind in one diagram or theme is `prop.duplicate`;
- `class` inside a rule is `prop.unknown`;
- `shape` in a rule for a kind other than `node` or `box` is `prop.invalid-value`.

#### Scenario: Rule for data stores
- **WHEN** a diagram contains `rule data { pattern dots }` and two data stores
- **THEN** both stores are drawn with a dots pattern

#### Scenario: Square groups by rule
- **WHEN** a diagram contains `rule group { radius 0 }` and two groups
- **THEN** both group rects have `rx` 0

#### Scenario: Shape in a rule for decisions
- **WHEN** a diagram contains `rule decision { shape hexagon }`
- **THEN** `prop.invalid-value` is reported on `shape`, naming `node` and `box`

#### Scenario: Unknown kind
- **WHEN** a diagram contains `rule service { fill "#fff" }`
- **THEN** `prop.invalid-value` is reported on `service` and the message lists `node, decision, data, group, note, tag, relation`

#### Scenario: Rule in a theme
- **WHEN** a theme block contains `rule relation { arrowhead open }` and a diagram uses the theme
- **THEN** every connector of the diagram ends in an open arrowhead

### Requirement: Style precedence
For every element and relation, the layout SHALL resolve each style property by taking the last value set in this order:

1. the theme tokens;
2. the rules of the theme chain, from the base theme to the most specific;
3. the diagram's rules;
4. the applied classes: first those of the declaration block, then those of `style` statements in source order;
5. the explicit properties of `style` statements.

A diagram without `theme` SHALL use the project's default theme, when there is one, for steps 1 and 2. Animation state SHALL be applied on top of the result.

#### Scenario: Order of application
- **WHEN** the theme has `rule node { fill "#111111" }`, the diagram has `rule node { fill "#222222"; stroke "#222222" }`, `api` applies a class with `stroke "#333333"`, and `style api { fill "#444444" }` is set
- **THEN** `api` is filled `#444444` with stroke `#333333`, and every other node is filled `#222222` with stroke `#222222`

#### Scenario: Later class wins
- **WHEN** `api["API"] { class a, b }` applies classes `a` (`fill "#aaaaaa"`) and `b` (`fill "#bbbbbb"`)
- **THEN** `api` is filled `#bbbbbb`

### Requirement: Width, pattern and arrowhead properties
Style blocks, classes and rules SHALL accept these properties:

- `width <number>` from 0 to 64 sets the outline width of an element, the connector width of a relation or the width of a pen stroke (a pen refuses 0);
- `radius <number>` from 0 to 64 (with or without `px`) sets the corner radius of an element or a group: the corners of `rounded`, `rectangle`, `square` and `framed` boxes and nodes, notes and free frames, the vertices of the polygon shapes (`diamond` and decisions, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `arrow`, `flag`, `callout`) and the body of `person` and `agent`, overriding the theme's `radius` (on `rounded` boxes, notes and frames) or `groupRadius` (on groups); without it the other shapes keep square corners and sharp vertices. It is clamped to half the shorter side when drawn, and to half of each edge on a polygon. `ellipse`, `circle`, `pill`, `cylinder`, `cloud` and `document` ignore it;
- `pattern none|hatch|dots|cross` overlays an element with a pattern in its stroke colour at 35 % opacity, so meaning does not depend on colour alone;
- `arrowhead <head>` sets the head at the target end of a relation, and `arrowtail <head>` the head at its source end, where `<head>` is `none`, `triangle`, `triangleOutline`, `open`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`, `oneOrMany`, `zeroOrMany`, `zeroOrOne` or `onlyOne`; without `arrowtail` a relation has no start head, or its end's head when it is written `<->` or `<-->`;
- `line solid|dashed|dotted` sets the line of a relation or the outline of an element;
- `corners sharp|rounded` rounds the bends of a relation's straight and elbow routes.

`pattern` or `radius` on a relation target, and `arrowhead`, `arrowtail` or `corners` on an element target other than a free line or a pen, of a `style` statement or a rule SHALL be `prop.invalid-value`. In a class, the property that does not apply to the target SHALL be ignored. A `width` or `radius` outside its range SHALL be `prop.invalid-value`. Patterns SHALL appear in the scene as pattern definitions referenced by an overlay shape, and in the SVG as `<pattern>` elements in `<defs>`.

#### Scenario: Hatched element
- **WHEN** `style legacy { pattern hatch }` is set on a node
- **THEN** the scene declares one hatch pattern in the node's stroke colour, the node group holds an overlay rect filled `url(#<pattern id>)`, and the SVG contains a `<pattern` element

#### Scenario: Pattern on a relation
- **WHEN** `style request { pattern dots }` targets a relation
- **THEN** `prop.invalid-value` is reported on `pattern` with the hint that patterns apply to elements

#### Scenario: Connector width
- **WHEN** `style request { width 3 }` targets a relation
- **THEN** its polyline has stroke width 3

#### Scenario: Width out of range
- **WHEN** a style block contains `width 80`
- **THEN** `prop.invalid-value` is reported on `80` naming the range 0 to 64

#### Scenario: Radius on a box and a group
- **WHEN** `style api { radius 2 }` targets a node and `style backend { radius 0 }` a group under `technical.light`
- **THEN** the node's rect has `rx` 2 and the group's rect `rx` 0, while other nodes keep 8 and other groups 14

#### Scenario: Radius clamped
- **WHEN** `style a { radius 64 }` targets a 160 × 56 node
- **THEN** its rect has `rx` 28

#### Scenario: Radius on a square and a hexagon
- **WHEN** `style a { shape square; radius 12 }` and `style h { shape hexagon; radius 10 }` target two nodes, and `style s { shape square }` a third
- **THEN** `a` is drawn with corners of radius 12, each corner of `h` is a curve that starts 10 px from its vertex along both edges, and `s` keeps square corners

#### Scenario: Radius ignored by a circle
- **WHEN** `style c { shape circle; radius 12 }` targets a node
- **THEN** `c` is drawn as the same circle as without `radius`, and nothing is reported

#### Scenario: Radius on a relation
- **WHEN** `style request { radius 4 }` targets a relation
- **THEN** `prop.invalid-value` is reported on `radius` with the hint that it applies to elements

#### Scenario: Heads at both ends
- **WHEN** `style own { arrowtail diamond; arrowhead triangleOutline }` targets the relation `a -> b as own`
- **THEN** `own` is drawn with a filled diamond at `a` and an outlined triangle at `b`

#### Scenario: Head on an element
- **WHEN** `style api { arrowtail bar }` targets a node
- **THEN** `prop.invalid-value` is reported on `arrowtail` with the hint that it applies to relations

#### Scenario: Heads in a rule for lines
- **WHEN** a free diagram has `rule line { arrowhead open }` and `rule pen { arrowhead triangle }`
- **THEN** both rules are accepted and every line ends in an open head and every pen in a triangle

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

### Requirement: Rotation property
Style blocks, classes and rules of flow diagrams and free compositions SHALL accept `rotation <number>` from 0 to 360: the element is drawn turned clockwise by that many degrees about the centre of its box, its outline, text, icon, pattern and outside label with it; 360 draws as 0. It SHALL apply to nodes, decisions, data stores, notes, tags, free boxes, texts, icons and images. `rotation` on a relation SHALL be `prop.invalid-value` as for other element properties; on a group, in a `style` statement, SHALL be `prop.invalid-value` naming the kinds that take it; in the sequence and C4 profiles, in `style` statements, classes and rules, SHALL be `prop.invalid-value`. A value outside the range SHALL be `prop.invalid-value`. Completion SHALL offer `rotation` where it applies, and hover SHALL describe it.

#### Scenario: Turned node
- **WHEN** `style api { rotation 30 }` targets a node placed at (200, 100)
- **THEN** the scene's group of `api` has `transform="rotate(30 200 100)"` and its rect is the unturned box

#### Scenario: Rotation from a rule
- **WHEN** a free composition has `rule text { rotation 90 }` and two texts
- **THEN** both texts are drawn turned by 90 degrees

#### Scenario: Rotation on a group
- **WHEN** `style g { rotation 45 }` targets a group
- **THEN** `prop.invalid-value` is reported on `rotation`, naming the kinds that take it, and `g` is drawn unturned

#### Scenario: Rotation in a sequence diagram
- **WHEN** a sequence diagram writes `style web { rotation 10 }`
- **THEN** `prop.invalid-value` is reported on `rotation`

#### Scenario: Rotation out of range
- **WHEN** a style block contains `rotation 400`
- **THEN** `prop.invalid-value` is reported on `400` naming the range 0 to 360

### Requirement: Text properties in every profile
Style blocks, classes and rules of every profile SHALL accept three text properties:

- `font "<stack>"`, a quoted, non-empty CSS font stack, the family the target's text is measured, embedded, outlined and drawn with (the first bundled or project family of the stack; estimates and one `layout.unmeasured-font` per diagram naming the stack when none is);
- `fontSize <number>` from 6 to 160, the size of the target's text;
- `fontWeight 400|500|600|700`, its weight.

They SHALL apply to every target that draws text: elements of the kinds `node`, `decision`, `data`, `datastore`, `note`, `tag`, `group`, `box`, `text` and `sticky`, sequence participants and C4 entities; relations and free lines (their label, and the technology line of a C4 relation); and the sequence events `note` and `fragment`. Without them a target SHALL keep the theme's size and weight of its kind: `labelSize` and `labelWeight` for nodes, decisions, data stores, entities, participants and boxes, 1.6 × `labelSize` for texts, 1.2 × `labelSize` at 400 for stickies, `groupTitleSize` for a group's title, `noteSize` at 400 for notes, `tagSize` at 500 for tags, `relationLabelSize` at 500 for relation labels, at 400 for sequence messages and at 600 for a fragment's operator. The three SHALL be `prop.invalid-value` on `icon`, `image` and `pen` targets of `style` statements and rules, with the hint that they apply to targets that draw text, and a class carrying them SHALL ignore them on such a target. An empty `font`, a `fontSize` outside 6 to 160 and a `fontWeight` that is not one of the four SHALL be `prop.invalid-value` naming the expected value. `textAlign`, `verticalAlign` and `opacity` SHALL stay free-only. The model SHALL store `font` as a string, the sizes as numbers, and the model JSON SHALL carry them in the style entry.

#### Scenario: Text properties on a flow node
- **WHEN** a flow diagram contains `style api { font "Roboto"; fontSize 16; fontWeight 500 }`
- **THEN** the style entry of `api` has `font` `Roboto`, `fontSize` 16 and `fontWeight` 500, no diagnostic is reported, and the model JSON of the diagram carries the three in that entry

#### Scenario: A rule sizes every note
- **WHEN** a sequence diagram contains `rule note { fontSize 12; font "Caveat" }`
- **THEN** every note is measured and drawn in Caveat at 12 px, and a note with `style n1 { fontSize 14 }` is drawn at 14 px in Caveat

#### Scenario: Font on an image
- **WHEN** a free composition contains `style logo { font "Lora" }` on an image and `class big { fontSize 24 }` applied to that image
- **THEN** `prop.invalid-value` is reported on the style's `font` with the hint that it applies to targets that draw text, and the class's `fontSize` is ignored without a diagnostic

#### Scenario: Values that do not fit
- **WHEN** a diagram contains `style a { font ""; fontSize 200; fontWeight 650 }`
- **THEN** `prop.invalid-value` is reported on `""` naming a non-empty quoted font stack, on `200` naming the range 6 to 160, and on `650` listing 400, 500, 600 and 700

#### Scenario: Alignment stays free-only
- **WHEN** a flow diagram contains `style api { fontSize 15; textAlign left }`
- **THEN** `fontSize` is recorded and `prop.invalid-value` is reported on `textAlign` with the hint naming free diagrams and the three free-only properties

