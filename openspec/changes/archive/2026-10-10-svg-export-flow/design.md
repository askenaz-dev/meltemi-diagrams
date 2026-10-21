## Context

`compile()` produces a validated `FlowDiagram` with elements, relations, placement, styles and animations, each with source ranges. The proposal's pipeline continues with layout (measures, positions, ports, routes) and render (SVG primitives, text, composition), consumed by exporters, the player and the editor. The first real conversion, the Konfío Agent Platform sheet, is drawn with absolute coordinates, four coloured bands, dashed outlines for proposed pieces, numbered step circles beside arrows, capability pills on box corners and free text inside bands. Reproducing it is the acceptance test for this change.

Constraints that shape the design:
- No layout engine yet: manual placement only, so the renderer must be exact where the author gave coordinates and sensible where they did not.
- Exports must open identically in browsers and office applications; the proposal's export contract rules out editor-only features.
- The scene must keep element identity, because the editor will map clicks back to source ranges.
- Text cannot be measured without a browser; the proposal defers measurement to the layout engine.

## Goals / Non-Goals

**Goals:**
- Render every `flow` diagram whose elements are placed, byte-for-byte reproducibly.
- Reproduce the Konfío sheet from `.arch` source closely enough that reviewers compare it with the original and find only intended differences.
- Keep the vocabulary additions small, table-driven and compatible with Stage 1 files.
- Keep SVG output portable and self-describing (`<title>`, `<desc>`, `data-id`).

**Non-Goals:**
- Automatic layout, text measurement, icons, raster or PDF output, theme files, animation.

## Decisions

### D1. Two packages: `@dac/layout` produces a scene, `@dac/render` serialises it

| Package | Public surface |
|---|---|
| `packages/layout` (`@dac/layout`) | `layoutFlow(diagram, options) -> { scene, diagnostics }`, `Scene`, `SceneItem`, `Theme`, `THEMES`, `resolveTheme()`, geometry helpers used by tests (`anchorOnSide`, `sideFacing`, `routePoints`) |
| `packages/render` (`@dac/render`) | `renderSvg(scene) -> string` |

The scene is a flat, z-ordered list of primitives (`rect`, `path`, `polyline`, `text`) grouped under `group` items that carry the `data-id` and role (`element`, `relation`, `label`). Nothing in the scene refers back to the CST, so other renderers (PNG via a browser, the editor canvas) consume the same structure. Alternative: render SVG straight from the model. Rejected because the proposal wants one scene shared by images, documents, video and the editor.

### D2. Manual layout only, with one exception

`layoutFlow` renders a diagram when every non-group element has a `place`. In `layout manual` a missing `place` is `layout.missing-placement` (error, one per element). In `layout auto` or `assisted`, a diagram with every element placed renders too (there is nothing to arrange); otherwise `layout.mode-unsupported` explains that the layout engine arrives in a later change. Groups never need placement: without `place` and `size` their box is the bounding box of their children plus padding (16 px sides and bottom, 40 px top for the title); with both, the box is explicit.

### D3. Route anchors: the port names the side, the neighbour fixes the point

Compass ports are centres of sides in the proposal, but real sheets rarely join centres. The Konfío sheet has 13 arrows and only one needs a waypoint once this rule is used:

1. A route runs from the source anchor through the waypoints to the target anchor.
2. For a side with a neighbouring waypoint, the anchor is the projection of that waypoint onto the side, clamped to the side's extent.
3. For a side whose neighbour is the other element (no waypoint between them) and whose sides are parallel and facing (south to north, east to west), the anchor coordinate is the centre of the overlap of the two extents; when the extents do not overlap, each side uses its own centre.
4. Sides that do not face each other and have no waypoint between them leave from their centres; perpendicular sides are joined by one elbow.
5. `auto` picks the side that faces the neighbour point: the axis with the larger distance from the element centre decides vertical versus horizontal.

Every straight arrow in the original sheet is reproduced by rule 3 (for example NextJS 260..460 to the API gateway 240..700 gives x = 360, the original value). Recorded as `docs/decisions/0006-route-anchors.md`. Alternative: fractional ports (`api.north@25%`). Rejected for 0.2 because it adds syntax for a case the rule covers.

### D4. Default sizes and estimated text

