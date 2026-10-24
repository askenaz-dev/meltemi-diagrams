## Context

**Tokens.** The lexer's `-` branch (`packages/language/src/lexer.ts:176-191`) makes `->` an
`Arrow`, `-->` a `DashedArrow` and `-digit` a number; `canStartSomething` (`355-358`) treats `-` as
a token start only before `>`, a digit or `->`, so `a -- b` yields one `Unknown` token `--` and
`syntax.unexpected-character` with the hints `arrows` and `minus`
(`packages/language/src/messages/en.ts:98-100`). The two-way arrows are lexed by
`twoWayArrowLength` (`lexer.ts:66-70`, `193-201`) into `BothArrow` and `DashedBothArrow`; their
texts live in `PUNCTUATION_TEXT` and `isArrowKind` names the four kinds the parser accepts
(`packages/language/src/tokens.ts:54-58`, `91-95`); `parseRelation` builds a `RelationStatement`
whose `arrow` is one token (`packages/language/src/parser.ts:602`, `652-700`;
`packages/language/src/cst.ts:160-171`). The formatter has no arrow-specific code (`format.ts`
spaces tokens one apart). The TextMate grammar matches `<-->|<->|-->|->`
(`packages/vscode/syntaxes/meltemi.tmLanguage.json:44-47`). Each profile schema carries an `arrows`
table (`packages/model/src/schema.ts:458`, flow `527`, free `569`, sequence `611`, C4 `640` with
`->` and `-->` only); the relation compiler reports `flow.arrowUnavailable` when the table lacks the
token (`packages/model/src/flow.ts:1011-1019`; the words at
`packages/model/src/messages/en.ts:166-170`) and derives `line` from the table and `twoWay` from
`startsWith("<")` (`flow.ts:1031-1032`). `Relation` has `line` and `twoWay` and no way to say "no
heads" (`packages/model/src/types.ts:186-194`), carried to `RelationJson` (`packages/model/src/json.ts:297-320`,
`730-748`), compared by `diff.ts:302-303`, written by the import writer from `twoWay` and `dashed`
(`packages/import/src/writer.ts:294`, `374`), by `createRelation` and `setRelationLine`
(`packages/edit/src/create.ts:206-210`, `packages/edit/src/relations.ts:116-121`), printed by hover
and the symbol list from `line` alone (`packages/editor/src/services/hover.ts:67`,
`navigation.ts:100`), and read by the inspector's placeholders (`packages/editor/src/inspector.ts:367-390`).
The sequence drawer takes the head at the start of a two-way message from `twoWay`
(`packages/layout/src/sequence.ts:947-951`). Mermaid open links become `noHead` and a named
relation with `arrowhead none` (`packages/import/src/mermaid/flowchart.ts:686`, `801-831`;
`architecture.ts:242`; `block.ts:502`), and so do PlantUML headless arrows and note links
(`packages/import/src/plantuml/description.ts:104`, `474`, `546-548`, `626`). The palette's
`ARROW_KINDS` are four (`packages/editor/src/canvas/palette.ts:8-9`), `arrowKindLine` derives line
and `twoWay` from the text (`43-50`), the canvas keeps `arrowKind` (`packages/canvas/src/app.ts:509`),
builds the split button (`3165-3179`), the kinds menu (`3264-3298`), the announcement (`3322-3332`)
and the R cycle (`4695-4707`); `relationClick` (`5017-5058`) is click-based and `pointerDown` routes
to it before any drag threshold (`3660-3663`; `DRAG_THRESHOLD = 3` at `343`). The words are
`ARROW_NAMES` typed `Record<ArrowKind, string>` (`packages/canvas/src/messages/en.ts:44-49`,
`es.ts:41-46`) and the pictures `arrowShapes` (`packages/canvas/src/glyphs.ts:315-331`).

