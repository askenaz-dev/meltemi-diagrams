## Context

The style strip is built by `withStrip` in `packages/editor/src/inspector.ts` (fields marked
`section: "strip"`) and drawn by `Inspector.show` in `packages/canvas/src/inspector.ts`: colour
rows, glyph rows (`glyphField`, a label at the left and the current value at the right, as "Route
kind" and "Corners" show) and, for the effects, a `div.effects` with `role="group"` and an
`aria-label` holding the four `effectToggle` buttons, then the speed fields. The session keeps
`playing = false` (`packages/editor/src/session.ts:148`); the toolbar's Play effects button posts
`playEffects { on }`, and `render()` passes `motion: "animated"` to `renderDiagram` only while
`playing` and the diagram has effects. The canvas keeps a `PersistedState` per file through the
host (`getState`/`setState` in `packages/canvas/src/app.ts:103-122`), with `hiddenLayers` keyed by
diagram.

The rotation drag (`packages/canvas/src/app.ts:3539-3551`, `3773-3783`) stores the centre and the
starting angle at the press and, on every move, sets `drag.angle = bearing(centre, pointer, 15)`:
the pointer's absolute bearing, 0 up, clockwise (`packages/editor/src/canvas/turning.ts:41-46`).
There is no threshold (moves have `DRAG_THRESHOLD`, `app.ts:322`, `3696`). `turnDrawing`
(`app.ts:4118-4130`) sets a CSS `transform: rotate()` with a transform origin on the element's
group, which `.content g.turning { transition: transform var(--mdg-motion-fast) }`
(`canvas.css:544-547`) eases, while `drawOverlay` turns the outline with an SVG
`rotate(a cx cy)` at once (`app.ts:1946-1957`). Each live preview (`requestPreview`,
`applyPreview`, `drawPreview`, `app.ts:2390-2487`) replaces the DOM with the session's drawing,
whose group carries the layout's `transform` attribute, and `turnDrawing` is not re-applied;
`followPointer` (`app.ts:2298-2318`) does re-apply a move's offset after each preview and tracks
`previewWaiting.delta` / `previewShown.delta`. Rotation is not in `GEOMETRY`
(`session.ts:122-131`), so in `layout auto` the preview lets the engine re-arrange around the
turned bounding box (`packages/layout/src/layout.ts:1142-1156`). The design of
`rotation-and-corner-radius` (decision 0045) asked for no easing while dragging and an ease on
release.

`layoutSequence` (`packages/layout/src/sequence.ts`) gives every head a cell of
`headHeight = max(boxHeight, hasFigures ? figureHeight + 6 + labelLine : 0)` (lines 105-109):
60 units under `technical.light` when a figure exists. `head()` draws box kinds in the bottom
`boxHeight` of that cell (789-794) and figures from its top, but the group's `bounds` is the
whole cell (887) and so is the `boxes` entry (576). The sequence layout returns no `shapes` or
`radii`, so `session.ts:423` falls back to `shape: "rounded"` with no radius. The canvas draws the
selection outline from `ElementInfo.box` (`app.ts:1938-1957`), the motion plan takes
`group.bounds` for halos (`packages/motion/src/plan.ts:120`), and story highlights, the review
overlay, the player and `text-places.ts` read the same bounds. Heads, activation bars, notes and
lifelines take `theme.line` (738-769, 824, 966-1116); `technical.light` resolves it to `#DCE5ED`
on a `#F7FBFF` background.

`styleTargets` and `namedRelation` (`packages/editor/src/targets.ts:46-168`) name anonymous
targets before a style or an effect; `effectOperations` (`effects.ts:180-194`) and the style path
(`inspector.ts:1240-1245`) return `select` with the new id, which the session turns into
`pendingSelection`. The label (`inspector.ts:1412-1420`), layer (`1431-1442`) and dotted line
(`1456-1469`) paths and the gestures `moveLabel`, `setVia`, `setEnd` and the inline label
(`session.ts:1310-1365`, `1538-1545`) name first too but return no `select`, so the selection
vanishes with the old key. `inspector.ts:1198` refuses styles on unnamed notes and fragments
(`reasons.nameToStyle`) and `1516` refuses a label position on an anonymous relation
(`reasons.nameToMoveLabel`), while effects already name both.

## Goals / Non-Goals

**Goals:**

- The effects are a titled row of the strip, and a diagram with effects moves from the moment it
  opens, with a pause that is remembered.
- Rotating feels like dragging: nothing turns before the pointer moves, the drawing and its
  outline agree at every frame, and `layout auto` does not move the turned node.
- A sequence head is selected, pulsed, highlighted and edited where it is drawn, and the drawing
  is readable at a glance under the default theme.
- Every naming on demand keeps the selection, and nothing is refused that could be named.

**Non-Goals:**

- Changing any theme palette or adding theme tokens; the sequence drawing chooses among the
  tokens every theme already has.
- Changing how effects are rendered in exports (particle size and colour, halo colour), which
  `export-defaults-and-visible-effects` owns.
- The C4 combination's naming, which `c4-entities-and-routes` owns.

## Decisions

### The Effects row

`Inspector.show` in `packages/canvas/src/inspector.ts` wraps the toggles in the same row element
`glyphField` uses: a header line with the label `inspector.effects` at the left and a value at the
right, then the toggles, then the speeds. The value is `inspector.effectsOff` ("off") or the names
of the effects that are on, joined with commas, from the fields' values (`mixed` shows the mixed
word of a multi-selection). The editor's fields do not change; the canvas derives the state from
the `effect.*` fields it already receives. Alternatives: a plain `<h3>` above the group (not what
the neighbours look like); a per-toggle label (noise). The row keeps `role="group"` and the
accessible name.

