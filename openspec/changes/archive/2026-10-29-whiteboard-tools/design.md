## Context

**What a free diagram holds today.** The free kinds are `box`, `text`, `icon`, `image`, `note`,
`line` and `group` (`FREE_ELEMENT_KINDS`, `packages/model/src/schema.ts:80-88`; `FreeElementKind`,
`src/types.ts:28`; `FREE_DECLARATIONS`, `src/flow.ts:2212-2241`); `ALL_ELEMENT_KINDS` and so
`RULE_KINDS` (`schema.ts:130-138`, `:226`) do not list `line`, which is why `rule line` in a theme
block is refused and `addRule` exempts only `relation` from the relation-only refusal
(`src/style-values.ts:688-701`), so `rule line { arrowhead … }` is refused today. A `line`
compiles through `declareLine` (`flow.ts:801-869`): the label is the optional second argument,
`readPoint` takes a `Tuple` of exactly two unitless `NumberLiteral`s (`flow.ts:2256-2262`; the
lexer keeps decimals and negatives, `packages/language/src/lexer.ts:176-201`), the points are
stored as `Element.line: { from, to, via }` (`types.ts:140-145`), `place` and `size` are refused
with `lineHasPoints` (`flow.ts:1845-1853`), and the model stores no routing or heads: the layout
applies them (`layout.ts:1859-1940`, heads `none` at `:1872-1873`). The style properties are one
table (`STYLE_PROPERTIES`, `schema.ts:425-450`): `width` is 0 to 16, there is no `opacity` (only
scene items have one, `packages/layout/src/scene.ts:35`, `50-52`, `66`, `128`), the free-only
text properties live in `FREE_STYLE_PROPERTIES` (`schema.ts:414-419`) and are refused in flow
diagrams by `refuseFreeProperties` (`style-values.ts:457-470`). Group blocks take `description`,
`class`, `layer`, `link` and `url` (`FREE_PROFILE`, `schema.ts:592-638`). `PRESETS` are
`document` and `slide` (`schema.ts:227`) and `canvasSize` returns the larger of the content and the
canvas (`layout.ts:2852-2899`). `THEME_TOKENS` holds the colours `background`, `surface`, `ink`,
`muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd`,
`success`, `warning`, `danger`, `info` (`schema.ts:364-393`; the token table,
`openspec/specs/theme-tokens/spec.md:6-27`); the eight built-in themes are in
`packages/layout/src/theme.ts`. `STORY_ACTIONS` are reveal, hide, highlight, focus, camera, trace,
hold and parallel (`schema.ts:793-802`), `storyTargetKind` returns `element` for a free line
(`src/story.ts:517-525`), so `trace line1` in a story is `story.invalid-target`, and `storyFrame`
draws a trace up to its progress on the dash channel (`packages/motion/src/story.ts`;
`openspec/specs/story-timeline/spec.md:14-36`). The model JSON writes `line` after `shape`
(`src/json.ts:258-294`, `707-746`); the model diff does not compare line points (`src/diff.ts:243-275`).

**How the layout draws and arranges.** A line becomes a connector plan beside the relations'
(`linePointsOf`, `lineBox`, `layout.ts:565-584`; `lineAnchors` at `:1485-1501`) and
`emitter.line` builds a group with role `element`, a `track` and `bounds` (`:4842-4884`), with
`connectorItems` emitting polylines or one bezier path (`:4890-4967`; `bezierThrough` is a
Catmull-Rom chain, `src/routing.ts:245-290`) and `markerItems` the heads (`src/markers.ts:289-309`).
Lines are removed from the composition checks (`:1957-1958`) and painted in `paintOrder`
(`src/free.ts:164-186`). Free text and notes draw one `TextItem` per `\n` line (`splitLines`,
`src/text.ts:23-25`; `freeText` at `layout.ts:4403-4433`, `note` at `:4714-4762`), measured by the
bundled fonts (decision 0012); nothing wraps. A group without `size` is derived from its children
(`docs/language/free.md:254-259`), a child's `place` is in the interior (`LayoutResult.origins`), and
the engine arranges unplaced children in `assisted` and everything in `auto`
(`arrangeRequest`; `docs/language/free.md:483-491`). The renderer writes `<polyline>` and `<path>`
items (`packages/render/src/svg.ts:322-349`), and `sketchItems` repaints every stroked item of the
element, relation, label, frame, lifeline and event groups in two passes (`src/sketch.ts:31-38`,
`55-84`); its `smooth` already draws a quadratic curve through midpoints (`sketch.ts:434-445`).
Effects run along any scene group with a `track` (`packages/motion/src/plan.ts:119-123`).

