## MODIFIED Requirements

### Requirement: Portable SVG
`renderSvg(scene)` SHALL emit a standalone SVG with:

- `xmlns`, `width`, `height` and `viewBox`;
- a background rect;
- `<title>` and `<desc>` from the diagram title and description when present;
- a `<defs>` block with `<linearGradient>`, `<radialGradient>` and `<pattern>` entries only when the scene declares gradients or patterns, with `gradientUnits`, `gradientTransform` and stop opacity when given;
- inline presentation attributes otherwise;
- escaped text;
- baselines taken from the scene's text items;
- a `transform` attribute on groups that carry one;
- a `<g data-id="...">` wrapper for every element and relation, and `<g data-id="<pack>:<name>" data-role="icon">` for every icon, holding only paths;
- `opacity` and `fill-rule` on paths that carry them.

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

#### Scenario: Icons as paths
- **WHEN** a diagram with `style api { icon "tabler:server" }` is rendered
- **THEN** the SVG contains `<g data-id="tabler:server" data-role="icon" transform="translate(`, its children are `<path` elements with `stroke-linecap="round"`, and it contains no `<use`, `<image` or `<symbol`
