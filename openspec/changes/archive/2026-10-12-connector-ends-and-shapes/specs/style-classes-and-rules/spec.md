## MODIFIED Requirements

### Requirement: Width, pattern and arrowhead properties
Style blocks, classes and rules SHALL accept these properties:

- `width <number>` from 0 to 16 sets the outline width of an element or the connector width of a relation;
- `pattern none|hatch|dots|cross` overlays an element with a pattern in its stroke colour at 35 % opacity, so meaning does not depend on colour alone;
- `arrowhead <head>` sets the head at the target end of a relation, and `arrowtail <head>` the head at its source end, where `<head>` is `none`, `triangle`, `triangleOutline`, `open`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`, `oneOrMany`, `zeroOrMany`, `zeroOrOne` or `onlyOne`; without `arrowtail` a relation has no start head, or its end's head when it is written `<->` or `<-->`;
- `line solid|dashed|dotted` sets the line of a relation or the outline of an element;
- `corners sharp|rounded` rounds the bends of a relation's straight and elbow routes.

`pattern` on a relation target, and `arrowhead`, `arrowtail` or `corners` on an element target, of a `style` statement or a rule SHALL be `prop.invalid-value`. In a class, the property that does not apply to the target SHALL be ignored. A `width` outside its range SHALL be `prop.invalid-value`. Patterns SHALL appear in the scene as pattern definitions referenced by an overlay shape, and in the SVG as `<pattern>` elements in `<defs>`.

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

#### Scenario: Heads at both ends
- **WHEN** `style own { arrowtail diamond; arrowhead triangleOutline }` targets the relation `a -> b as own`
- **THEN** `own` is drawn with a filled diamond at `a` and an outlined triangle at `b`

#### Scenario: Head on an element
- **WHEN** `style api { arrowtail bar }` targets a node
- **THEN** `prop.invalid-value` is reported on `arrowtail` with the hint that it applies to relations
