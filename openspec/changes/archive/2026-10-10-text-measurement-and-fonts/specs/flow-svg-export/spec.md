## MODIFIED Requirements

### Requirement: Manual layout geometry
`layoutFlow(diagram)` SHALL produce a scene for a flow diagram whose non-group elements all have a `place`. Each element box SHALL be centred on its `place`. Its size SHALL be the `size` statement, or the default size of its kind when `size` is absent:

- `node` 160 x 56, `decision` 160 x 80 and `data` 160 x 64, widened when the widest measured text line (label or description) plus 16 px on each side is larger;
- `tag`: measured text width plus 18, by 18;
- `note`: longest measured line by 18 per line plus 4.

A group without `place` and `size` SHALL take the bounding box of its children expanded by 16 px on the sides and bottom and 40 px on top, widened to fit its measured title. With both statements it SHALL use them. The canvas SHALL be the bounding box of every item plus a 20 px margin.

#### Scenario: Placed nodes with and without size
- **WHEN** `api` is placed at (360, 180) with size (200, 56) and `db` is placed at (700, 180) without size
- **THEN** the scene has a 200 x 56 rect centred on (360, 180) for `api` and a 160 x 56 rect centred on (700, 180) for `db`

#### Scenario: Default size grows to fit a long label
- **WHEN** `svc["Payments reconciliation service"]` is placed without size and the label measures more than 128 px
- **THEN** its rect is as wide as the label plus 32 px, rounded up, and as tall as the default 56 px

#### Scenario: Group derived from its children
- **WHEN** group `backend` has no placement and contains `api` at (100, 100) and `db` at (300, 100), both 160 x 56
- **THEN** the group rect spans x 4..396 and y 32..144 and is drawn before its children

#### Scenario: Missing placement in manual layout
- **WHEN** a `layout manual` diagram declares `cache` without a `place`
- **THEN** `layout.missing-placement` is reported on the declaration of `cache` and no scene is produced

#### Scenario: Unplaced elements in assisted layout
- **WHEN** a `layout assisted` diagram has one element without `place`
- **THEN** `layout.mode-unsupported` is reported on the `layout` property and no scene is produced, and the same diagram with every element placed produces a scene

### Requirement: Labels and annotations
A relation label SHALL render as a pill (surface fill, line stroke) centred on the point at `label ... at <n>%` along the polyline plus the offset, or at 50 % without offset when no `label` statement exists. The pill SHALL be as wide as its measured text plus 12 px, and never narrower than it is tall. The rest SHALL render as follows:

- `note` elements as left-aligned muted text without a border;
- `tag` elements as pills with mono text;
- `data` elements as cylinders;
- `decision` elements as diamonds;
- element descriptions as smaller lines under the label, one per `\n`.

Every text item SHALL carry a baseline equal to its vertical centre plus half the cap height of its measured font times its size.

#### Scenario: Step label beside an arrow
- **WHEN** `a -> b: "1" as r1` is routed vertically and `label r1 at 50% offset (16, 0)` is set
- **THEN** a pill with the text `1` is centred 16 px to the right of the midpoint of the connector

#### Scenario: Note with three lines
- **WHEN** `note limits "Límites a validar\nOBO: 30 RPS\nCIBA: Enterprise"` is placed
- **THEN** the scene has three text items with the same left x, 18 px apart, and no rect for the note

#### Scenario: Shapes by kind
- **WHEN** a diagram places a `data` element, a `decision` element and a `tag`
- **THEN** the scene has a cylinder path, a diamond path and a pill rect respectively, each wrapped in a group carrying the element id

#### Scenario: Baseline from cap height
- **WHEN** a 13 px Inter label is centred at y = 100 and laid out with the bundled measurer
- **THEN** its baseline is 100 + 13 × 0.7275 / 2, rounded to two decimals

### Requirement: Portable SVG
`renderSvg(scene)` SHALL emit a standalone SVG with:

- `xmlns`, `width`, `height` and `viewBox`;
- a background rect;
- `<title>` and `<desc>` from the diagram title and description when present;
- a `<defs>` block with `<linearGradient>` entries only when the scene declares gradients;
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

## ADDED Requirements

### Requirement: Text fits its box
When an explicit `size` gives an element less width than its widest measured text line plus 6 px on each side, the layout SHALL report `layout.text-overflow` (warning) on the `size` statement. The message SHALL name the text, and the hint SHALL give `size <id> (<width>, <height>)` with the comfortable width (text plus 16 px on each side). The same SHALL apply to a group with an explicit size and a wider title. Text SHALL never be scaled down. When a theme font stack has no bundled family, or text contains characters no bundled subset covers, the layout SHALL report `layout.unmeasured-font` (info) once per diagram, listing the font or the characters.

#### Scenario: Explicit size too small
- **WHEN** `size api (80, 56)` is set and the label `API Gateway` measures 79.66 px at 13 px weight 600
- **THEN** `layout.text-overflow` is reported on that `size` statement with the hint `size api (112, 56)`

#### Scenario: Unknown theme font
- **WHEN** a file theme sets `font "Comic Sans MS"` and a diagram uses it
- **THEN** `layout.unmeasured-font` (info) names `Comic Sans MS`, and the scene is produced with estimated widths

#### Scenario: Emoji in a label
- **WHEN** a label is `Deploy 🚀`
- **THEN** `layout.unmeasured-font` (info) lists `🚀`, and the box still fits the rest of the label
