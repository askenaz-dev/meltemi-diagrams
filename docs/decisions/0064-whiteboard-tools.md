# 0064. Whiteboard tools: pen strokes, stickies, lists and a board

Status: accepted (whiteboard-tools change, 28 October 2026). Extends decisions 0018, 0043, 0050,
0058 and 0059.

## Context

The owner asked on 2026-10-28 for drawing tools in free compositions, "something like Miro": a
canvas where a kanban board, a free drawing or an explanation for a class can be made as quickly as
a slide, with Meltemi completing the flow as a whiteboard for learning and explaining. Free
compositions were close and stopped short in four places:

- **Nothing was freehand.** A `line` holds its points in its statement and is routed as a
  connector, with a handle at every bend, so a hand-drawn arrow would have been a line of forty
  bends. The only freehand gesture of the canvas was the Pointer's trail, which fades and reaches
  no file (decision 0059).
- **Nothing wrapped.** Free texts and notes draw a line per `\n`, and a box grows until its label
  fits: there was no card that keeps its size and fits its words to it.
- **Nothing flowed.** Every child of a group had a `place`, and "stacks" were a rule of the overlap
  check (decision 0043), not an arrangement. A kanban column is a list: cards in order, the column
  growing with them, a card dropped between two others taking their place.
- **A whiteboard warned.** Without `canvas`, `preset document` reported `layout.too-large` past
  1,200 px, while the stage itself was unbounded.

The owner accepted the design's recommendations for its nine open questions ("Aplicar con
defaults").

## Decision

- **`pen` is a free kind.** `pen <id> [(x, y), …] [{ … }]`: a stroke through its points, written in
  its group's interior coordinates as a line's are, at least one point, decimals kept, no label and
  no `place`, `size` or `rotation`. It takes `stroke` (the theme's `ink` by default), `width` (1 to
  64, 3 by default), `line`, `opacity`, `arrowhead` and `arrowtail`, and refuses a box's properties;
  `rule pen { }` styles every stroke. The model records `Element.pen: { points }`, and the model
  JSON writes it after `line`.
- **Points to a tenth, simplified once, printed filled.** The canvas keeps the raw pointer positions
  (coalesced events included) and simplifies them once at the release with Ramer–Douglas–Peucker at
  0.75 screen pixels divided by the zoom, so a stroke drawn zoomed in keeps its detail and one drawn
  zoomed out does not carry a point per pixel. Coordinates are rounded to a tenth. The formatter
  prints a pen's list on one line when the statement fits in 100 columns and otherwise fills its
  lines to 100 columns, so a stroke of forty points is six lines; it keeps the commas it is given.
  `via` lists keep their one-item-per-line rule.
- **The layout draws the stroke as a midpoint chain.** One path: `M p0`, a quadratic curve through
  the midpoint of each pair of consecutive points with the shared point as its control, `L p_last`;
  round caps and joins, no fill; one point is a disc. The scene group has role `element`, a `track`
  and `bounds`, and `freehand: true`, which the sketch passes read to leave strokes as drawn: a
  freehand stroke jittered twice would be another drawing. Pens are painted in source order on
  their layer, take no part in the composition checks, and count for derived groups and the canvas
  size. Effects and the story action `draw` follow the smoothed curve.
- **`opacity` is a free style property and `width` grows to 64.** `opacity` (0 to 1) applies to
  elements, groups, lines and pens of free diagrams, composed with a story's opacity rather than
  replacing it (`GroupItem.styleOpacity`). The highlighter is a pen with `stroke highlight; width
20; opacity 0.35`: one path, so a stroke that crosses itself does not darken where it overlaps.
- **`sticky` is a kind, not a shape.** `sticky <id> "Text"`: a 160 × 160 card at the default label
  size, or its `size`, that never grows; the text wraps at the inner width, steps down from 1.2
  times the label size to 8 px until it fits, and is `layout.text-overflow` (warning) and clipped
  when it still does not. A soft shadow, the theme's `sticky` fill and `stickyText` colour, radius
  2, an icon in a row of its own when styled. It is a rectangle for connectors, magnets, ports and
  the checks.
