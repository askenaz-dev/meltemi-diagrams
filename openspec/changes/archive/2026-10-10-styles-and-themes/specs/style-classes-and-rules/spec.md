## ADDED Requirements

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
`rule <kind> { <style properties> }` SHALL apply style properties to every element of a kind (`node`, `decision`, `data`, `group`, `note`, `tag`) or to every relation (`relation`). Rules SHALL be accepted at the top level of a flow diagram and inside theme blocks, and SHALL take the class properties without `class`. The checks SHALL be:

- an unknown kind is `prop.invalid-value` listing the kinds;
- a property set twice for the same kind in one diagram or theme is `prop.duplicate`;
- `class` inside a rule is `prop.unknown`.

#### Scenario: Rule for data stores
- **WHEN** a diagram contains `rule data { pattern dots }` and two data stores
- **THEN** both stores are drawn with a dots pattern

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
Style blocks, classes and rules SHALL accept three more properties:

- `width <number>` from 0 to 16 sets the outline width of an element or the connector width of a relation;
- `pattern none|hatch|dots|cross` overlays an element with a pattern in its stroke colour at 35 % opacity, so meaning does not depend on colour alone;
- `arrowhead triangle|open|none` sets the head of a relation.

`pattern` on a relation target, and `arrowhead` on an element target, of a `style` statement or a rule SHALL be `prop.invalid-value`. In a class, the property that does not apply to the target SHALL be ignored. A `width` outside its range SHALL be `prop.invalid-value`. Patterns SHALL appear in the scene as pattern definitions referenced by an overlay shape, and in the SVG as `<pattern>` elements in `<defs>`.

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