**Free objects.** `FreeElementKind = box | text | icon | image | group`
(`packages/model/src/types.ts:28`), `FREE_ELEMENT_KINDS` (`schema.ts:80`), `FREE_DECLARATIONS`
(`flow.ts:1996`), the free profile (`schema.ts:538-577`) with `ruleKinds` the free kinds plus
`relation`. The declaration compiler defaults the label to the id and treats text, icon and image as
`sourced` (`flow.ts:629-700`). `route` requires a named relation whose ends match
(`flow.ts:1436-1452`), `readPoint` reads `(x, y)` tuples (`2030-2037`) and `label` resolves a
relation (`1638`). `paintOrder` paints groups, then non-group elements in source order, then
relations (`packages/layout/src/free.ts:161-187`); `elementItems` dispatches by kind
(`packages/layout/src/layout.ts:3892-3906`) and the sizing switches at `2891-2898`, `3414-3420`
and `3514-3526`. A relation is drawn by `relation(...)` (`layout.ts:4345-4428`): stroke, width,
dash, polyline pieces or one Bézier path, `markerItems` for both heads, a label pill group with
role `label`, and `track: points(line)` on the group; `relationEnds` cuts the line for the heads
(`packages/layout/src/markers.ts:196-209`); route plans read `routes.get(relation.key)` and
`style.routing ?? diagram.properties.routing` (`layout.ts:1473-1476`); the routing primitives are
exported functions over points (`packages/layout/src/routing.ts:93`, `211`, `245`) and
`roundCorners` (`markers.ts:215`). `LayoutResult` exposes `boxes`, `labels`, `connectors` by
relation key, `origins`, `shapes`, `radii` (`layout.ts:160-190`); the session builds `ElementInfo`
and `RelationInfo` from them (`packages/editor/src/session.ts:404-468`;
`packages/editor/src/canvas/protocol.ts:127-204`). The canvas hit-test reads `[data-handle]`,
`[data-role="label"]`, then the nearest `[data-role="element"|"relation"|"event"]` group
(`app.ts:3614-3646`), starts end, bend and segment drags by handle kind (`3738-3752`) and drops
them as `setVia` and `setEnd` (`4108-4120`), which the session names and writes as `setRoute`
(`session.ts:1526-1577`; `packages/edit/src/plan.ts:696`). `create` carries `elementKind`, `at`,
`parent?`, `source?`, `label?` (`protocol.ts:697-709`) and `createElement` writes a declaration plus
a `place` (`create.ts:94-130`). `planMotion` finds the target's group by role and id, needs a
`track` for relations and `bounds` for the rest (`packages/motion/src/plan.ts:106-150`);
`animationTargetFits` refuses flow and trace on non-relations and dash on `NO_OUTLINE_KINDS`
(`flow.ts:97-101`, `1939-1960`).

**Themes and strokes.** `Theme` holds the font stacks, `arrowhead`, `corners`, `arrowSize`,
`strokeWidth`, `connectorWidth` and optional duration and canvas tokens
(`packages/layout/src/theme.ts:34-115`); the built-ins are six (`214-310`, `THEMES` at `319`;
`BUILT_IN_THEMES` at `schema.ts:265-273`; `THEME_TOKENS` at `340-363`); the theme panel's groups
are a static list (`packages/editor/src/themes.ts:78-107`). Scene items are `RectItem` (emitted as
`<rect rx>`), `PathItem`, `PolylineItem`, `TextItem`, `ImageItem` and `GroupItem` with `track`,
`bounds`, `layer` (`packages/layout/src/scene.ts:22-136`); the scene is assembled at
`layout.ts:1852-1862` and `renderSvg` emits it (`packages/render/src/svg.ts:67`, `260-301`).
`rect()` is the outline builder with eleven call sites (`layout.ts:3784-3800`). `outlineIndex`
(`packages/motion/src/frames.ts:37-43`) and `strokeOf` (`plan.ts:90-100`) find the first stroked
item of a group for the dash effect. Fonts are bundled from `@fontsource/{inter,ibm-plex-sans,cascadia-mono}`
plus `inter-ui` and `@ibm/plex-sans` for measurement (`packages/fonts/package.json:38-46`), under
decision 0012, and the licence inventory is generated by `pnpm licenses:inventory`
(`THIRD_PARTY_LICENSES.md`); a theme font the bundle lacks is measured with estimates and
reported as `layout.unmeasured-font` (`docs/language/diagnostics.md:116`). The output is
deterministic and snapshot-tested: 91 SVGs under `corpus/`, `examples/` and `gallery/`, the visual
manifest `corpus/acceptance/visual/manifest.json`.

**Text.** `textAlign` is free-only (`FREE_STYLE_PROPERTIES`, `schema.ts:368-372`;
`layout/src/styles.ts:46`; decision 0043 lines 45-49), read by `alignOf` (`layout.ts:2845-2849`).
A box's label is placed about `shapeTextCenter` (`packages/layout/src/shapes.ts:1036-1066`),
horizontally within `textArea(element, box, "slots")` (`layout.ts:4143-4146`), the icon beside,
above or below it (`4147-4178`), and `lines()` stacks label and description by
`block.labelOffsets` about that `y` (`4186-4215`); `shapeTextSpan`, `shapeTextSpanner` and
`shapeTextArea` give the inscribed span of a row band (`shapes.ts:1166-1218`). A free `text` is
centred vertically (`layout.ts:3966`). The centred-icon band is at the `labelPosition` edge for
top and bottom and vertically centred for left and right (`layout.ts:3232-3248`, drawn at
`4113-4142`). `layout.label-position-ignored` is emitted once per statement, or once on the
diagram's `theme` for a rule or class of the theme (`layout.ts:778-845`; words at
`packages/layout/src/messages/en.ts:98-105`, `221-231`). The inline editor's `TextPlace` is read
from the drawn text items (`packages/editor/src/text-places.ts:69-93`, `150-175`) and the
icon-shape label is computed at the box's vertical middle or the outside row (`100-131`). The
inspector's `FREE_STYLE_FIELDS` hold `fontSize`, `fontWeight` and `textAlign` below the strip
(`inspector.ts:179-184`; `STRIP` at `865-888`); the canvas inspector has `glyphField` rows and
grids (`packages/canvas/src/inspector.ts:603-609`) and shows inherited values greyed
(`386-416`). The canvas's motion tokens are `--mdg-motion-fast` 120 ms, `--mdg-motion` 160 ms,
`--mdg-motion-slow` 220 ms with `--mdg-ease`, zeroed under reduced motion
(`packages/canvas/canvas.css:15-21`, `37-38`).