### Play by default, pause remembered

`CanvasSession.playing` starts `true`. The canvas keeps `PersistedState.effectsPlaying?:
Record<string, boolean>` keyed by diagram id, like `hiddenLayers`, holding the person's last
choice either way. A render of a diagram with effects whose `playing` disagrees with what the
canvas wants for it (the choice, else the media query) is not shown: the canvas posts
`playEffects { on }` and draws the answer, so a paused diagram never flashes animated on a reload
or a switch of diagram, whatever the session's state; the toggle writes the record and posts the
message. The
button shows the pause glyph and "Pause effects" while playing, the play glyph and "Play effects"
while paused, `aria-pressed` as today, and is disabled when the diagram has no effects
(`render.effects === 0`). A canvas opened under `prefers-reduced-motion: reduce`
(`matchMedia` in `app.ts`) treats a diagram without a remembered choice as paused; a remembered
play wins over the media query, since the person asked for it. Alternatives: turn playing on when
the first effect is added (the owner's first wording; a file opened with effects would still be
still, and the second effect would not need it); keep the sticky session flag (a reload loses the
choice). Previews during drags keep whatever state is on: `preview()` already passes
`motion: "animated"` when playing, and the CSS animations restart with each answered drawing,
which is what a live drag looks like today while playing. Recommendation: keep it, and revisit
only if the webview suite shows dropped frames in the drag scenarios.

### The rotation gesture