**How the canvas creates, drags and shares.** `tool` is `ElementKind | "relation" | undefined`
(`packages/canvas/src/app.ts:465`), the palette is `PALETTE` (`:303-320`) built by `buildToolbar`
(`:3234-3523`) with `splitArrow` menus (`:3529-3564`; the shapes at `:3612-3629`, the group kinds
`group` and `container` at `:3656-3675`, `openGroupKinds` at `:3678-3711`), and the kept choices
are `shape`, `arrowKind` and `groupKind` (`:569-573`) in `PersistedState` (`:114-129`) written by
`persist()` (`:1458-1461`). `arm()` refuses read-only, puts the Pointer away and toggles the tool
(`:5674-5694`); every box tool disarms after one creation (`:4178-4191`). The `Drag` union
(`:161-256`) has `pan`, `laser`, `band`, `move`, `resize`, `rotate`, `label`, `bend|segment`,
`end`, `connect`, `lineDraw`, `linePoint`, `event` and `minimap`; `lineDraw` starts under the
relation tool on empty canvas (`drawsLine`, `:5750-5756`), draws a ghost (`drawLineGhost`,
`:2826-2876`) and posts `createLine` on release (`:4679-4714`), which the session snaps and
converts to the parent's interior (`packages/editor/src/session.ts:1652-1678`) and the edit package
writes with integer points (`packages/edit/src/lines.ts:17`, `33-72`); `setLinePoints` rewrites
the tuples (`lines.ts:126-150`), collapsing a multi-line `via` onto one line. The overlay is SVG
with `pointer-events: none` and handles that take events (`canvas.css:448-528`); the presence
layer is a 2D canvas between the outlines and the cursors that strokes trail segments per frame
(`presence-layer.ts:58`, `88-115`; `trail.ts:104-129`), fed by `laser` batches of at most 64 points
with `t` 0..1000 (`presence.ts:135-136`; `takeLasers`, `app.ts:2266-2294`) that the canvas posts
every 50 ms (`queueLaser`, `:2229-2259`) and the page sends in the 250 ms awareness state
(`packages/playground/src/cloud/presence.ts:45`; `presence-wire.ts:40-41`), which the room bounds
(`packages/cloud/src/room-awareness.ts:36-38`, `44-45`, a 16 KiB message). Hit-testing is DOM
`closest` on `[data-role]` (`hit()`, `:4084-4120`) with `.mdg-hit` areas added by `setSvg`, a 10 px
stroke polyline for lines (`:1895-1911`); `painted()` excludes lines from the geometric stack
(`:2010-2015`). The live preview plans a move on a copy (`previewAction`, `:2950-3097`). The
inline editor sizes its frame from `ElementInfo.text: TextPlace` (`inline.ts:23-49`;
`protocol.ts:98-125`) and commits with `setLabel` (`:6049-6074`). The free keymap binds c, r, o, b,
t, i, m, f, g, l, u and k and leaves a, d, e, h, j, n, p, q, s, v, w, x, y, z free
(`packages/editor/src/canvas/keyboard.ts:118-190`). `view-only.test.ts` lists every `CanvasAction`
kind and every `CanvasMessage` type exhaustively (`:243-246`, `:257-309`). `moveElement` moves a
declaration after the last of the destination block and writes `place` when `at` is given
(`openspec/specs/source-editing/spec.md:280-298`); `reorderElement` moves it forward or backward
in its block (`free-editor-tools` "Order and layers on the canvas").

**Templates, gallery, tests, words.** `TEMPLATES` has five entries (`packages/project/src/templates.ts:33-60`)
whose files live under `packages/cli/templates/<name>/`; the playground's build writes
`templates.json` and two thumbnails per template (`packages/playground/build.mjs:180-216`), the
cards are `new-project.ts:76-133`, and the counts are asserted in `packages/cli/test/init.test.ts:38-76`,
the playground messages test (`:47-58`), the browser suites (`run.ts:1536`, `:2178`) and the
explorer spec ("five cards", `openspec/specs/project-explorer/spec.md:177-188`). `GALLERY_SHEETS`
holds two free sheets (`packages/acceptance/src/gallery.ts:18-55`; the profile list is asserted
at `test/gallery.test.ts:38-46`); `corpus/acceptance/free/*` is listed by name in
`packages/acceptance/test/corpus.test.ts:13-25` and the visual references are re-recorded whole by
`pnpm acceptance:visual --update` (`src/visual.ts:60-79`). The webview suite is a `tests` array of
177 entries with `dragBy`, `dragTo`, `pageAt` and `h.text` (`packages/vscode/test/webview/run.ts:465-985`,
the free fixture at `:85-104`); the playground suite's free tests are at `run.ts:1273-1360`; the
live scenarios at `packages/cloud/test/browser/scenarios-live.ts:74-324`. The glossary
(`packages/i18n/README.md:45-110`) has no word for pen, highlighter, eraser, sticky or board; the
Spanish docs say "pizarra" for whiteboard (`docs/es/language/styles.md:18`). The changelog's
1.10.0 section is dated 2026-10-28 in the uncommitted release (`CHANGELOG.md:7`); decision
numbers 0060 to 0063 are taken, 0064 is next.