## Goals / Non-Goals

**Goals:**

- A relation can be a line: `a -- b` and `a --- b` in flow and free diagrams, in the text, the
  tool, the strip, the importers and the docs, with heads still available by style.
- A free sheet can hold a line that joins nothing, drawn and edited like a connector, written as
  one statement in interior coordinates.
- A diagram can look hand-drawn by one theme token, deterministically, in every export and on the
  canvas, with the geometry the editor relies on left clean.
- The text of a free box can sit at the top or the bottom of its shape, chosen in the text or in
  one nine-cell picker.

**Non-Goals:**

- Changing the Effects row, its cards or the colours of effects (`panel-and-effects-polish`).
- The pointer tool and notes in free diagrams (`pointer-and-notes`).
- A per-element sketch style, a sketch on sequence diagrams' figures beyond their strokes, or a
  hand-drawn font without the owner's approval of the download.
- Vertical alignment in flow diagrams, which decision 0043 keeps out with `textAlign`.

## Decisions

### Line tokens `--` and `---`

The lexer's `-` branch takes the longest match: `--->` is not a token (`---` then `>` as
`syntax.unexpected-character` at `>`), then `-->` (`DashedArrow`), `---` (`DashedLine`), `--`
(`Line`), `->` (`Arrow`), `-digit` (a number); `canStartSomething` treats `-` as a start before
`-` too, so `a --b` recovers at the token. `--5` is the `Line` token followed by the number `5`,
which the parser reports as a missing relation target. `PUNCTUATION_TEXT` and `isArrowKind` take
the two kinds, so the parser, the CST round trip and the formatter need no other change. The
hints `arrows` and `minus` name six tokens and "a digit, `-` or `>`"; the TextMate `arrows` rule
becomes `<-->|<->|-->|->|---|--`. The rule stays one dash more is dashed, with the head glyph
dropped, so `--`, `---` read beside `->`, `-->` as draw.io's and Mermaid's lines read beside their
arrows. Alternatives: `-` alone (a number's sign, and `a - b` reads as arithmetic); `—`
(non-ASCII; decision 0003 keeps the lexicon ASCII); `~~` (Mermaid's invisible link, and nothing
in the family uses tildes). Recommendation: `--` and `---`.

### A `heads` fact on relations

`Relation.heads: "end" | "both" | "none"` is set by the token (`->`, `-->` end; `<->`, `<-->`
both; `--`, `---` none) through a `RELATION_ARROWS` table in the schema that also gives `line`,
and the profiles' `arrows` tables list which tokens each profile takes (flow and free the six,
sequence the four arrows, C4 `->` and `-->`). `twoWay` stays and is `heads === "both"`, so the
sequence drawer, the diff's `twoWay`/`oneWay` facts, the inspector and the importers keep reading
it; `RelationJson` gains `heads` after `twoWay` (every `.model.json` snapshot is regenerated,
additive; `version` stays `0.1`). One function `arrowToken(line, heads)` in the schema gives the
text back, used by the import writer, `createRelation`, `setRelationLine` (which keeps the heads
when it swaps solid and dashed) and the C4 model's relations (`heads: "end"`). Heads by style: the
layout's end head is `style.arrowhead ?? (heads === "none" ? "none" : theme.arrowhead)` and the
start head `style.arrowtail ?? (heads === "both" ? end : "none")`, so a written `arrowhead` on
a `--` relation still draws, the way the theme's head is only the default of `->`. The strip's
`withRelationDefaults` makes `none` the placeholder of both heads of a `--` relation; hover and the
symbol list print the token as written (`relation.node.arrow.text`), which also fixes the two-way
relation that hovers as `->` today. Alternatives: (a) replace `twoWay` by `heads` everywhere
(every consumer changes for no new behaviour); (b) the token forbids heads (a `--` relation with
`arrowhead circle` would be a diagnostic; draw.io and Excalidraw let a line take an end
decoration, and the importers would still need `arrowhead none` for a plain line with a
tail); (c) encode `none` as `arrowhead none` written by the compiler (the model would invent a
style the person did not write, and the strip could not tell it from a written one).
Recommendation: `heads` beside `twoWay`, heads by style still apply.

### Profiles that refuse the tokens

Sequence messages are calls and replies, and a message without a head says nothing, so the
sequence profile's `arrows` table does not take `--` or `---`; C4 views write their relations from
the model with `->` alone (`c4.ts:782-788`, `820-826`), so neither does C4's. Both refuse with
`flow.arrowUnavailable`, whose hint lists the profile's tokens (the four of a sequence, the two of
a view), the mechanism that refuses `<->` in a view today. The palette's `arrowKinds` gives
none for sequences and `["->"]` for C4, unchanged. Alternative: let a sequence take `--` as a
"found message" or a note link (nothing in the sequence profile draws such a thing).
Recommendation: refuse in both.

