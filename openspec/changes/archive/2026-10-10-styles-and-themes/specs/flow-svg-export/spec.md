## MODIFIED Requirements

### Requirement: Styles and themes
Element styles SHALL apply `fill`, `stroke`, `color` (label and description text), `line dashed` (dashed outline), `width` (outline width) and `pattern`. Relation styles SHALL apply `stroke` to the connector and arrowhead, `width` to the connector, `arrowhead` to the head, `fill` and `color` to the label pill, and `line` as an override of the arrow style. `fill "none"` SHALL draw no background. Styles SHALL be resolved with the precedence of the `style-classes-and-rules` capability. The theme SHALL be the project's default theme when the diagram has no `theme`, and `technical.light` otherwise. `theme "<name>"` SHALL resolve a theme in scope or one of the built-in themes `technical.light`, `technical.dark`, `editorial.light`, `editorial.dark`, `stage.light` and `stage.dark`; any other name SHALL report `layout.unknown-theme` as a warning and use the default. The layout SHALL accept a theme name override that takes precedence over the diagram's `theme` property, and a default theme name (`defaultTheme`) used when the diagram has none. When the resolved theme has `frame footer` or `frame header`, the scene SHALL add a strip whose height scales with `frameSize` (44 px at 12 px) with a hairline, the Meltemi mark drawn with the theme gradient when `mark` is `meltemi`, the `brand` text and the diagram title; `frame none` SHALL add nothing. The `brand` token of the `technical.*` and `stage.*` themes SHALL be `Meltemi Diagrams`.

#### Scenario: Dashed proposed element
- **WHEN** `style proxy { line dashed; stroke "#c4552c" }` is set on a placed node
- **THEN** its rect has a dash pattern and the stroke colour `#c4552c`

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

### Requirement: Portable SVG
`renderSvg(scene)` SHALL emit a standalone SVG with:

- `xmlns`, `width`, `height` and `viewBox`;
- a background rect;
- `<title>` and `<desc>` from the diagram title and description when present;
- a `<defs>` block with `<linearGradient>` and `<pattern>` entries only when the scene declares gradients or patterns;
- inline presentation attributes otherwise;
- escaped text;
- baselines taken from the scene's text items;
- a `transform` attribute on groups that carry one;
- a `<g data-id="...">` wrapper for every element and relation.

It SHALL contain no `<marker>`, no `dominant-baseline`, and no `<style>` except the `@font-face` block of the `embedded` font policy. Rendering the same scene twice SHALL give identical text.

#### Scenario: Structure
- **WHEN** the annotations corpus file is exported with the `system` policy
- **THEN** the SVG starts with `<svg xmlns="http://www.w3.org/2000/svg"`, contains `data-id="api"`, contains no `<marker`, no `<style` and no `dominant-baseline`, and matches the stored snapshot

#### Scenario: Escaping
- **WHEN** a label contains `Home & Experience <beta>`
- **THEN** the SVG text contains `Home &amp; Experience &lt;beta&gt;`

#### Scenario: Title and description
- **WHEN** a diagram sets `title "Checkout"` and `description "Purchase path"`
- **THEN** the SVG contains `<title>Checkout</title>` and `<desc>Purchase path</desc>` before any shape

#### Scenario: Gradient definitions
- **WHEN** a scene with the Meltemi frame is rendered
- **THEN** the SVG contains one `<defs>` block with a `<linearGradient id="meltemi-wind"` whose stops are the theme `accent` and `accentEnd`, and the mark group carries a `transform` attribute

#### Scenario: Pattern definitions
- **WHEN** a scene with a dots pattern is rendered
- **THEN** the `<defs>` block contains one `<pattern` with `patternUnits="userSpaceOnUse"`, and the overlay shape references it with `fill="url(#…)"`

### Requirement: Text fits its box
When an explicit `size` gives an element less width than its widest measured text line plus 6 px on each side, the layout SHALL report `layout.text-overflow` (warning) on the `size` statement. The message SHALL name the text, and the hint SHALL give `size <id> (<width>, <height>)` with the comfortable width (text plus the theme `padding` on each side, 16 px in `technical.light`). The same SHALL apply to a group with an explicit size and a wider title. Text SHALL never be scaled down. When a theme font stack has no bundled family, or text contains characters no bundled subset covers, the layout SHALL report `layout.unmeasured-font` (info) once per diagram, listing the font or the characters.

#### Scenario: Explicit size too small
- **WHEN** `size api (80, 56)` is set and the label `API Gateway` measures 79.66 px at 13 px weight 600
- **THEN** `layout.text-overflow` is reported on that `size` statement with the hint `size api (112, 56)`

#### Scenario: Unknown theme font
- **WHEN** a file theme sets `font "Comic Sans MS"` and a diagram uses it
- **THEN** `layout.unmeasured-font` (info) names `Comic Sans MS`, and the scene is produced with estimated widths

#### Scenario: Emoji in a label
- **WHEN** a label is `Deploy 🚀`
- **THEN** `layout.unmeasured-font` (info) lists `🚀`, and the box still fits the rest of the label

#### Scenario: Padding token
- **WHEN** the same `size api (80, 56)` is laid out with a theme that sets `padding 24`
- **THEN** the hint is `size api (128, 56)`
