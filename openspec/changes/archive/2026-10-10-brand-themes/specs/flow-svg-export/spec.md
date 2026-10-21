## MODIFIED Requirements

### Requirement: Styles and themes
Element styles SHALL apply `fill`, `stroke`, `color` (label and description text) and `line dashed` (dashed outline). Relation styles SHALL apply `stroke` to the connector and arrowhead, `fill` and `color` to the label pill, and `line` as an override of the arrow style. `fill "none"` SHALL draw no background. The theme SHALL be `meltemi.light` by default; `theme "<name>"` SHALL resolve a theme defined in the file or one of the built-in themes `meltemi.light`, `meltemi.dark`, `studio.light` and `studio.dark`; any other name SHALL report `layout.unknown-theme` as a warning and use the default. The layout SHALL accept a theme name override that takes precedence over the diagram's `theme` property. When the resolved theme has `frame footer` or `frame header`, the scene SHALL add a 44 px strip with a hairline, the Meltemi mark drawn with the theme gradient when `mark` is `meltemi`, the `brand` text and the diagram title; `frame none` SHALL add nothing.

#### Scenario: Dashed proposed element
- **WHEN** `style proxy { line dashed; stroke "#c4552c" }` is set on a placed node
- **THEN** its rect has a dash pattern and the stroke colour `#c4552c`

#### Scenario: Dark relation label
- **WHEN** `style r1 { fill "#1b1f23"; color "#ffffff" }` is set on a labelled relation
- **THEN** the label pill is filled `#1b1f23` with white text and the connector keeps the theme colour

#### Scenario: Unknown theme
- **WHEN** a diagram sets `theme "corporate"`
- **THEN** `layout.unknown-theme` is reported as a warning and the scene uses the `meltemi.light` tokens

#### Scenario: Default frame
- **WHEN** a diagram without a `theme` property is laid out
- **THEN** the scene is 44 px taller than its content, ends with a group of role `frame` holding the mark paths, the text `Meltemi Charts` and the diagram title, and declares one linear gradient

#### Scenario: Neutral theme has no frame
- **WHEN** a diagram sets `theme "studio.light"`
- **THEN** the scene has no `frame` group and no gradient

#### Scenario: Theme override
- **WHEN** a diagram sets `theme "studio.light"` and the layout is called with the override `meltemi.dark`
- **THEN** the scene background is `#07111F` and the frame is present

### Requirement: Portable SVG
`renderSvg(scene)` SHALL emit a standalone SVG with `xmlns`, `width`, `height` and `viewBox`, a background rect, `<title>` and `<desc>` from the diagram title and description when present, a `<defs>` block with `<linearGradient>` entries only when the scene declares gradients, inline presentation attributes otherwise, no `<marker>`, no `<style>`, no `dominant-baseline`, escaped text, a `transform` attribute on groups that carry one, and a `<g data-id="...">` wrapper for every element and relation. Rendering the same scene twice SHALL give identical text.

#### Scenario: Structure
- **WHEN** the annotations corpus file is exported
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
