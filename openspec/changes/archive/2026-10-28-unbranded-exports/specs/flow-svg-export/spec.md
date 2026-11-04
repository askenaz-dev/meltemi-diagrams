## MODIFIED Requirements

### Requirement: Styles and themes
Element styles SHALL apply `fill`, `stroke`, `color` (label and description text), `line dashed` (dashed outline), `width` (outline width), `radius` (corner radius of rounded rectangles and groups, over the theme's `radius` or `groupRadius`; of `rectangle`, `square` and `framed` nodes; the rounded vertices of polygon nodes and decisions), `rotation` (the element's group turned about the centre of its box) and `pattern`. Relation styles SHALL apply `stroke` to the connector and arrowhead, `width` to the connector, `arrowhead` to the head, `fill` and `color` to the label pill, and `line` as an override of the arrow style. `fill "none"` SHALL draw no background. Styles SHALL be resolved with the precedence of the `style-classes-and-rules` capability. The theme SHALL be the project's default theme when the diagram has no `theme`, and `technical.light` otherwise. `theme "<name>"` SHALL resolve a theme in scope or one of the built-in themes `technical.light`, `technical.dark`, `editorial.light`, `editorial.dark`, `stage.light` and `stage.dark`; any other name SHALL report `layout.unknown-theme` as a warning and use the default. The layout SHALL accept a theme name override that takes precedence over the diagram's `theme` property, and a default theme name (`defaultTheme`) used when the diagram has none. When the resolved theme has `frame footer` or `frame header`, the scene SHALL add a strip whose height scales with `frameSize` (44 px at 12 px) with a hairline, the Meltemi mark drawn with the theme gradient when `mark` is `meltemi`, the `brand` text and the diagram title; `frame none` SHALL add nothing. The `brand` token of the `technical.*` and `stage.*` themes SHALL be `Meltemi Diagrams`. The layout SHALL also accept a frame override, `frame: "none"`, applied after the theme resolves and before anything is drawn, in every profile: the scene SHALL then be laid out as if the theme had `frame none`, with every other token of the theme (palette, fonts, sizes, arrowheads, sketch) unchanged; without the override the theme's own `frame` SHALL apply, and the override SHALL change no diagnostic.

#### Scenario: Dashed proposed element
- **WHEN** `style proxy { line dashed; stroke "#c4552c" }` is set on a placed node
- **THEN** its rect has a dash pattern and the stroke colour `#c4552c`

#### Scenario: Square node
- **WHEN** `style proxy { radius 0 }` is set on a placed node
- **THEN** its rect has `rx` 0 while the other nodes keep the theme radius

#### Scenario: Rounded decision
- **WHEN** `style choose { radius 8 }` is set on a decision
- **THEN** each of its four corners is drawn as a curve starting 8 px from the vertex, and nothing is reported

#### Scenario: Turned node in the SVG
- **WHEN** `style api { rotation 45 }` is set on a node placed at (300, 120)
- **THEN** the SVG's `<g data-id="api" data-role="element">` carries `transform="rotate(45 300 120)"`, shifted by the scene offset

#### Scenario: Dark relation label
- **WHEN** `style r1 { fill "#1b1f23"; color "#ffffff" }` is set on a labelled relation
- **THEN** the label pill is filled `#1b1f23` with white text and the connector keeps the theme colour

#### Scenario: Unknown theme
- **WHEN** a diagram sets `theme "corporate"`
- **THEN** `layout.unknown-theme` is reported as a warning and the scene uses the `technical.light` tokens

#### Scenario: Default frame
- **WHEN** a diagram without a `theme` property is laid out without a default theme
- **THEN** the scene is 44 px taller than its content, ends with a group of role `frame` holding the mark paths, the text `Meltemi Diagrams` and the diagram title, and declares one linear gradient

#### Scenario: Neutral theme has no frame
- **WHEN** a diagram sets `theme "editorial.light"`
- **THEN** the scene has no `frame` group and no gradient

#### Scenario: Theme override
- **WHEN** a diagram sets `theme "editorial.light"` and the layout is called with the override `technical.dark`
- **THEN** the scene background is `#07111F` and the frame is present

#### Scenario: Default theme option
- **WHEN** a diagram without `theme` is laid out with `defaultTheme` `editorial.dark`, and another diagram with `theme "technical.light"` is laid out with the same option
- **THEN** the first uses the `editorial.dark` tokens and the second keeps `technical.light`

#### Scenario: Frame override on the default theme
- **WHEN** a diagram without a `theme` property is laid out with the option `frame: "none"`
- **THEN** the scene has no `frame` group and no gradient, is 44 px shorter than the same diagram laid out without the option, and its background, fonts, arrowheads and the sizes of its boxes are the same as that diagram's

#### Scenario: Frame override on a sequence diagram with a header theme
- **WHEN** a sequence diagram sets `theme "stage.light"` and is laid out with `frame: "none"`
- **THEN** the scene has no `frame` group, its participants start at the margin instead of under a header strip, and the `stage.light` type sizes and strokes apply

#### Scenario: The override reports nothing of its own
- **WHEN** a diagram sets `theme "corporate"` and is laid out with `frame: "none"`
- **THEN** `layout.unknown-theme` is reported as a warning, exactly as without the option, and the scene uses the `technical.light` tokens with no `frame` group
