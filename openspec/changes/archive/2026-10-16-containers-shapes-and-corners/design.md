## Context

Verified on 1.7 with scratch sheets and the code (line numbers of 2026-10-16):

- Every non-group element enters the engine request whatever its layer
  (`packages/layout/src/layout.ts` `arrangeRequest` ~1364-1390; `ArrangeNode` has no layer); in
  `assisted`, `placeAround` (~1432-1498) fixes every placed element as a blocker and pushes the
  unplaced ones out of it. A placed+sized group is already outside both (~853-861, 1445, 1452).
- `checkComposition` (`packages/layout/src/checks.ts` 155-166) warns for every intersecting pair
  of boxes on one layer with no containment test; the box-vs-group loop (167-181) and
  `layout.connector-crossing` (256-288) ignore layers; `obstaclesFor` (layout.ts ~912-922)
  detours connectors around any non-group box; the audit silences label findings only because
  `layout.overlap` names the boxes (`LABEL_CODES`, layout.ts ~495-500, 545-564).
- A group always reserves `theme.groupHeader`: derived height and interior origin
  (`packages/layout/src/free.ts` 24-47, layout.ts ~887-910), ELK padding (~1391-1402), the title
  band obstacle (~409-431), the minimum width (`textNeeds`, ~1845-1857), the empty title item and
  the connector hole (~2044-2107), `layout.container-margin` (checks.ts 195). Only
  `group id ""` is untitled: `group id {` takes its id as label (`packages/model/src/flow.ts` 651).
- Shapes: `BOX_SHAPES` (`packages/model/src/schema.ts` 189-196) feeds the analyser, completion,
  the inspector and plugin kind styles; `shape` is refused in flow by profile
  (`style-values.ts` 443-456, flow.ts 1734-1737). `Layout.shape()` (layout.ts 2240-2281) draws
  with `theme.radius`; `SHAPE_SIZES` (266-275) is per shape; connector ends are bounding-box
  points (`geometry.ts` 56-80, 118-165; `routing.ts` 24-35, 292-309) — a `d.north 5%` on a
  160 × 80 diamond ends 36 px above the outline; `textNeeds`/`defaultSize`/`checkOverflow`
  (1800-1943) and the audit's cut test (`audit.ts` 186-188) use the rectangle.
- The canvas selects by DOM hit-testing (topmost painted wins; `app.ts` 1744-1776) but every
  geometric picker (`elementAt` 2251-2261, `create()` 2726-2735, magnets in
  `packages/editor/src/canvas/routes.ts` 174-261) uses the smallest bounding box; the move action
  carries `{ids, delta}` and the edit package has no operation that moves a declaration between
  blocks; `create()` never passes `parent` for a new group. The inspector has stroke, line (with
  pictures) and width; `radius` exists nowhere as a style.

## Goals / Non-Goals

**Goals:** the draw.io picture (nested plain containers, stacked boxes, a band behind arranged
boxes) written as text and drawn by every host without warnings; corner radius and shape chosen
per element from the panel, with pictures; twenty-two shapes that connectors meet and text fits;
drag-and-drop into and out of containers; importers that keep shapes.

**Non-Goals:** a childless band in `layout auto`; percentage radii; shapes on sequence and C4
kinds; constraints on groups; "send behind"; draw.io import.

## Decisions

### Untitled groups are the containers (no new kind, no flag)

A group is untitled when its label is `""`, it has no `description` and no styled `icon`.
`headerOf(group)` in the layout returns `groupPadding` for it and `theme.groupHeader` otherwise,
and replaces every flat `groupHeader` read: `freeFrames` (callback beside `titleWidth`), the
derived box, `LayoutResult.origins`, the ELK padding, the title-band obstacle, `textNeeds` (width
0), the drawing (no title, icon, description or `titles` hole) and `checkComposition`
(`container-margin`). `convertToFree` and the editor's `interior()` derive the header the same
way (`metrics` carries both values; the edit package tests the label). The Mermaid block importer
writes untitled groups with the padding interior.

