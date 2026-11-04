## MODIFIED Requirements

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

### Requirement: Width, pattern and arrowhead properties
Style blocks, classes and rules SHALL accept these properties:

- `width <number>` from 0 to 16 sets the outline width of an element or the connector width of a relation;
- `radius <number>` from 0 to 64 (with or without `px`) sets the corner radius of an element drawn as a rounded rectangle (nodes, `rounded` boxes, notes) or of a group, overriding the theme's `radius` or `groupRadius`; it is clamped to half the shorter side when drawn; `rectangle`, `square` and `pill` boxes and the polygon shapes ignore it;
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

#### Scenario: Radius on a relation
- **WHEN** `style request { radius 4 }` targets a relation
- **THEN** `prop.invalid-value` is reported on `radius` with the hint that it applies to elements

#### Scenario: Heads at both ends
- **WHEN** `style own { arrowtail diamond; arrowhead triangleOutline }` targets the relation `a -> b as own`
- **THEN** `own` is drawn with a filled diamond at `a` and an outlined triangle at `b`

#### Scenario: Head on an element
- **WHEN** `style api { arrowtail bar }` targets a node
- **THEN** `prop.invalid-value` is reported on `arrowtail` with the hint that it applies to relations