### Six kinds in the relation tool

`ARROW_KINDS = ["->", "-->", "--", "---", "<->", "<-->"]` in the menu's order and R's cycle;
`arrowKindLine(kind, flip)` returns `{ line, heads }` and Shift flips the dashes only (`--` to
`---`); `connect` carries `heads?: "none" | "both"` in place of `twoWay?`, and `createRelation`
takes `heads`. `ARROW_NAMES` gains "line" and "dashed line" ("línea", "línea discontinua"), typed
through `ArrowKind` so both catalogs must have them; `arrowShapes` draws a headless picture for
the two. The announcement, the badge beside the pointer and the keyboard help follow from the
names. Alternatives: a separate Line tool button (the kinds menu already is the place where a
kind is chosen, and a seventh button crowds the free palette); a modifier on `->` (Alt is the
free-angle and parent-keeping modifier, Ctrl adds to the selection). Recommendation: six kinds.

### Importers write the tokens

Mermaid `---` becomes `a -- b`, `-.-` becomes `a --- b` (Mermaid's `---` is a solid open link, so
it is the meltemi `--`, not `---`), `===` becomes `a -- b as e<n>` with `width 3`; the
architecture mapper's `--` becomes `--` (still named, for its `route`); block links as flowchart
links; PlantUML headless bodies become `--` or `---` and note links `---`. The sheet writer takes
`heads` on `SheetRelation` and prints `arrowToken(line, heads)`; `noHead` stops adding
`arrowhead none`, and relations that needed a name only for that head are anonymous now, so the
imported sheets lose a `style` line each (the corpus under `corpus/import` is regenerated and
read). Alternative: keep `arrowhead none` (the imported text would not use the token the language
now has for exactly this). Recommendation: the tokens.

### A free `line` object, as an element