- *Alternatives:* a `title none` property on groups (touches both profile tables, `groupBlock`,
  `Element`, the model JSON, `diff`, `ungroup`, the inspector); a new `band` kind (every closed
  kind list in model, edit, layout, canvas, editor, docs); `group id {` becoming untitled (changes
  the meaning of existing text). The empty label needs no model, JSON or edit change.
- *Consequence:* children of an existing untitled free group are drawn `groupHeader -
groupPadding` higher than before; the only such groups on disk are importer output, whose
  snapshots are regenerated. Documented as a drawing change under language 0.2 (the statements
  mean the same: a place relative to the interior).
- An ellipse or other non-rectangular group is not offered: groups stay rounded rectangles whose
  radius is `radius` or `groupRadius`.

### `radius` is a profile-neutral style property; groups take no `shape`

`radius` joins `STYLE_PROPERTIES` (number, the `RADIUS` spec 0..64, px or unitless) and
`ELEMENT_ONLY_PROPERTIES`; relations refuse it. The layout reads `style.radius ?? theme.radius`
for nodes, `rounded` boxes, notes and free frames, and `style.radius ?? theme.groupRadius` for
groups, clamped to half the shorter side; `rectangle` and `square` are radius 0 whatever is
written, `pill` stays half the shorter side; polygons ignore it. `withBounds` copies the radius so halos
and review marks follow. Plugin kind styles (`diagram-types.ts`) accept `radius`.

- *Alternatives:* `shape rectangle|rounded` on groups (needs the style refusal to become
  per-target in `styleOrAnimate` and a group subset of the enum); a percentage like draw.io's
  `arcSize` (new value kind in the analyser, the formatter and the layout). A number that
  overrides the token is one property for boxes, nodes, notes and groups alike and needs no
  parser work.

### The stack rule and the layer exemptions live in the checks

In `checkComposition`: a pair of boxes on one layer is skipped when the later-declared box is
fully inside the earlier one and at least 1 px in from one of its sides, so coinciding boxes still
overlap (`contains`, `order`); a stack written inner first gets a hint to declare the outer box
first; the box-vs-group loop and the connector
crossing test skip parties on different layers; the crossing test skips boxes and groups that
contain an end box of the connector. In the layout, `obstaclesFor` excludes those containers so
`avoidingRoute`/`detourRoute` do not go around them, and `labelObstacles` excludes the empty band
of untitled groups. In `auditLabels`, a container's own text is not reported over the boxes it
contains; two coinciding centred texts still are (the docs say: empty or offset labels). For
shaped boxes the crossing test and the audit's cut test use the outline and the inscribed area
instead of the rectangle.

- *Alternatives:* exempt any containment regardless of declaration order (hides a mistake where
  a later box is covered by an earlier bigger one); a `backdrop` marker consulted by six kind
  lists (engine request, `placeAround`, obstacles, label obstacles, checks, audit) plus the canvas
  connection targets — heavier, and it still cannot express nesting.

### Twenty-two shapes, on free boxes and flow nodes