- **Colours: the theme's sticky plus six fixed ones.** The sticky menu and the strip offer the
  theme's colour and yellow `#fff59d`, pink `#f8bbd0`, green `#c8e6c9`, blue `#bbdefb`, orange
  `#ffe0b2` and purple `#e1bee7`, written as `fill "#…"`; the six are the same in a dark theme,
  because a sticky is a paper card, and `stickyText` is near-black in every theme.
- **Lists are `layout column | row` on a group.** With `spacing` (half the group padding by
  default) and `align start|center|end|stretch` (`start` by default). Children are placed in
  source order along the axis; a written `size` is the least size and the group grows with its
  children; a `place` on a child is `layout.place-ignored` (warning) so that turning a group into a
  list keeps the file compiling; lines and pens inside keep their points; the engine treats a list
  as one box in every mode. Writing an automatic layout down writes no `place` for the children and
  no `size` for the list, whose size stays derived so it can still shrink.
- **Moves to a position.** `moveElement` and `createElement` take an `index` among the
  declarations of the destination block; a list destination removes the `place`. The canvas sends
  the index among the list's children and the session converts it. A nudge of a list child is
  refused with a message rather than writing a `place` the layout would ignore.
- **`preset board`** keeps the content canvas with no `layout.too-large`; the warning of `preset
document` and `preset slide` names it.
- **Three tokens.** `highlight`, `sticky` and `stickyText`: light themes `#ffe600`, `#fff59d`,
  `#1f2328`; dark themes `#ffd600`, `#f3e37c`, `#1f2328`.
- **`draw` is a story action.** `draw a, b [over <time>]` (800 ms by default) takes pens, free
  lines and named relations, draws them one after another with shares proportional to their track
  lengths, in their own colour and width, and leaves them drawn; a target first shown by `draw`
  starts hidden, and its own effects wait.
- **Tools that stay in the hand.** P, H, E and S (pen, highlighter, eraser, sticky) on free
  diagrams. The pen and the highlighter stay armed after each stroke; the new stroke is not
  selected. The pen menu holds the tool, the widths (a default of 3, thin 2, medium 4, thick 8) and
  the theme's colours, kept with the canvas's state. The eraser deletes whole strokes, only
  strokes, with their own style and effects, in one undo step. A stylus draws with palm rejection
  and erases with its barrel button.
- **The room sees a stroke while it is drawn.** The pen's points ride in the Pointer's laser
  batches with a `pen: { width, colour, opacity }` part (width 1 to 64, a colour of at most 32
  characters, opacity 0 to 1), bounded by the page and the room; a peer's canvas draws one growing
  stroke that does not fade until the drawing that holds the written `pen` arrives, or ten seconds
  pass.
- **Two templates.** `kanban` (a row of three columns of stickies under `preset board`) and
  `whiteboard` (`sketch.light`, `preset board`, a heading, stickies, a pen arrow, a highlighter
  mark, a line and a story that draws them).

## Alternatives considered

- **`ink` or `stroke` as the keyword.** `ink` is already a colour token, so `ink i1 […]` in a
  diagram and `ink "#222"` in a theme would name two things alike; `stroke` is the property that
  colours a pen. `draw` is the story verb.
- **A `line` with forty bends.** Forty handles, a label pill, routing modes and lanes that mean
  nothing for a stroke.
- **A separate file or a binary blob for strokes.** The sheet would stop being one text that Git
  diffs and an agent reads.
- **Integers, two decimals or no simplification.** Integers lose the curves of a stroke drawn at
  400 %; two decimals double the characters; raw input is about 120 points a second from a stylus.
- **Catmull-Rom cubics, a raw polyline or pressure-sensitive width.** Cubics overshoot on a quick
  hand's turns; a polyline is jagged at 2 px; pressure would put a value per point in the file and
  make the stroke a filled outline that takes no dash, no heads and no dash effect.