Without `size`, a `node` is 160 x 56, `decision` 160 x 80, `data` 160 x 64, a `tag` is 18 px high and as wide as its text plus 18 px, and a `note` is as wide as its longest line and 18 px per line plus 4 px. Text width is estimated at 0.58 em per character for body text and 0.6 em for mono text; the estimate only sizes tags, notes and label pills. Boxes with explicit `size` are exact, so a converted sheet is exact wherever the author wrote sizes. Measurement arrives with the layout engine.

### D5. Annotations: `note`, `tag`, and steps as relation labels

- `note <id> "line one\nline two"`: left-aligned text, muted colour, no border, 11 px.
- `tag <id> "PKCE"`: pill with mono text, ink fill and surface text by default; styles override.
- Numbered steps are relation labels: `nextjs -> apiGw: "1" as r1` with `label r1 at 50% offset (16, 0)`. Labels render as pills (surface fill, line stroke) so they stay readable over connectors; a relation `style` with `fill` and `color` turns them into the dark circles of the original. The story profile (stage 3) is the long-term home of narrative steps; labels are the honest representation today.

Alternative: encode steps as standalone tags. Rejected because a step belongs to the hop it numbers and `label` already positions it.

### D6. Style semantics

- `line solid|dashed` on an element dashes its outline; on a relation it overrides the arrow style.
- `style a, b, c { ... }` applies the block to every listed target; properties set twice for the same target across statements are `prop.duplicate` on the later statement.
- On relations, `stroke` colours the line and `fill`/`color` colour the label pill; relations have no fill of their own.
- `fill "none"` is a valid colour and draws no background (used by a legend group).
- Rename follows every target token; cascading removal removes only the token (and its comma) when the list keeps other targets, and the whole statement when it does not.

### D7. SVG portability

- Arrowheads are filled triangles computed by the layout, not `<marker>` elements; connectors are shortened by the arrowhead length.
- Text baselines are computed (`baseline = centre + 0.35 * size`), never `dominant-baseline`.
- Attributes are inline; no `<style>`, no CSS variables, no external fonts. Font stacks name IBM Plex first and fall back to system fonts.
- Every element and relation is wrapped in `<g data-id="...">`; the diagram `title` and `description` become `<title>` and `<desc>`.
- The canvas is the bounding box of the scene plus a 20 px margin; the background is the theme's background colour.

### D8. Themes

`THEMES` holds `studio.light` (default) and `studio.dark`, each a token table (background, surface, ink, muted, line, connector, group fill and stroke, tag fill and ink, fonts, sizes, radii). `theme "<other>"` renders with the default theme and reports `layout.unknown-theme` (warning). Theme files stay out of scope.

### D9. `studio export`

`studio export <file.arch> [--diagram <id>] [--format svg] [--out <path>] [--stdout]`. Without `--diagram` every renderable flow diagram is exported next to the input as `<file>.svg`, or `<file>.<diagram-id>.svg` when the file holds several diagrams; `--out` names a file (one diagram) or an existing directory; `--stdout` prints one diagram. Compile or layout errors print like `studio validate` and exit 1; a file without a renderable flow diagram is `export.no-diagram`.

### D10. Examples folder

`examples/<name>/<name>.arch` holds real sheets with their rendered `.svg` beside them; a test renders every example and compares it with the stored SVG so the image never drifts from the source. Examples are not corpus files: they may be removed or kept out of a public repository without breaking the suite.

## Risks / Trade-offs

- [Estimated text widths misplace long labels] -> only tags, notes and label pills depend on the estimate; the Konfío sheet uses explicit sizes everywhere else; measurement is planned.
- [The anchor rule surprises authors who expect side centres] -> documented with examples; explicit waypoints always win.
- [Dark theme with explicit light colours looks wrong] -> explicit styles are the author's choice; the export reference says so.
- [`examples/` holds user content] -> excluded from the corpus and from prettier; the README notes it may be private.

## Migration Plan

Additive. Existing corpus files compile to the same JSON; `checkout.arch` keeps `layout assisted` and is reported as unsupported by the exporter until the layout engine exists.

## Open Questions

- Stroke width and font size as style properties (the original uses 1.5 px for the new piece).
- Group-relative coordinates for `flow`, or only in `free`.
- Whether `label` should accept a side (`above`, `below`) instead of offsets.
- A `legend` construct instead of hand-placed tags and notes.