`BOX_SHAPES` becomes `rounded`, `rectangle`, `square`, `ellipse`, `circle`, `diamond`,
`cylinder`, `pill`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`,
`star`, `cloud`, `document`, `callout`, `arrow`, `framed`, `flag`, `person`: one camel-case word
each, as every value of the language. `square` and `circle` are a rectangle and an ellipse with a
square default size (120 × 120 at label size 13) and are drawn from the box they get. Each shape
has, in `packages/layout/src/shapes.ts` (new): a default size in `SHAPE_SIZES`, an outline
builder returning the path and a vertex list or sampled polygon (`polygonPath` for polygons,
paths for cloud, document, callout, arrow, framed, flag; `cylinderPaths`, `ellipsePath`, the
person as today), an inscribed text rectangle as factors of the box (`SHAPE_INSET`, e.g. diamond
0.5 × 0.5, ellipse 0.707, triangle 0.5 wide with the centre moved to the base, hexagon 0.75,
document without the wave), and the point where a ray meets the outline.

`shape` moves out of `FREE_STYLE_PROPERTIES`: flow `node`s accept it (`shapeOf` reads the style
for `node`), `decision`, `data`, `note` and `tag` refuse it with `prop.invalid-value` naming
`node`, sequence and C4 keep refusing. `fontSize`, `fontWeight` and `textAlign` stay free-only;
decision 0018 is narrowed by decision 0043. The flow hint messages change in both languages.
`convertToFree` already copies `style` verbatim; `from_decision`/`from_data` classes are applied
first so an explicit `shape` on a converted node wins.

- *Alternatives:* free boxes only (architecture diagrams would have to be converted to free to
  draw a hexagon, and Mermaid/PlantUML imports would keep approximating); aliases (`circle` →
  `ellipse`) normalised in the resolver (a third, unprecedented value pattern); mirrored variants
  (`parallelogramLeft`, `trapezoidInverted`) — not added; importers approximate the mirror.

### Connector ends meet the outline

Every end computed on the bounding rectangle (auto and compass anchors, waypoint projections,
overlap centres, percentage points, named ports, lanes, engine route ends, group ends snapped by
`snapEnd`, the 20 px stubs of detours) is projected by `onOutline(shape, box, point, side)`: slide
the point along the side's inward normal to the first intersection with the outline; when the
normal misses (star, cloud, callout tails), take the nearest outline point. Ends stay square to
their side, the written model (`side` + percentage, decision 0038) is unchanged, orthogonal and
Bézier tangents keep their normals. Arrowheads are computed from the final tip as today.

- *Alternative:* draw.io's ray from the centre through the anchor (moves the point along the
  side and breaks "leave square to a side" for polylines).

### Text fits the inscribed area

`textNeeds`, `defaultSize` and `checkOverflow` divide the content by the shape's inset factors,
so a default-sized hexagon is wider than a rectangle with the same label and `layout.text-overflow`
suggests a width at which the text fits the shape; `shape()` places the text column and the icon
row in the inscribed rectangle (apex shapes shift the centre towards the base, as cylinder and
person do); `SceneBounds` gains `inner` (the inscribed rectangle) that `withBounds` fills and the
audit's cut test uses.

### The canvas knows the shape

`ElementInfo.shape` (session fills it from the resolved style; `rounded` when absent). The canvas
uses it for: the Shapes ghost (per-shape size and outline), `elementAt`/attach/hover containment
by outline, magnets (polygon vertices and side midpoints; no corners on ellipses), the border
preview point projected on the outline, the highlight drawn as the outline. Selection handles and
the resize box stay the bounding rectangle. The 24 px canvas minimum stays; shape details
(cylinder ry, cloud bumps, document wave, star points) scale with `min(w, h)` with clamps so a
24 px shape still draws.

### Shapes and arrows from the toolbar, Shape pictures and the radius slider

- The **Box** button (free) and the **Node** button (flow) become split buttons. The main part
  arms the tool with the canvas's *current shape* (`rounded` until one is chosen; kept in memory
  while the canvas is open and never written — the owner declined persisting it per diagram like
  hidden layers, 2026-10-16) and shows its picture; the arrow part opens a four-column
  picture grid (the inspector's head-grid radiogroup, reused) listing the twenty-two shapes with
  names in both languages. Choosing a shape makes it current and arms the tool; the click or drop
  creates the element and, in the same edit, `style <id> { shape <value> }`
  (`CanvasAction.create.shape` → `createElement.shape`, written like `icon` is today; `rounded`
  writes no style). B and N create the current shape near the centre, as today. Ids stay
  `box<n>` / `node<n>`. Read-only canvases hide the arrow parts.
- **F opens the grid from the keyboard** on flow and free diagrams (S is the data store in flow;
  F is free in both, and the sequence profile keeps F for fragments). In the grid the arrows move,
  typing filters by the shape's name in the interface language and in English, Enter creates the
  highlighted shape near the centre and makes it current, Escape closes. Every shape therefore
  has a keyboard path (F, `hex`, Enter) and B or N repeat it; no per-shape letters are bound.
  *Alternative:* one letter per shape (twenty-two bindings, most letters already taken) or
  Shift+letter chords (undiscoverable and colliding: pentagon, parallelogram, pill, person).
- The **arrow** button gets the same split: its menu lists the four kinds `->`, `-->`, `<->` and
  `<-->` with pictures; choosing one arms the relation tool with that kind. R arms the tool with
  the current kind and, while it is armed, R again cycles to the next kind (the status line and
  the cursor badge name it); Shift on the second click still flips solid and dashed, as today.
  Heads stay in the inspector. Connection handles keep `->` (Shift `-->`).
- The inspector's **Shape** field gets `glyphs: "shape"` (a new glyph family drawn from the same
  outline builders at 32 × 16) and the placeholder `rounded`; it shows for free boxes and flow
  nodes only (today groups are offered a Shape that the layout ignores). `glyphName` becomes
  family-aware so `rounded`, `diamond`, `circle` and `triangle` read as shapes, not as corners or
  heads, in Spanish.
- A **Corner radius** field (`style.radius`, number 0..64 with a `range` hint rendered as a
  slider beside the number, placeholder from the theme: `radius` or `groupRadius`) for boxes,
  nodes, notes and groups; both fields join the strip after the corners control.
- The existing Stroke, Line and Width controls are the border type; a group already has them.

### Reparenting is one operation

`moveElement { diagram, element, parent: string | null, at? }` in `@meltemi/diagrams-edit`: cut
the declaration with its block and attached comments, insert it re-indented after the last
declaration of the target block (`groupBlock`/`diagramBody`, `insertDeclaration`), write `place`
to `at` when given (the host computes the point in the new interior from `LayoutResult.origins`),
refuse a group into its own subtree and sequence/C4 diagrams with `edit.unsafe-target`, declare
implicit elements first, keep relations and styles by id, inverse exact. The session plans one
batch: `moveElement` + `setPosition` for every moved element (`GEOMETRY`, so `auto` materialises
first). The canvas's move drag computes the innermost group under the **centre of the dragged
selection's box** (excluding the dragged ids and their descendants, honouring hidden layers),
highlights it like the connect target, and sends `move.parent` (`null` when outside every group);
Alt keeps the parent; nudges never reparent. `create()` passes `parent` for groups too, so the
palette nests. The three "what is under the point" searches become one stack helper.

- *Alternatives:* reparent only with a modifier (draw.io reparents by default); the pointer
  position as the target (the selection's centre is what `create()` already uses).

### Reaching covered shapes

Alt+click cycles through the stack under the pointer in paint order (front to back), the context
menu offers "Select the shape below", `nearestInDirection` prefers the nested (smaller) shape on
ties, and the inspector shows an **Inside** field (the parent group, or none) mapped to
`moveElement`. Tab, Ctrl+A and the rectangle remain the keyboard paths.

### Importers keep shapes

Mermaid flowcharts: `{{t}}` hexagon, `[/t/]` parallelogram (`[\t\]` approximated to it),
`[/t\]` trapezoid (`[\t/]` approximated), `((t))` circle, `(((t)))` approximated to circle,
`([t])` pill, `[[t]]` framed, `>t]` flag, and the `@{ shape: … }` names onto the same values,
as `node` + `style { shape … }`; block-beta maps the same onto free boxes. PlantUML: `cloud`,
`hexagon`, `usecase`/`(t)` ellipse, `circle`/`interface` circle, `actor`/`person` person, `card`,
`file`, `folder` document. Coverage rows move to "mapped" (mirrored forms stay "approximated");
`docs/import/*.md` are regenerated (`pnpm import:docs`).

### Acceptance and corpus

A sixth and a seventh sheet per flow and free profile: `stacked` (nested untitled square groups
with fills, a sibling-box stack with empty labels, a band on a back layer) and `shapes` (every
shape, connected, with pinned ends on a diamond and an ellipse), held to zero warnings with
reviewed SVG and visual snapshots; `corpus/acceptance/edits/free-reparent.json`; `corpus/edits/
reparent-*` fixtures; `corpus/valid/free/stack.meltemi` and `shapes.meltemi` with model and SVG
snapshots; `radius 99` and `shape` on a decision in `corpus/invalid/prop.invalid-value.meltemi`.

### Smaller decisions

- **Polygons and `radius`.** `radius` rounds rectangles only (nodes, `rounded` boxes, notes,
  free frames, groups); polygons, `pill`, `rectangle` and `square` ignore it. *Alternative:*
  rounding every vertex of a polygon through a rounded-polygon path, as draw.io does for hexagons
  (one more path builder and a bounds rule; not needed for the owner's picture).
- **Where `radius` reaches.** Not tags (pills), sequence participants and groups, or the C4
  person: their kinds draw themselves.
- **`square` and `circle` keep no aspect lock** on resize (draw.io does not lock them either);
  they differ from `rectangle` and `ellipse` only by their default size and their name in the
  palette and the importers.
- **`arrow` points right.** Mermaid block arrows in other directions are approximated.
- **Halos, story focus and review marks** stay rounded rectangles of the bounding box for path
  shapes (as today for diamonds and cylinders); `SceneBounds.inner` is for text only.
- **Shapes in the canvas come from one table.** The canvas mirrors `SHAPE_SIZES` for its ghosts
  (as it mirrors the kind sizes today); a canvas test pins the mirror equal to the layout's table.
- **The shapes grid reuses the inspector's picture grid**; a shapes category in the libraries
  panel is not added (libraries are icon-driven elements; the grid is one click from the toolbar).
- **Crossing checks and the audit use the outline** for shaped boxes (`layout.connector-crossing`
  through a diamond's empty corner is not a finding); `layout.overlap` between two shaped boxes
  keeps the rectangles (the stack rule covers the owner's case; polygon-polygon intersection is
  not worth its cost).
- **Numbering.** `docs/decisions/0041` exists twice and `0042` is the last; the new record is
  `0043`.

## Packages and interfaces

- `@meltemi/diagrams-model`: `BOX_SHAPES`; `STYLE_PROPERTIES.radius`; `shape` accepted on
  `node`; `ElementJson.shape`; messages en/es.
- `@meltemi/diagrams-layout`: `shapes.ts` (`SHAPE_SIZES`, `SHAPE_INSET`, `outlineOf`,
  `onOutline`, glyph-sized outlines); `headerOf`; `ResolvedStyle.radius`; `SceneBounds.inner`;
  `checkComposition` and `auditLabels` rules; `LayoutResult.origins` unchanged in shape.
- `@meltemi/diagrams-edit`: `moveElement`; `createElement.shape`; `convertToFree`/`insertFragment`
  keep layers.
- `@meltemi/diagrams-editor`: `ElementInfo.shape`; `CanvasAction.create.shape`,
  `move.parent`, `create.relationKind`; commands `selectBelow`, `openShapes` (F), `arrowKind`
  (R while armed); the canvas's current shape and arrow kind; inspector fields `style.shape` (glyphs),
  `style.radius` (range), `inside`; completion and hover.
- `@meltemi/diagrams-canvas`: Shapes menu, glyph family `shape`, drop-target overlay, stack
  helper, Alt+click, the range control; words en/es.
- `@meltemi/diagrams-import`: shape maps and coverage.
- Hosts (`vscode`, `playground`): no API change; browser suites gain scenarios.

## Risks / Trade-offs

- [Untitled groups move their children up] → only importer fixtures on disk; the change is
  described in the CHANGELOG and `free.md`.
- [Silence by declaration order] → "send to back" of an inner box turns a clean stack into two
  warnings that name both boxes; the hint says to declare the outer box first.
- [Outline projection on engine routes] → ELK ends keep their side; sliding along the normal
  shortens the last segment by at most the shape's inset, which the 20 px stubs tolerate.
- [Twenty-two glyphs in two languages] → one table, drawn from the outline builders, checked by
  the existing untranslated-words tests.
- [Snapshot churn] → every SVG, model and visual snapshot with an untitled group or a shaped box
  changes; titled groups and rectangles must stay byte-identical, which the corpus tests pin.
