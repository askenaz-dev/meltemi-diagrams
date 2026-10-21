## MODIFIED Requirements

### Requirement: Width, pattern and arrowhead properties
Style blocks, classes and rules SHALL accept these properties:

- `width <number>` from 0 to 16 sets the outline width of an element or the connector width of a relation;
- `radius <number>` from 0 to 64 (with or without `px`) sets the corner radius of an element or a group: the corners of `rounded`, `rectangle`, `square` and `framed` boxes and nodes, notes and free frames, the vertices of the polygon shapes (`diamond` and decisions, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `arrow`, `flag`, `callout`) and the body of `person` and `agent`, overriding the theme's `radius` (on `rounded` boxes, notes and frames) or `groupRadius` (on groups); without it the other shapes keep square corners and sharp vertices. It is clamped to half the shorter side when drawn, and to half of each edge on a polygon. `ellipse`, `circle`, `pill`, `cylinder`, `cloud` and `document` ignore it;
- `pattern none|hatch|dots|cross` overlays an element with a pattern in its stroke colour at 35 % opacity, so meaning does not depend on colour alone;
- `arrowhead <head>` sets the head at the target end of a relation, and `arrowtail <head>` the head at its source end, where `<head>` is `none`, `triangle`, `triangleOutline`, `open`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`, `oneOrMany`, `zeroOrMany`, `zeroOrOne` or `onlyOne`; without `arrowtail` a relation has no start head, or its end's head when it is written `<->` or `<-->`;
- `line solid|dashed|dotted` sets the line of a relation or the outline of an element;
- `corners sharp|rounded` rounds the bends of a relation's straight and elbow routes.

`pattern` or `radius` on a relation target, and `arrowhead`, `arrowtail` or `corners` on an element target, of a `style` statement or a rule SHALL be `prop.invalid-value`. In a class, the property that does not apply to the target SHALL be ignored. A `width` or `radius` outside its range SHALL be `prop.invalid-value`. Patterns SHALL appear in the scene as pattern definitions referenced by an overlay shape, and in the SVG as `<pattern>` elements in `<defs>`.

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
- **WHEN** a style block contains `width 40`
- **THEN** `prop.invalid-value` is reported on `40` naming the range 0 to 16

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

## ADDED Requirements

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