`turning.ts` gains `turnedAngle(from, centre, grab, pointer, step?)`: `from` plus the bearing
change from `grab` to `pointer`, normalised to 0..359 and snapped to `step` when given. The drag
record stores `grab` (the pointer at the press) and `moving: false`; `pointerMove` returns until
`Math.hypot(dx, dy) × zoom ≥ DRAG_THRESHOLD`, then computes the angle with `turnedAngle`, so a
press and release without movement writes nothing (`pointerUp` keeps `moving && angle !== from`).
Alternatives: keep the absolute bearing and only add the threshold (the first move still snaps to
the handle's own bearing, 60° on a default node); a bearing measured from the handle's position
instead of the grab (the same thing when the grab is on the handle, which it always is).

### Drawing the live rotation

`turnDrawing` writes the SVG `transform` attribute `rotate(a cx cy)` in scene coordinates
(centre plus `previewShown?.offset ?? r.offset`), composed with nothing else, instead of a CSS
transform with a transform origin; `.content g.turning` loses its transition, and a class
`turned-release` carries `transition: transform var(--mdg-motion-fast) var(--mdg-ease)` for the
one frame after the drop, as decision 0045 asked. `applyPreview` re-applies the attribute after
every answered drawing, the way `followPointer` re-applies a move's remaining offset, and the drag
tracks `previewWaiting.angle` / `previewShown.angle`; a refused preview (`svg === null`) keeps the
attribute on the restored drawing instead of calling `restoreDrawing`. `drawOverlay` turns the
outline with `drag.angle` about `drag.centre` while a rotation drag is on, so the outline, the
badge and the drawing come from one number. Alternative: send no previews during a rotation and
turn only the group locally (connectors would not follow, which the live preview exists for).

### Rotation in `layout auto`

A rotation preview or drop in an `auto` diagram materialises the arrangement first, as moves do:
`plan()` treats `setField` with the path `style.rotation` (and its preview) as geometry, writing
the arrangement in the same batch before the style. The previewed drawing then keeps every box
where it was, and the preview's answer carries the turned element's box
(`protocol.ts:520-531` gains `box?`), so the overlay follows it when the layout still moves it
(assisted mode). Alternatives: refuse rotation in `auto` (nothing else is refused there); let the
engine re-arrange and move the outline to the answered box (the node jumps while turning).

### Sequence head bounds, shapes and radii

In `head()` the box kinds' group gets `bounds` of the drawn box (`y: head.y + head.height −
boxHeight`, `height: boxHeight`; collections include their 4-unit stack offset up and right), and
`boxes` gets the same box; figures keep their cell. `layoutSequence` returns `shapes` (`rounded`
for participants and the UML kinds drawn as boxes, `cylinder` for databases, `rounded` for
collections and queues) and `radii` (`theme.radius` for rounded heads) so `session.ts:423` reads
them and the canvas draws the outline's corners and the inline editor's area on the drawn shape.
Consumers (`motion/src/plan.ts`, `story.ts`, `review.ts`, the player's stage, `text-places.ts`,
`audit.ts`) need no change. `sequenceMove` reads only the box's x centre, so reordering is
unaffected. Alternative: keep the cell and draw the box at the top of it (the label of an actor
would then sit lower than a participant's, and the figure's cell would still be taller than the
box).

### Sequence contrast without new tokens

The drawing takes `theme.muted` for the stroke of heads, activation bars, notes and fragment
frames and for the dashed lifelines (`strokeWidth`, dash `5 4` as today, at half opacity: at full
strength the dashed lifelines matched the dashed replies, which made them hard to tell apart);
fragment frames already took `muted` and dividers keep `line`; messages keep
`theme.connector` at `connectorWidth`, labels keep `ink`. Under `technical.light` that is
`#526579` on `#F7FBFF` (about 5.8:1) for every line of the picture. Alternatives: (b) change
`line` in `technical.light` (reaches every flow, free and C4 picture, their snapshots, the
gallery and `docs/language/svg-export.md`, for a token whose job there is a quiet edge); (c) new
tokens `lifeline` and `participantLine` in every theme family, the theme panel and the TextMate
grammar (more surface for one picture); (d) `bandLine` for lifelines and `muted` for the rest
(`bandLine` is no stronger than `line` in `technical.dark` and weaker in `stage.light`).
Decision: `muted` everywhere, the lifelines at half opacity, chosen on before-and-after pictures of
the payment, constructs and passkey sheets in both light and dark.

### The selection follows every naming

`namedRelation` and `styleTargets` already return the target id after naming; every caller
returns `select: [newId]` (the inspector's label, layer and dotted-line cases through
`selectionAfter`, as the style case does) or sets `pendingSelection` (the session's `moveLabel`,
`setVia`, `setEnd` and inline-label gestures), and `session.ts:466-471`, which drops vanished
keys, finds the new id present. `inspector.ts:1198` names an unnamed note or fragment with
`renameEvent` and `freshEventId` (as `effectOperations` does) before the style; `1516` names the
relation before `setLabelAnchor`. `reasons.nameToStyle` and `reasons.nameToMoveLabel` leave
`messages/en.ts` and `es.ts`, and `test/messages.test.ts` keeps the parity. Alternative: keep the
two refusals (nothing in the language needs them; effects on the same targets already name).

## Risks / Trade-offs

- [Effects animate while a person edits, which they did not ask for] → the pause is one click,
  remembered per diagram, and reduced motion starts paused; the animated profile is CSS only, the
  same the canvas shows today while playing.
- [A remembered pause hides effects a person just added] → the toggle shows the play glyph
  pressed-off beside a diagram that has effects; the status line after an effect is turned on says
  so when paused ("Effects paused; press Play to see them").
- [Materialising the arrangement on the first rotation of an `auto` diagram writes placements the
  person did not ask for] → the same happens on the first move today, by decision of
  `canvas-setup-and-live-preview`; the status line's "layout manual" badge says so.
- [Regenerated sequence snapshots hide an unintended change] → the layout tests assert the head
  boxes and the tokens directly, and the acceptance pictures are looked at before `--update`.
- [Outline corners drawn with a radius on the canvas] → the canvas already draws `rx` for free
  boxes with `ElementInfo.radius`; sequence heads use the same path.