## Goals / Non-Goals

**Goals:**

- A free composition is a whiteboard: freehand strokes, highlighter marks, stickies that fit
  their words, columns and rows that order their cards, on a board that grows, all written as
  statements that `validate`, `export`, the player and a coding agent understand.
- The gestures feel like Miro's: a pen that stays in the hand, strokes that appear as they are
  drawn (for the person and for the room), cards that make room when one is dropped between them,
  a plus at the end of every list, and an eraser that takes one undo step.
- An explanation drawn on the board replays as a story, a video and an animated SVG.
- Two templates (`kanban`, `whiteboard`) and a gallery sheet show it on day one.

**Non-Goals:**

- Importing strokes or boards from other tools, recording a session as a story, pressure-sensitive
  width, widgets that are not diagram objects (the proposal's Non-goals).
- A brush engine or a raster layer: every stroke is a vector path with one width.
- Infinite scrolling with a lazily rendered scene: the stage is already unbounded and a board of
  a few thousand strokes renders as one SVG; a sheet past the 2 MiB source limit is its own
  problem.
- Changing how boxes size themselves: wrapping and shrinking belong to stickies alone.

## Decisions

### D1. The keyword is `pen`

`pen <id> [(x, y), (x, y), …] [{ … }]`. The kind is `pen`, the tool is the Pen, the word in prose
is a stroke. The list is the `via` grammar (tuples, commas optional, continuation inside brackets,
`parser.ts:843-883`), read by `readPoint` as a line's points are. One point is a dot. The block
takes the free element block properties minus a label; `place`, `size` and `rotation` are refused
with the line's message.

- *`ink`*: already a colour token (`THEME_TOKENS`), so `ink i1 […]` in a diagram and `ink "#222"`
  in a theme would be two things named alike in one file, and completion in a theme block would
  need to tell them apart.
- *`stroke`*: the style property that colours it, on the next line (`style s1 { stroke accent }`).
- *`draw`*: a verb, and the story action of this change.
- *`path`, `freehand`, `scribble`*: `path` is SVG's word for any shape, the others are long or
  childish.
- *A `line` with forty bends*: forty handles, a label pill, routing choices and an `orthogonal`
  mode that mean nothing for a stroke, and the overlap of "bend" and "point" in every message.

**Recommendation:** `pen`. The owner may prefer `ink` or `stroke`; the change is a rename in one
table and the docs (open question 1).

### D2. Points in the statement, to a tenth, simplified once, printed filled

The canvas keeps the raw pointer positions (coalesced events, `PointerEvent.getCoalescedEvents`)
in diagram units during the drag and simplifies them once at the release with
Ramer–Douglas–Peucker at a tolerance of 0.75 screen pixels divided by the zoom, so a stroke drawn
zoomed in keeps its detail and one drawn zoomed out does not carry a point per pixel. Coordinates
are rounded to a tenth (`formatNumber` already rounds to two decimals, `packages/edit/src/text.ts:42-45`;
`createLine`'s integer rounding stays for lines) and printed without a decimal when whole. The
formatter prints a pen's list filled to 100 columns (`[` ending the first line, tuples one level
deeper, a trailing comma per line, `]` alone), a new rule keyed on the statement's keyword in
`format.ts`, because the existing rule (one item per line when expanded, `format.ts:134-138`,
`208-228`) would make a stroke of forty points forty lines, and a one-line list of forty tuples
is 500 columns. `via` lists keep the existing rule; `setLinePoints`'s collapse is untouched.

- *Integers*: a stroke drawn at 400 % loses its curves to half-unit steps.
- *Two decimals*: twice the characters for detail nobody sees at 100 %.
- *No simplification*: 120 points a second from a stylus, six times the file for the same picture.
- *Simplification by a fixed diagram-unit tolerance*: either too coarse zoomed in or too fine
  zoomed out.
- *A separate `.ink` file or a binary blob*: the sheet stops being one text that Git diffs and an
  agent reads; decision 0001 and the whole editing contract rest on the text being the truth.

### D3. The path is drawn by the layout, as a quadratic chain through midpoints

`emitter.pen` (beside `emitter.line`) builds a group with role `element`, `track` (the points
from the interior origin) and `bounds` (the points' box grown by half the width), holding one
`path` item: `M p0`, then for each inner point `Q p_i mid(p_i, p_{i+1})`, then `L p_last`, with
round caps and joins, no fill, the resolved `stroke`, `width`, `line` and `opacity`; a single point
is `circlePath` of the width as a degenerate line is; heads come from `markerItems` along the end
segments, cut as a line's are. The scene carries the path, so the canvas, `export`, the player and
the video draw the same curve. `sketchItems` skips pens (a `pen` role or a flag on the group): a
freehand stroke jittered twice is a different drawing. The checks (`checks.ts`) drop pens as they
drop lines; the derived group size and `canvasSize` count their bounds.

- *Catmull-Rom cubics (`bezierThrough`)*: overshoots on sharp turns of a quick hand and needs 12
  samples per segment for the track; the midpoint chain is what the sketch module already draws
  and never leaves the hull of the points.
- *A polyline of the raw points*: visibly jagged at 2 px widths after simplification.
- *Variable width from pressure (a filled outline polygon, perfect-freehand's method)*: pressure
  per point in the file, a filled shape instead of a stroke (no `line dashed`, no heads, no dash
  effect), and tablets without pressure draw the same as with; excluded by the proposal.
- *Smoothing in the renderer only*: the canvas's hit areas, the motion track and the HTML views
  would see a different line from the picture.

### D4. `opacity` is a free style property; `width` grows to 64

`opacity` (0 to 1) joins `FREE_STYLE_PROPERTIES`: accepted on elements, groups, lines and pens
of free diagrams, refused on relations and in flow diagrams, rendered as the `opacity` attribute
of the element's or group's scene group (`svg.ts` already writes item opacity). The highlighter
is a pen with `width 20; opacity 0.35; stroke highlight`: one path with `stroke-opacity`, so a
stroke that crosses itself does not darken where it overlaps, and the text under it stays
readable. `width`'s range becomes 0 to 64 on every target (`STYLE_PROPERTIES`, the two spec
blocks that say 16, the docs), and a pen refuses 0.

- *`mix-blend-mode: multiply` for the highlighter*: prettier over dark text, but a CSS property
  that PDF captures and some SVG viewers drop, and decision 0058 keeps the picture deterministic
  across renderers.
- *A `highlighter` kind or a `marker` property*: a second kind for one width and one opacity.
- *`opacity` on pens only*: a generic property with one legal target is a trap in classes.
- *A pen-only width range*: `checkArg` ranges are per property, and a class with `width 30` would
  be valid or not depending on who wears it.

### D5. Stickies are a kind, not a shape

`sticky <id> "Text" [{ … }]` joins `FREE_ELEMENT_KINDS` beside `note`; the text is required
(as a note's is, `notesNeedText`), `shape` is refused as on a note, and `rule sticky` exists. The
layout's `sticky` drawer: a 160 × 160 default (scaled with `labelSize` as the shape sizes are),
never grown; the text wrapped at the inner width (the width minus twice `padding`) by a new
`wrapLines(text, width, measurer)` in `text.ts` (greedy at spaces, a word longer than the width
broken at it, `\n` kept), font size `fontSize` or 1.2 × `labelSize`, stepped down by 1 to 8 until
the block fits the inner height, `layout.text-overflow` (warning, with a size in the hint) and a
clip when it still does not; a shadow rect 3 px lower at 15 % black, the card rect with `fill`
(the theme's `sticky`), `radius` 2, a stroke only when styled, an icon at the top left when
styled, the text in `stickyText` aligned by `textAlign` (`center`) and `verticalAlign` (`middle`).
Anchors, magnets, ports, overlap and the label audit treat the card as a rectangle; rotation
turns it. The inline editor gets a `TextPlace` whose area is the inner box and whose font size is
the drawn one, with `white-space: pre-wrap`, so typing wraps as the card will.

- *`shape sticky` on a box*: the one shape that would not grow for its text, would shrink its
  font and would carry a shadow; the shape table is geometry and every box rule would need "except
  sticky". Rejected once already (`pointer-and-notes/design.md:252-256`).
- *A note with a fill*: a note's default is no outline, left alignment, the muted colour and the
  note size, and it grows; a sticky is the opposite on every count.
- *A `wrap` property for every box*: a general feature with its own rules (which shapes, what
  happens to `layout.text-overflow`), beyond what the owner asked for; stickies are where
  wrapping is expected.
- *Shrinking the text of boxes too*: "Text SHALL never be scaled down to fit" is a rule of the
  canvas sizing; stickies are the one card where Miro, FigJam and real paper shrink the writing.

### D6. Sticky colours: the theme's token plus six fixed hex values

The theme gains `sticky` and `stickyText`; the sticky button's arrow offers the theme's colour
and six fixed ones (yellow `#fff59d`, pink `#f8bbd0`, green `#c8e6c9`, blue `#bbdefb`, orange
`#ffe0b2`, purple `#e1bee7`), a fixed one written as `style <id> { fill "#…" }`, and the strip's
fill row shows the six before the tokens for a sticky. `stickyText` is near-black in every theme,
because the six pastels are the same in a dark theme: a sticky is a physical object, not a surface
of the theme.

- *Six theme tokens (`sticky1` … `sticky6`)*: themes could restyle the palette, but six tokens for
  one tool, and a file that says `fill sticky3` says less than `fill "#f8bbd0"`.
- *Only the theme's colour*: a kanban with one colour of card loses half its point.

**Recommendation:** the token plus six fixed colours (open question 2).

### D7. Lists are `layout column | row` on a group, with `spacing` and `align`

Three group block properties of free diagrams, read beside `description`, `class`, `layer`,
`link` and `url` (the diagram-level `layout manual|assisted|auto` stays a diagram statement; the
model reads the group block's `layout` in its own context, and completion and hover tell them
apart by where the caret is). `spacing` is the word the sequence change gives the same idea
(`spacing <n>` between participants); `align start|center|end|stretch` is the cross-axis word
of every flex layout. The layout arranges the children in source order along the axis
(elements and groups; lines and pens keep their points), the group's written `size` is its least
size and it grows with its children, a `place` on a child is `layout.place-ignored` (warning, so
adding `layout column` to an existing group keeps the file compiling and the canvas drawing; the
quick fix removes the place), and the engine sees a list as a leaf of its derived size in every
mode (`arrangeRequest` emits no request for its children). Nested lists work: a row of columns is
a board, `align stretch` on the row makes the columns equal.

- *`stack vertical|horizontal`*: "stack" already means a box drawn inside a box (decision 0043,
  the skill's "Containers, stacks and bands").
- *`flow` or `direction`*: `flow` is a diagram type and `direction` the engine's `LR|TB`.
- *`list column`*: a property named after the thing rather than the arrangement; `layout` reads
  as "this group's layout is a column", beside the diagram's "this diagram's layout is manual".
- *`place` on a child as an error*: every existing group someone turns into a list would break
  until each place is deleted; a warning with a quick fix is the editing contract's way.
- *A written `size` that clips*: a column with ten cards and `size (240, 200)` would hide eight;
  the least-size rule is what every kanban does and writes nothing.
- *Children stretched by default*: a square sticky stretched to a 248-wide card surprises; `start`
  keeps what was drawn, `stretch` is one word away (open question 6).

### D8. Dropping into a list: `move` with `index`, the bar, the preview, the plus

The canvas computes the insertion index from the drawn boxes of the list's children (the
pointer's position against the children's midpoints along the axis) and draws an insertion bar
in the `guide` colour at that gap; the live preview sends the same `move` the drop would send
(`previewAction`), so the children make room before the release; the drop posts `move { ids,
parent, index }` with no delta, which the session plans as `moveElement { parent, index }`: the
declaration moves to that position and its `place` goes. Dragging within the same list is the
same operation; dragging out writes a `place` at the drop as today; Alt keeps the group and shows
no bar. The `+` is an overlay handle (`pointer-events: all`, like the rotation handle) at the end
of a hovered or selected list; it posts `create { kind: "sticky", parent, index: last }` in a
column, or `create { kind: "group", layout: "column", parent, index: last }` in a row, with the
editor open. Ctrl+Enter does the same after the selected child; Alt+Up and Alt+Down (in a row as in a column; Alt+Left and Alt+Right
belong to VS Code's workbench, `keyboard.ts:110-117`) post `reorder` backward and forward, which already move a declaration one place in its block.

- *Writing a `place` for cards and letting the layout ignore it*: the file would carry numbers
  that mean nothing and warn on every card.
- *A separate `insertElement` operation*: `moveElement` with an index is the same edit with one
  more parameter, and the inverse is the same inverse.
- *A kanban widget with its own statement (`board`, `column`, `card`)*: three kinds for what two
  properties on a group already say, and nothing of it would be usable for a row of icons or a
  column of texts.

### D9. The pen stays in the hand; strokes are not selected; keys P, H, E, S

`arm("pen")`, `arm("highlighter")` and `arm("eraser")` set a tool that the release does not
disarm (a `STAYS_ARMED` set beside `QUIET_KINDS`); Escape, another tool, K or the button again
puts it away; `arm()` still refuses read-only and puts the Pointer away. The new pen is not
selected (`createPen` sets no `pendingSelection`), so the next stroke starts at once and the
selection outline never flashes between letters. The keys are free on the free profile
(`keyboard.ts:118-190`): P pen, H highlighter, E eraser, S sticky; the chords Ctrl+Enter and
Alt+Up and Alt+Down join the free bindings. The pen menu (the split button's arrow) holds Pen and
Highlighter, the widths thin 2, medium 4 and thick 8, and the strip's colour row (`colorRow`,
`packages/canvas/src/inspector.ts:824-912`, reused as a control of the menu); the choices are
`PersistedState.pen: { tool, width, colour, highlightColour }` and `PersistedState.sticky: { fill }`,
written by `persist()` as `shape` and `arrowKind` are not (they are session state) but as
`inspector` and `hiddenLayers` are.

- *A tool that disarms after each stroke, as box tools do*: a word of handwriting is six strokes
  and six presses of P.
- *Selecting the new stroke*: the selection ring and the inspector would jump at every stroke.
- *D for draw, W for whiteboard*: D is the flow decision and W says nothing; P, H, E and S are
  the words' initials in English and the keys Miro and Excalidraw use for the same tools.
- *The widths and colours in the inspector only*: the pen is used before anything is selected.

### D10. The stroke in progress is an SVG path on the overlay; the eraser hides, then removes

During a `penDraw` drag the canvas keeps the raw points and rewrites the `d` of one `<path>` in
`.overlay` at every `pointermove` (the same midpoint chain as D3, in the pen's colour, width and
opacity), so the stroke looks as it will be written; Shift replaces the points by the press and
the pointer (a straight segment); Escape removes the path. A `erase` drag computes, per move, the
distance from the pointer to every pen's path whose bounds the eraser circle touches (the
smoothed segments, within 8 screen pixels), adds the hits to a set, gives their scene groups a
`.mdg-erased` class (hidden at once), and the release posts one `remove { ids }` (one undo step,
one `action` message); Escape clears the set and the class. The eraser's cursor is an SVG circle of
16 px set through the same custom property as the Pointer's dot (`syncPointerCursor`,
`app.ts:2188-2201`). A pointer of type `pen` sets a `stylus` flag for the drag's duration and
`pointerDown` ignores `touch` pointers while it is set; `e.buttons & 32` (the barrel button) starts
an `erase` drag with the pen armed.

- *Drawing the in-progress stroke on the presence 2D canvas*: it would be drawn with the trail's
  segments, not the path the layout draws, and would need a redraw loop.
- *Erasing parts of a stroke (splitting it at the eraser)*: two new pens per cut, points
  recomputed; Miro's and Excalidraw's erasers delete whole strokes.
- *Erasing any object under the eraser*: a slip deletes a column; Delete exists for objects.

### D11. Peers see a stroke as it is drawn, through the laser batches

`presenceLaser` gains an optional `pen: { width, colour, opacity }` that the canvas sets while a
`penDraw` drag runs (the Pointer's batches carry none); the page copies it into `canvas.laser`
(`presence.ts`, `presence-wire.ts` with the bounds: `width` an integer 1..64, `colour` at most 32
characters, `opacity` 0..1) and the room parses and bounds it beside the points
(`room-awareness.ts`, an unfit part invalidates the message as today). On a peer's canvas,
`takeLasers` routes a batch with `pen` to a `Stroke` per person (a `Trail` whose `fade` is 0,
`trailSegments` already draws every point whole when `fade` is 0), drawn on the presence canvas
with the given width, colour and opacity and the midpoint chain, kept until a `render` host
message arrives after the batch or 10 s pass, then dropped; the pen statement the release wrote is
in that render. The traffic is the Pointer's: at most 64 points per 250 ms state, no new message.

- *Nothing until the release*: a teacher's stroke appears to the class only when the hand lifts;
  with the batches it appears as it is drawn, which is the whole whiteboard feeling.
- *A new awareness part or message*: decision 0050 keeps presence in one message; a flag on the
  batch costs twenty bytes.
- *Keeping the peer stroke until its pen arrives by id*: the batch does not know the id the
  release will choose; "the next render after the last batch" is the same moment in practice, and
  the 10 s cap covers a cancelled stroke.

### D12. `preset board`

A third preset: the canvas stays as computed (content plus `margin`, the frame strip if any),
whatever its size, with no `layout.too-large`; `canvasSize` reads it beside `document`; the
`document` warning's hint names it. The whiteboard and kanban templates write it.

- *No preset means a board*: `document` is the default of every existing sheet and its warning is
  wanted for documents.
- *`canvas infinite`*: `canvas` is a size; a word that is not a size in it is a second grammar.
- *Raising the `document` limit*: the limit is the point of `document`.

### D13. `draw` is a story action

`draw a, b [over <time>]` (800 ms by default) joins `STORY_ACTIONS` with the targets pens, free
lines and named relations (`storyTargetKind` learns `pen` and `line`, and `draw` accepts the
three; `trace` keeps relations only). `storyFrame` draws the targets one after another in the
listed order, each over a share of the time proportional to its track's length, on the dash
channel from its first point (the stroke's own colour and width, heads when complete), and leaves
them drawn; a target whose first visibility action is `draw` starts hidden, as `reveal`'s do;
the target's own effects are suspended meanwhile, as under a trace. The player, the video and the
animated SVG draw the frames as they draw a trace.

- *An `animate` effect `draw`*: effects repeat forever by default and are drawn above the static
  picture; a stroke that appears and stays is a story's business, on the story's clock.
- *`reveal` with a mode*: `reveal` is a fade; the hand-drawn feeling is the stroke growing.
- *Equal shares per target*: a dot and a sentence would take the same time; proportional shares
  read as handwriting (open question 9).

### D14. Two templates, one gallery sheet, the corpus

`kanban` ("Kanban board": `preset board`, `technical.light`, a row group with `align stretch`
holding To do, Doing and Done with six stickies in two colours, two relations between cards) and
`whiteboard` ("Whiteboard": `sketch.light`, `preset board`, a heading text, two stickies, a pen
arrow with `arrowhead triangle`, a highlighter stroke under the heading, a line, and a story
`walkthrough` that draws the strokes and reveals the stickies), both as `TEMPLATES` entries with
files under `packages/cli/templates/`, titles and descriptions in both catalogs, thumbnails by the
build; every count that says five says seven. `gallery/free/whiteboard.meltemi` joins
`GALLERY_SHEETS`; `corpus/valid/free/{pens,stickies,lists,whiteboard}.meltemi` with their
`.model.json` and SVG snapshots, two invalid cases, `corpus/acceptance/free/{whiteboard,kanban}`
in the corpus test's list and the visual references re-recorded.

- *One template that mixes everything*: a kanban is a kanban; a card that says "Kanban board" is
  what a person looking for one clicks.
- *A sticky in the existing `free` slide*: the slide is a slide; it keeps its thumbnail.

### D15. Order with the sibling changes

This change is applied after `inspector-collapse-and-tooltips` (its one-tooltip rule names every
icon-only control: the pen, highlighter, eraser and sticky buttons and the `+` follow it, with
`aria-keyshortcuts` and the key in the title) and is independent of `sequence-spacing-and-nested-calls`,
`unbranded-exports` and `agent-setup-prompt`. Its `free-editor-tools` MODIFIED block ("Free
palette and pickers") touches no requirement the siblings modify; its `diagram-canvas` and
`web-playground`-adjacent requirements are ADDED. The changelog entries go to the section that is
open when it is applied (1.11.0 once 1.10.0 is tagged).

### D16. Motion

Every new movement uses the canvas's motion tokens (`--mdg-motion-fast` 120 ms, `--mdg-motion`
160 ms, `--mdg-motion-slow` 220 ms, `--mdg-ease`, `--mdg-pop-scale`; `packages/canvas/canvas.css:15-45`)
and all of them drop to 0 under `prefers-reduced-motion`, as the tokens already do.

- **The stroke in progress** is redrawn at every pointer move and has no transition: ink must be
  where the hand is. At the release it stays on the overlay until the render that holds the pen
  arrives, then the overlay path is removed in the same frame, so the stroke never blinks.
- **Erased strokes** fade to 0 over `--mdg-motion-fast` as the eraser crosses them and stay hidden
  until the release writes; Escape fades them back in over the same time.
- **The eraser and pen cursors** are static SVG cursors; the eraser's circle shows where it
  erases.
- **The pen and sticky menus** open and close as the other split menus do (the existing pop on
  `--mdg-motion` and close on `--mdg-motion-fast`); the selected width or colour moves its
  highlight over `--mdg-motion-fast` as the alignment picker's does.
- **The insertion bar** of a list fades in over `--mdg-motion-fast` and slides between gaps over
  `--mdg-motion-fast` with `--mdg-ease`; the children make room through the live preview, which
  already animates the drawing between previews.
- **The list's +** fades and scales in from `--mdg-pop-scale` over `--mdg-motion-fast` when the
  list is hovered or selected, and out over the same time.
- **A new sticky** pops in from `--mdg-pop-scale` over `--mdg-motion` with its editor, as a new
  element's outline already does.
- **A peer's stroke** grows with its batches and, when the render that holds it arrives, the
  presence stroke is cleared at once (the written pen is drawn in the same place).
- **Story `draw`** is on the story's clock, not CSS: the stroke grows linearly over its share.

### Owner's answers (2026-10-28)

The owner asked to apply with the recommendations of this design ("Aplicar con defaults"): `pen`
as the keyword, the theme's sticky colour plus six fixed hex colours, the keys P, H, E and S, an
eraser that takes pens only, strokes shown to the room as they are drawn, `start` as the default
alignment of lists, the `kanban` and `whiteboard` templates of D14, an explicit pen tool for a
stylus, and `draw` shares proportional to the strokes' lengths. `inspector-collapse-and-tooltips`
is not applied yet: the new buttons follow the canvas's current tooltip convention (`title` with
the key in parentheses, `aria-label` without it) and change with the others when that change is
applied. 1.10.0 was released on 2026-10-28, so the changelog entries open a `## 1.11.0` section.

## Risks / Trade-offs

- [A long drawing session makes a long file] → simplification (a 2 s stroke is 20 to 40 points),
  the filled list (six lines a stroke), and the 2 MiB source limit, which holds about 130,000
  points; the status line's point count and the explorer's size keep it visible. The design notes
  the measured size of the whiteboard template in decision 0064.
- [Hit-testing thousands of strokes on every move] → bounds first, segments only for the pens
  whose bounds the pointer or the eraser circle touches; the `.mdg-hit` area of a pen is its path
  with a 10 px stroke, as a line's is.
- [The inline editor's wrapping differs from the layout's by a pixel] → the editor uses the
  layout's font size and inner width with `pre-wrap`, and the commit redraws; a word that wraps
  one line earlier while typing is redrawn at the commit, never written.
- [`layout` inside a group block confuses readers] → the docs introduce it beside the diagram
  statement, hover says which it is, and `layout grid` lists `column, row` while `layout auto` in
  a group block is refused with the same list.
- [Peer strokes kept after a cancelled stroke] → the 10 s cap; a render drops them earlier.
- [A peer's stroke and the written pen differ] → both are the midpoint chain over the same
  points until simplification; the written one replaces the presence one at the next render.
- [The template counts are asserted in six places] → the tasks name each.
- [Re-recording every visual reference] → done for every change that adds a sheet; the diffs are
  looked at.
- [The release of 1.10.0 is in progress in the working tree] → nothing of this change touches
  the version bump; the changelog entry goes under the open section at apply time.
- [`rule pen` and `rule line` with heads] → the `addRule` exemption is widened to the two kinds in
  the same edit, which also fixes `rule line { arrowhead … }`, refused today.

## Open Questions

1. **The keyword.** `pen` (recommended), `ink` or `stroke`? (D1)
2. **Sticky colours.** The theme's token plus six fixed hex colours (recommended), or six theme
   tokens? (D6)
3. **Keys.** P, H, E and S (recommended; free on the free profile), or others?
4. **The eraser.** Pens only (recommended), or any object it crosses? (D10)
5. **Live strokes.** Strokes shown to the room as they are drawn (recommended), or only at the
   release? (D11)
6. **Default alignment of lists.** `start` (recommended) or `stretch`? (D7)
7. **Templates.** `kanban` and `whiteboard` with the contents of D14 (recommended), or one
   template, or other names?
8. **A stylus without the pen armed.** Arm the pen explicitly (recommended: a stylus also selects
   and drags), or let a `pen`-type pointer draw on any free diagram?
9. **`draw` timing.** Shares proportional to the strokes' lengths (recommended) or equal shares?
   (D13)