`line <id> ["Label"] from (x, y) to (x, y) [via [(x, y), …]] [{ … }]` is a declaration of the free
profile: kind `line` in `FreeElementKind`, `FREE_ELEMENT_KINDS` and `FREE_DECLARATIONS`, refused
in flow, sequence and C4 diagrams by the existing kind gate (`prop.unknown`, the hint listing the
free kinds with `line`). The label is the optional second argument as on every declaration, empty
by default (a line has no name to show, unlike a box whose label defaults to its id), and the
points follow the keywords `from`, `to` and `via`, read with `readPoint` and a `List` as `route`
reads them (`flow.ts:1420-1431`); a malformed statement is `prop.invalid-value` with the form in
the hint. The model's `Element` gains `line: { from, to, via } | null`. The points are in the
parent's interior coordinates like `place` (`free-layout` "Interior coordinates"; `LayoutResult.origins`
gives the origin the canvas writes through), so a line inside a group moves with the group as its
boxes do. A line takes no `place`, `size` or `rotation` (`prop.invalid-value`, the hint says its
points are in its statement; `takesRotation("line")` is false), no `shape`, `radius`, `pattern`,
`iconPosition`, `labelPosition`, `iconSize`, `fontSize`, `fontWeight`, `textAlign` or
`verticalAlign`, and takes `stroke`, `width`, `line`, `arrowhead`, `arrowtail`, `routing`,
`corners`, `color`, `fill` and `icon` (its pill), `class`, `layer`, `description`, `url`;
`rule line { }` styles every line. `label <id> at <n>% [offset (dx, dy)]` accepts a line beside a
named relation, so the pill is moved as a relation's is. The JSON element gains `line` after
`shape`. Alternatives recorded: (a) a relation between point endpoints, `(x, y) -- (x, y)`
(statements start with a keyword or an id, decision 0003; `RouteEndpoint.element` is required
and `route` demands a named relation, so the model would need a parallel route grammar, and the
placement would split between the relation and its route); (b) a `line` shape of a box (`place`
and `size` give a box, not two points: no bends, no heads, no effects, and a diagonal would be the
box's diagonal); (c) the label as `: "Label"` after the points (keyword statements take no colon,
`parser.ts:458` is the `diagram <id>:` header only, and a colon clause would be a parser change
for one statement); (d) `via (x, y), (x, y)` without brackets (one `via` grammar is better than
two, and the list continues across lines as `route`'s does). Recommendation: an element with the
label as its second argument and a `via` list.

### Lines drawn by the connector machinery, keyed by their id

The layout turns each line into a connector plan beside the relations' plans: its points are the
written ones moved by the parent's origin, its routing is `style.routing ?? "polyline"`
(`auto` is `polyline` for a line, since there are no boxes to anchor to; `orthogonal` inserts
elbows between consecutive points as the orthogonal rule does from the first point's direction;
`bezier` curves through them), `corners` rounds its bends, no lanes, no detours and no gaps under
group titles (its points are the person's), `relationEnds` cuts its heads with `arrowhead ?? none`
and `arrowtail ?? none`, and `relation()`'s body draws it through a shared `connectorItems`
helper with the label pill at 50 % (or the `label` statement's anchor and offset). Its scene group
has `role: "element"`, `id` the line's id, both `track` (the clean drawn polyline) and `bounds`
(the bounding box of its drawn points, 1 px tall or wide for an axis-aligned line), and its
`layer`. `LayoutResult.boxes` holds that bounding box (marquees, derived group sizes, composition
checks, the content size), `connectors` holds its geometry keyed by the line's id (`points`,
`line`, `via`, and `fromSide` and `toSide` from the directions of its first and last segments, since the type has no `auto` side) and `labels` its pill. A line whose points
coincide is `layout.degenerate-line` (warning) and is drawn as a point of its width, so a sheet
with a line dragged onto itself still renders and says why it shows nothing. It is painted where
`paintOrder` puts a non-group element (source order within its layer), so a line declared after a
box is over it. The protocol's `ElementInfo` gains `line?: { points, drawn, via }` filled from
`connectors`, and the canvas draws a selected line's outline along `drawn` with end, bend and
midpoint handles (`[data-handle]` with the line's id) instead of a box's frame, resize handles,
rotation handle or connection handles; the hit-test finds the group by `[data-role="element"]`
and the browser hits the stroke, as it does for relations. Alternatives: (a) a third `SceneRole`
`line` (every consumer that switches on role — hit-tests, text places, the story overlay, the
audit — would need the case; `element` with a `track` needs one rule in `planMotion`); (b) register
a line as both an element and a relation (two entries for one id, and the `relationsByKey` map
would hold something with no `from`); (c) a `LineInfo` list in the render message (a third list to
keep in step with `elements` for selection, layers, z-order and deletion). Recommendation: an
element whose group carries a `track`, with `ElementInfo.line`.

### Effects on lines

`planMotion` animates any group that carries a `track` as a connector, whatever its role: flow
particles, a moving dash, the relation glow of a pulse and a trace along the line; `bounds` is
used only when there is no `track`. The model's `animationTargetFits` accepts `line` elements for
`flow` and `trace`, and `dash` on them (a line has a stroke; `NO_OUTLINE_KINDS` does not list it).
Alternative: pulse as a halo on the bounding box (a rectangle around a diagonal line is a halo
around nothing). Recommendation: a line is a connector for every effect.

### Editing a line on the canvas

Selected by its stroke, a line shows its route outline and handles; dragging an end or a bend
moves that point (snapped to the grid), dragging a midpoint inserts a bend, double-clicking a bend
removes it, and dragging the line itself (a press on its stroke that moves past `DRAG_THRESHOLD`)
moves every point; arrow keys nudge it. Each drop posts `setLinePoints { element, from, to, via }`
in diagram coordinates and the session subtracts the parent's origin and writes the statement's
tuples with the minimal edits `setPosition` uses (`pointEdits`, `plan.ts:460`), so comments and
the rest of the line stay; a `via` list that becomes empty is removed and one that appears is
inserted after `to`. The live preview during a drag is the canvas's own overlay (the clean points
moved), not a layout round trip, since nothing else moves with a line; the drop renders. There is
no end to drop on a box: a line's ends are points, so no magnets, no outline of a box under the
pointer. The inspector of a selected line shows the relation's strip rows (stroke, line, width,
both heads with `none` greyed, the route kind with `polyline` greyed, corners) and the fields
label, description, layer and classes, none of a box's (shape, radius, rotation, icon position):
the `line` kind joins the kind tables of `packages/editor/src/inspector.ts` beside `relation`.
Alternative: reuse `setVia`/`setEnd` with the line's id (their shape names ports and
elements; a line has neither). Recommendation: one `setLinePoints` action and operation.

### Drawing a line with the arrow tool

In a free diagram, a press of the armed relation tool on empty canvas starts a `line` drag: past
`DRAG_THRESHOLD` a ghost line follows the pointer from the snapped press point to the snapped
pointer, Shift constrains it to 45° steps, and the release posts `createLine { from, to, parent?,
line, heads }` where `parent` is the group under the press point, as `create` finds it. A press on
an element keeps today's click sequence (the source, then the target), and a press on empty canvas
released before the threshold keeps today's announcement, so flow diagrams and the two-click
habit are untouched. The armed kind maps to written styles: `--` nothing; `---` `line dashed`;
`->` `arrowhead <head>`; `-->` `line dashed; arrowhead <head>`; `<->` `arrowtail <head>; arrowhead
<head>`; `<-->` the same with `line dashed`, where `<head>` is the effective theme's `arrowhead`
token (so an editorial sheet gets `open`, a technical one `triangle`). The new line is selected and
the status line says what was drawn. Alternatives: a Line tool of its own (a fourth gesture for
what the arrow tool already means: "draw a connection"); write `arrowhead triangle` literally (the
theme's head would not apply, and a theme switch would leave a stray triangle on an editorial
sheet); a `heads` fact on lines (the statement has no token to carry it, and a style says the
same). Recommendation: the arrow tool's drag, with the theme's head written.