- **`mix-blend-mode: multiply` for the highlighter.** Some PDF captures and SVG viewers drop it.
- **A `shape sticky` on a box, or a note with a fill.** A shape is geometry, and a sticky is a
  behaviour (it never grows, it shrinks its writing, it has a shadow); a note grows, is
  left-aligned and muted.
- **Six theme tokens for the sticky colours.** Six tokens for one tool, and `fill sticky3` says
  less than `fill "#f8bbd0"`.
- **`stack`, `flow` or `direction` for lists.** "Stack" already names a box drawn inside a box
  (decision 0043); `flow` is a diagram type and `direction` the engine's.
- **A `place` on a list child as an error, a written size that clips, children stretched by
  default.** Each breaks or surprises someone turning an existing group into a list.
- **A board widget with its own statements.** Three kinds for what two properties on a group say,
  and nothing of it would serve a row of icons or a column of texts.
- **Tools that disarm after each stroke, or a selected new stroke.** A word of handwriting is six
  strokes; the selection ring would flash between letters.
- **An eraser that splits strokes, or erases any object.** Miro and Excalidraw delete whole strokes,
  and a slip would delete a column.
- **Strokes shown to the room only at the release, or a channel of their own.** The first loses the
  whiteboard feeling; the second is what decision 0050 rejected for the pointer.
- **No preset means a board, or `canvas infinite`.** `document` is the default and its warning is
  wanted; `canvas` is a size.
- **An `animate` effect `draw`, or `reveal` with a mode.** Effects repeat and sit above the static
  picture; a stroke that appears and stays belongs to a story's clock.

## Consequences

- The language stays 0.2 and the model JSON 0.1: `pen`, `sticky`, the list properties, `opacity`,
  `preset board`, the tokens and `draw` are additive. Every `.model.json` snapshot gains `pen` and
  `list` on each element.
- New diagnostic: `layout.place-ignored` (warning). `layout.text-overflow` also reports a sticky
  whose text does not fit at 8 px. The `layout.too-large` warning of documents and slides gains a
  hint.
- New public surface: `PenPoints`, `ListGroup`, `LIST_LAYOUTS`, `LIST_ALIGNS`, `PEN_PROPERTIES`,
  `STICKY_PROPERTIES`, `THEME_WHITEBOARD_TOKENS`, `drawTargetKind`, `penPath`, `wrapLines`,
  `LayoutResult.pens`, `stickies` and `lists`, `GroupItem.freehand`, `styleOpacity` and `textClip`,
  the edit operations `createPen` and `setPenPoints` and the `index` of `createElement` and
  `moveElement`, the canvas actions `createPen` and `setPenPoints`, `ElementInfo.pen` and `list`,
  and the presence `pen` part.
- Ungrouping a group a story names now takes it out of the story's actions, as its styles go.
- Sizes measured on 2026-10-28, in bytes:

  | File                                                   | Bytes           |
  | ------------------------------------------------------ | --------------- |
  | `gallery/free/whiteboard.meltemi` (source)             | 2,162           |
  | `gallery/free/whiteboard.svg` (embedded fonts)         | 56,688          |
  | `gallery/free/whiteboard.svg` with `--fonts system`    | 24,388          |
  | `kanban/diagrams/board.meltemi` (template)             | 1,466           |
  | `whiteboard/diagrams/whiteboard.meltemi` (template)    | 2,010           |
  | the kanban template's SVG, embedded fonts / system     | 136,840 / 7,118 |
  | the whiteboard template's SVG, embedded fonts / system | 40,181 / 7,955  |

  A stroke drawn for two seconds is 20 to 40 points, about six filled lines of source; the 2 MiB
  source limit holds about 130,000 points.

- `docs/language/free.md`, `grammar-0.2.md`, `layout.md`, `styles.md`, `motion.md`, `stories.md`,
  `formatting.md`, `model-json.md`, `diagnostics.md`, `svg-export.md`, the editor, playground and
  cloud guides and the skill describe the whiteboard in English and Spanish.
