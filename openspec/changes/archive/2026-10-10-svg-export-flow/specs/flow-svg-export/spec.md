## ADDED Requirements

### Requirement: Manual layout geometry
`layoutFlow(diagram)` SHALL produce a scene for a flow diagram whose non-group elements all have a `place`. Each element box SHALL be centred on its `place` with its `size`, or with the default size of its kind when `size` is absent (`node` 160 x 56, `decision` 160 x 80, `data` 160 x 64, `tag` text width plus 18 by 18, `note` longest line by 18 per line plus 4). A group without `place` and `size` SHALL take the bounding box of its children expanded by 16 px on the sides and bottom and 40 px on top; with both statements it SHALL use them. The canvas SHALL be the bounding box of every item plus a 20 px margin.

#### Scenario: Placed nodes with and without size
- **WHEN** `api` is placed at (360, 180) with size (200, 56) and `db` is placed at (700, 180) without size
- **THEN** the scene has a 200 x 56 rect centred on (360, 180) for `api` and a 160 x 56 rect centred on (700, 180) for `db`

#### Scenario: Group derived from its children
- **WHEN** group `backend` has no placement and contains `api` at (100, 100) and `db` at (300, 100), both 160 x 56
- **THEN** the group rect spans x 4..396 and y 32..144 and is drawn before its children

#### Scenario: Missing placement in manual layout
- **WHEN** a `layout manual` diagram declares `cache` without a `place`
- **THEN** `layout.missing-placement` is reported on the declaration of `cache` and no scene is produced

#### Scenario: Unplaced elements in assisted layout
- **WHEN** a `layout assisted` diagram has one element without `place`
- **THEN** `layout.mode-unsupported` is reported on the `layout` property and no scene is produced, and the same diagram with every element placed produces a scene

### Requirement: Route anchors
A relation SHALL be drawn as a polyline from an anchor on the source box through its waypoints to an anchor on the target box, ending in a filled arrowhead. A side with a neighbouring waypoint SHALL anchor at the projection of that waypoint onto the side, clamped to the side. Two facing parallel sides without a waypoint between them SHALL anchor at the centre of the overlap of their extents, or at their own centres when the extents do not overlap. Non-parallel sides without waypoints SHALL anchor at the clamped projection of the other element's centre. An `auto` port SHALL choose the side facing the neighbour point. A relation without a `route` SHALL use `auto` ports and no waypoints.

#### Scenario: Facing sides with overlapping extents
- **WHEN** `nextjs` spans x 260..460 above `apiGw` which spans x 240..700, and the route is `from nextjs.south to apiGw.north`
- **THEN** the connector is vertical at x = 360

#### Scenario: Waypoint fixes the anchor
- **WHEN** the route is `from clients.east to mcpGw.north via [(1035, 48)]`, `clients` spans y 20..76 and `mcpGw` spans x 580..1040
- **THEN** the connector leaves `clients` at (1020, 48), bends at (1035, 48) and enters `mcpGw` at (1035, 530)

#### Scenario: Auto ports
- **WHEN** `a` is centred at (100, 100) and `b` at (100, 300) with no `route`
- **THEN** the connector leaves the south side of `a` and enters the north side of `b`

#### Scenario: Arrowhead
- **WHEN** any relation is rendered
- **THEN** the scene contains a filled triangle at the target anchor pointing along the last segment, and the polyline stops at the base of the triangle

### Requirement: Labels and annotations
A relation label SHALL render as a pill (surface fill, line stroke) centred on the point at `label ... at <n>%` along the polyline plus the offset, or at 50 % without offset when no `label` statement exists. `note` elements SHALL render as left-aligned muted text without a border; `tag` elements as pills with mono text; `data` elements as cylinders; `decision` elements as diamonds; element descriptions SHALL render as smaller lines under the label, one per `\n`.

#### Scenario: Step label beside an arrow
- **WHEN** `a -> b: "1" as r1` is routed vertically and `label r1 at 50% offset (16, 0)` is set
- **THEN** a pill with the text `1` is centred 16 px to the right of the midpoint of the connector

#### Scenario: Note with three lines
- **WHEN** `note limits "Límites a validar\nOBO: 30 RPS\nCIBA: Enterprise"` is placed
- **THEN** the scene has three text items with the same left x, 18 px apart, and no rect for the note

#### Scenario: Shapes by kind
- **WHEN** a diagram places a `data` element, a `decision` element and a `tag`
- **THEN** the scene has a cylinder path, a diamond path and a pill rect respectively, each wrapped in a group carrying the element id

### Requirement: Styles and themes
Element styles SHALL apply `fill`, `stroke`, `color` (label and description text) and `line dashed` (dashed outline). Relation styles SHALL apply `stroke` to the connector and arrowhead, `fill` and `color` to the label pill, and `line` as an override of the arrow style. `fill "none"` SHALL draw no background. The theme SHALL be `studio.light` by default or `studio.dark` when named; any other name SHALL report `layout.unknown-theme` as a warning and use the default.

#### Scenario: Dashed proposed element
- **WHEN** `style proxy { line dashed; stroke "#c4552c" }` is set on a placed node
- **THEN** its rect has a dash pattern and the stroke colour `#c4552c`

#### Scenario: Dark relation label
- **WHEN** `style r1 { fill "#1b1f23"; color "#ffffff" }` is set on a labelled relation
- **THEN** the label pill is filled `#1b1f23` with white text and the connector keeps the theme colour

#### Scenario: Unknown theme
- **WHEN** a diagram sets `theme "corporate"`
- **THEN** `layout.unknown-theme` is reported as a warning and the scene uses the `studio.light` tokens

### Requirement: Portable SVG
`renderSvg(scene)` SHALL emit a standalone SVG with `xmlns`, `width`, `height` and `viewBox`, a background rect, `<title>` and `<desc>` from the diagram title and description when present, inline presentation attributes only, no `<marker>`, no `<style>`, no `dominant-baseline`, escaped text, and a `<g data-id="...">` wrapper for every element and relation. Rendering the same scene twice SHALL give identical text.

#### Scenario: Structure
- **WHEN** the annotations corpus file is exported
- **THEN** the SVG starts with `<svg xmlns="http://www.w3.org/2000/svg"`, contains `data-id="api"`, contains no `<marker`, no `<style` and no `dominant-baseline`, and matches the stored snapshot

#### Scenario: Escaping
- **WHEN** a label contains `Home & Experience <beta>`
- **THEN** the SVG text contains `Home &amp; Experience &lt;beta&gt;`

#### Scenario: Title and description
- **WHEN** a diagram sets `title "Checkout"` and `description "Purchase path"`
- **THEN** the SVG contains `<title>Checkout</title>` and `<desc>Purchase path</desc>` before any shape