### `sketch` as a theme token painted by the renderer

`sketch none|light|rough` joins `THEME_TOKENS` (`SKETCH_LEVELS` in the schema), `Theme.sketch`,
the theme panel's "Shapes and lines" group with pictures, and `Scene.sketch` set by the layout
from the resolved theme. `packages/render/src/sketch.ts` exports `sketchItems(items, level)`:
walking the scene, every stroked `rect`, `path` and `polyline` of a group whose role is `element`,
`relation`, `label`, `frame`, `lifeline` or `event`, and the markers inside them, becomes a fill
item with `stroke: none` (when it has a fill) followed by two stroke-only `path` items whose `d`
is the outline resampled into pieces of 16 px (`light`) or 12 px (`rough`), each sample moved
along the outline's normal by a jitter of at most 0.6 px (`light`) or 1.4 px (`rough`) from a
PRNG (mulberry32) seeded by a hash of the group's id and the pass index; corners get a small
overshoot of the same amplitude; `rect` items are converted to a path of four sides with quarter
arcs for `rx` before resampling; the dash pattern, `dash` offset, `className`, opacity and
`transform` are copied to both passes, the second pass at the same width. Text, images, icons
(`role: "icon"`), the brand mark, gradients and patterns are untouched, fills stay clean, and the
scene the layout returns, its `track` and `bounds`, the canvas overlays, hit tests, magnets and
text places are the clean geometry: only `renderSvg` (and so every export, the canvas's drawing,
the animated profile and the motion frames, all of which go through it) paints the passes.
`outlineIndex` and `strokeOf` read the clean scene, and the dash effect's `dash` offset is copied
to both passes so the dash moves on both. Seeding by the group id makes an edit elsewhere leave a
shape's wobble alone, and the same text always renders the same bytes; an anonymous relation's key
(`a->b#1`) and a generated id change when statements are reordered, so their wobble changes with
them, which is stated in the docs. Two built-in themes `sketch.light` and `sketch.dark` extend
the technical pair with `sketch light` and `corners rounded`; `BUILT_IN_THEMES` lists eight,
`sketch` is a reserved import name, the `layout.unknown-theme` hint names the eight, and the
strip's light/dark switch works on the family. Alternatives: (a) `rough.js` (MIT; a download the
owner has not approved; its per-shape randomness is not seeded by default, and the renderer would
gain its first dependency); (b) a per-element `sketch` style (draw.io has it diagram-wide; a
mixed picture looks like a mistake, and a theme is where the family puts the look, decisions 0007
and 0013); (c) an SVG filter (`feTurbulence` and `feDisplacementMap`: not deterministic across
renderers, dropped by some PDF and video captures, and it would wobble text); (d) sketch in the
layout's scene (every consumer of the scene's geometry would see jittered paths). Recommendation:
a theme token painted by the renderer.

### The hand font

The sketch themes name a hand font once the owner approves the download; the candidates with
their licences: Patrick Hand (OFL, Google Fonts, `@fontsource/patrick-hand`), Caveat (OFL,
`@fontsource/caveat`), Gloria Hallelujah (OFL, `@fontsource/gloria-hallelujah`), Architects
Daughter (OFL, `@fontsource/architects-daughter`), Virgil (OFL, Excalidraw's former font, no
Fontsource package) and Excalifont (Excalidraw's own font; licence to verify, no Fontsource
package). The recommendation is Patrick Hand: upright, legible at 13 px, OFL, on Fontsource, one
weight (400, the label weight 600 falls back to it). It is bundled as the three families are
(decision 0012): the Fontsource subsets for embedding and measurement (one weight, Latin
subsets; the complete font only if the subsets drop glyphs the corpus uses), added to
`packages/fonts`, `docs/language/fonts.md`, `THIRD_PARTY_LICENSES.md` by `pnpm licenses:inventory`,
and the font tests. Until the download is approved the two themes write Inter as `font`, so every
task of this change but the font's runs; when the font lands, the sketch pictures are regenerated
once more. Alternatives: name the font before it is bundled (every sketch picture would carry
`layout.unmeasured-font` and estimated widths, and the snapshots would move twice anyway); draw
the text with the sketched strokes too (text drawn as wobbly outlines is unreadable at label
size). Recommendation: Patrick Hand, gated on the approval.

### `verticalAlign` within the shape's text band

`verticalAlign` (`VERTICAL_ALIGNS = top | middle | bottom`) joins `FREE_STYLE_PROPERTIES`, the
layout's `ResolvedStyle`, the declared-type validator and the docs; `middle` is the default; flow
diagrams refuse it as they refuse `textAlign` (`prop.invalid-value`, decision 0043). In the box
drawer the text block (label lines, description lines, the icon beside, above or below) keeps its
height from `textBlock` and its centre `y` moves: `middle` is `shapeTextCenter` as today; `top`
and `bottom` search the shape's band with `shapeTextSpanner` from the top (or the bottom) of the
shape's text area for the first row band `blockHeight` tall, `padding` inside the area's edge,
whose inscribed span holds the block's width, and place the block there, clamping back towards
the middle when no such band exists (an ellipse with a wide label at the top). The band's edges
per shape: the box for `rounded`, `rectangle`, `square`, `framed`, `pill`, `hexagon`, `octagon`,
`parallelogram`, `trapezoid`; the curve for `ellipse` and `circle`; the body under the rim for
`cylinder`, the body above the tail for `callout`, the page above the wave for `document`, the
shaft for `arrow`, the part away from the notch for `flag` (`shapeTextArea` already knows each).
The label audit (`layout.label-cut`, `layout.label-overlap`) and `layout.text-overflow` measure the
block where it is placed. The inline editor's `TextPlace` is read from the drawn lines, so its
anchor follows; its `area` for a box takes the band the block was placed in, so typing stays
where the text is drawn. Alternatives: `verticalAlign` on flow nodes too (decision 0043 keeps the
text properties free-only, and a flow node's text is sized by the engine's box); a pixel offset
(`textOffset (0, -8)`: precise but not what draw.io's "vertical align" is, and it does not know the
shape). Recommendation: free boxes, within the band.

### `layout.vertical-align-ignored`

Like `layout.label-position-ignored` (`layout.ts:778-845`): once per statement that writes
`verticalAlign`, or once on the diagram's `theme` for a theme rule or class, when no element it
styles uses it, with three hints: on `triangle`, `pentagon`, `star`, `person`, `agent` and `icon`
shapes, whose text spot is fixed, "choose a shape with a text band or remove it"; on a box whose
`iconPosition center` puts the band at a `labelPosition` edge, "the band is at `labelPosition`";
on texts, icons, images, groups, lines and the kinds of other profiles, "remove it". Words in the
layout catalog (en and es), a row in `docs/language/diagnostics.md`. Alternative: silently ignore
(the precedent reports, and the owner's "defaults over blocking" asks for a default plus a word,
not silence). Recommendation: the warning.

### The alignment picker

The strip gains `style.textAlign` and `style.verticalAlign` after `style.shape` for free boxes
and `style.textAlign` alone for free texts, before `style.iconPosition` and the Effects row, whose
cards `panel-and-effects-polish` adds, so the strip keeps one order across the two changes
(`STRIP` in `inspector.ts`; the two fields leave
`FREE_STYLE_FIELDS`), each an `enum` field with the glyph families `textAlign` and
`verticalAlign`, placeholders `center` (`left` for a text) and `middle`. The canvas inspector
pairs them into one control, `alignField`: a 3 × 3 grid of cells headed "Text alignment", each
cell a radio with the picture of its pair (nine small pictures of a text block in a box), the
written pair pressed and the default pair greyed in a dashed cell; arrows move through the grid,
Enter or Space chooses, Escape leaves; a cell writes `setField` for the property that changes
(one or both, as a batch plan when both), and the "theme" chip of the row removes both. A text's
control is the three horizontal cells. Alternatives: two glyph rows (six chips for what draw.io
shows as one grid); a select (words where the rest of the strip shows pictures). Recommendation:
one nine-cell grid.

### Documentation, changelog and decision

`docs/language/grammar-0.2.md` (the token table at 36, the EBNF at 65, the flow statement table at
136, the free table at 226-236, the theme tokens at 318-332), `styles.md` ("Arrow heads" 143-168,
"Tokens" 43-70 with `sketch`), `layout.md` ("Connectors" 159-217: lines), `free.md` (the objects
table 43-53, "Text and shapes" 55-70 with `verticalAlign`, a "Lines" section), `svg-export.md`
("Connectors" 90-137: headless relations; a "Sketched strokes" paragraph), `model-json.md` (the
relation table 122-139, the element table 102-120), `diagnostics.md` (the hint at 24, a row for
`layout.vertical-align-ignored` after 119), `fonts.md` ("Bundled fonts" 8-22), `motion.md`
("Targets and channels" 42-58), with the Spanish copies; `docs/editor.md` (the gestures table
187-259, the keyboard 326-370, "Shapes and containers" 548-552, "Free compositions" 627-648,
"Styling and themes" 732-774) and `docs/es/editor.md`; the skill references `language.md` (rows
55, 106-107, 120-128, 202) and `free.md` (56, 172) then `pnpm skills:sync`; `CHANGELOG.md`'s
1.10.0 section under "Canvas (VS Code and the playground)" and a new "Language" subsection;
`docs/decisions/0058-lines-sketch-and-text-alignment.md`, linked from 0043 (text alignment),
0013 and 0007 (a look as a theme token), 0018 (the free profile), 0003 (the statement shapes) and
0012 (fonts).

## Motion

- **The kinds menu.** The six items open with the menu's own rise over `--mdg-motion` and the
  pictures of the two line kinds are drawn with the same strokes as the arrows', so the menu reads
  as one family; the badge beside the pointer swaps its glyph with a 120 ms cross-fade when R
  cycles.
- **Drawing a line.** The ghost line appears when the drag passes the threshold and follows the
  pointer on every frame without easing (as moves do); its end snaps to the grid with no
  transition; on release the ghost fades out over `--mdg-motion-fast` while the rendered line
  appears, and the new line's selection outline fades in with the selection as every outline does.
- **Editing a line.** Its handles fade in with the selection; a dragged end or bend follows the
  pointer without easing, the outline redrawn each frame; a removed bend's handle fades out over
  `--mdg-motion-fast`; a nudged line moves without easing, as nudged boxes do.
- **The alignment picker.** The grid opens in place with the strip; the pressed cell's picture
  slides to the chosen cell over `--mdg-motion-fast` (a transform on the highlight, not a
  re-render), and the drawing updates on the next render; cells scale to 0.98 while pressed, as
  the chips do.
- **Sketch on the canvas.** Switching a diagram's theme to `sketch.*` re-renders as any theme
  switch does; the theme panel's `sketch` row is a glyph row whose three pictures (a straight, a
  lightly wobbly and a rough line) share the chips' hover and press motion.
- All of it is dropped under `prefers-reduced-motion: reduce`, where the tokens are 0 ms.

## Risks / Trade-offs

- [`line` collides with the style property `line`, the colour token `line` and the glyph family
  `line`] → the kind is a statement keyword and the others are values or property names; the
  parser already tells `line dashed` (a property in a block) from `line l from …` (a declaration
  in a body) by position, the TextMate grammar scopes the keyword list and the property list
  separately, and completion offers the kind in a body and the property in a block. `rule line {
  line dashed }` reads oddly but is correct; the docs say so once.
- [Lexing `--` changes recovery of today's unknown tokens] → `canStartSomething` makes `--` a start,
  so `a --b` recovers at `--`; the lexer tests pin `--`, `---`, `--->`, `--5`, `a --b` and the
  hint's wording, and the round-trip test over the corpus keeps `toText(parse(text)) === text`.
- [Every `.model.json` snapshot changes for `heads`] → one `--update` run of the model and render
  corpus tests, read as a diff of one added key per relation before it is committed.
- [Imported sheets change: relations that only needed a name for `arrowhead none` lose it] →
  the import corpus under `corpus/import` is regenerated and read; the spec scenarios say what
  the sheets hold now.
- [A line is an element without a box in the usual sense] → its box is the bounding box of its
  drawn points, so marquees, derived groups and the composition checks work; alignment and
  distribution skip lines (they have no edges to align), copy and paste shift its points as they
  shift places, and the delete path removes its `label` statement as a relation's dependents are
  removed; the free tests cover each.
- [Sketching triples the stroked items and grows the SVGs] → measured on the gallery and the
  acceptance pictures (a sketched copy of `shapes` and the roadmap); the clean scene is what every
  consumer but `renderSvg` reads, so nothing else grows; the sketch themes are opt-in.
- [The dash effect on a sketched stroke] → both passes carry the `dash` offset and `className`, so
  the moving dash moves on both; `outlineIndex` finds the first stroked item in the clean scene.
- [Anonymous keys move the wobble when statements are reordered] → stated in `svg-export.md`;
  named targets are stable, and the determinism acceptance renders each sheet twice.
- [The hand font is not approved] → every task of this change runs without it; the sketch themes
  use Inter until it lands and are regenerated once when it does.
- [A top-aligned label in a narrowing shape is cut] → the band search clamps the block back
  towards the middle when no band holds it, the audit measures the block where it is, and the
  layout free tests cover an ellipse with a wide top label.
- [The inline editor disagrees with a top-aligned drawing] → `textPlaces` reads the drawn lines,
  and `test/text-places.test.ts` asserts the editor's anchor and area on a `top` and a `bottom`
  box.
- [MODIFIED blocks colliding with the sibling changes at archive time] → this change modifies
  "Lexical structure", "Relations", "Relation tool", "Token table", "Built-in themes",
  "Completion", "Effect targets", "Flowchart links", "Mermaid architecture diagrams",
  "Description arrows and notes" and, in the one phrase that counts the arrow button's kinds,
  "Creating and connecting" and "Free palette and pickers", which `panel-and-effects-polish` and
  `pointer-and-notes` leave untouched (they add requirements to those specs); everything that
  touches "Free objects", "Free objects are drawn", "Route editing" and "Style strip with corners
  and rotation" is an ADDED requirement. One block is shared: "Free diagrams compile" of
  `free-diagram-model`, whose list of declarations this change extends with `line` and
  `pointer-and-notes` with `note`; each block adds only its own kind, and whichever change archives
  second rebases that block on the then-current main spec before `openspec archive` (task 9.4).

## Open Questions

- The hand font for `sketch.light` and `sketch.dark`: the owner approves the download of
  `@fontsource/patrick-hand` (OFL-1.1; or Caveat, Gloria Hallelujah or Architects Daughter, all
  OFL on Fontsource; Virgil and Excalifont have no Fontsource package and Excalifont's licence
  must be read first). Until then the two themes use Inter with sketched strokes, and task group
  7 waits.
