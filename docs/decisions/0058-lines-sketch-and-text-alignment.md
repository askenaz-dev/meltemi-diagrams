# 0058. Lines without heads, free lines, sketched strokes and vertical text alignment

Status: accepted (lines-and-text-alignment change, 24 October 2026). Extends decisions 0003,
0007, 0012, 0013, 0018 and 0043.

## Context

The owner asked for three things on 2026-10-23, and each had one cause in the language or the
drawing.

- A relation could not be a plain line. The lexer made `->` and `-->` arrows and `-digit` a
  number, and any other run starting with `-` was an unknown token, so `a -- b` was
  `syntax.unexpected-character`. The only line between two boxes was a named relation with
  `style x { arrowhead none }`, which is what the Mermaid and PlantUML importers wrote for every
  open link.
- Nothing could be a line that joins no element: the free kinds were `box`, `text`, `icon`,
  `image` and `group`, every relation joins two elements and every `route` names a relation, so a
  divider, a bracket or an underline on a slide had no statement.
- Nothing looked hand-drawn, which whiteboard tools offer for early thinking, and the renderer had
  no dependency to draw it with.
- Text in a free box could move across (`textAlign`, free-only by decision 0043) but not down: its
  vertical place was one point per shape.

## Decision

- **Two line tokens.** `--` (a solid line) and `---` (a dashed line) join `->`, `-->`, `<->` and
  `<-->`: one dash more is dashed, and the lines drop the head glyph. The lexer takes the longest
  match (`---`, `-->`, `--`, `->`, then a number), so `--->` is `---` followed by an unexpected
  `>`, and the hint names the six tokens. Flow and free diagrams take the six; sequence diagrams
  take the four arrows (a message is a call or a reply) and C4 views `->` and `-->` (their
  relations come from the model), refusing the others with `prop.invalid-value` on the token, as
  views refused `<->` already.
- **A `heads` fact.** A relation records `heads`, `end`, `both` or `none`, from one table of the
  schema that also gives its `line`; `twoWay` stays and is `heads === "both"`, and
  `arrowToken(line, heads)` gives the token back to the importers, the edits and the C4 model. The
  heads are only defaults: the end head is `arrowhead`, else none for a line, else the theme's,
  and the start head is `arrowtail`, else the end's for a two-way relation, so `a -- b` with
  `arrowhead circle` still ends in a circle. The model JSON gains `heads` after `twoWay`; the
  version stays 0.1.
- **The importers write the tokens.** Mermaid `---` and `===` (with `width 3`) become `--`, `-.-`
  becomes `---`, architecture `--` edges become named `--` lines with their routes, and block-beta
  open links become lines; PlantUML headless arrows become `--` (`---` when dotted), a left UML
  head with no right head (`*--`) becomes `--` with `arrowtail`, and note links `---`. No sheet writes `arrowhead none` for a
  line any more, and relations that were named only for that style are anonymous.
- **A free `line` object.** `line <id> ["Label"] from (x, y) to (x, y) [via [(x, y), ...]]
[{ ... }]` is a declaration of free diagrams. The label is the second argument, empty by
  default; the points are in the parent's interior coordinates, as `place` is, so a line in a
  group moves with it. A line takes no `place`, `size` or `rotation`, takes the styles of a
  relation (stroke, line, width, heads, routing, corners, and the pill's colours and icon) and
  refuses those of a box; `label <id> at …` moves its pill, and `rule line { }` styles every line.
  The model JSON gives every element `line` after `shape`, null but on lines.
- **Lines are drawn as connectors.** The layout turns a line into a connector plan beside the
  relations': its written points, `polyline` by default (and for `auto`, with no box to anchor to),
  `orthogonal` with an elbow between points that differ on both axes, `bezier` through them,
  `corners`, heads `none` by default and cut as a relation's, a label pill at 50 %. It takes no
  lanes, detours or gaps under titles. Its scene group has role `element` with both a `track` and
  `bounds`, so it is painted in source order like any object and every effect (flow, dash, pulse,
  trace) runs along it: `planMotion` animates any group with a `track` as a connector. Coinciding
  points draw a dot and report `layout.degenerate-line` (warning).
- **Lines on the canvas.** The arrow button's menu lists the six kinds and R cycles them. On a free
  diagram the armed relation tool dragged on empty canvas draws a line: a ghost with the kind's
  dashes and heads, snapped, Shift for 45°, Escape cancels; the release writes the `line` inside
  the group under the press and the kind's styles in one edit (`line dashed`, and the theme's
  `arrowhead` token for the heads, so an editorial sheet gets `open`). A press on an element keeps
  the two-click relation sequence. A selected line shows its outline, end, bend and midpoint
  handles; drags and nudges post `setLinePoints`, which rewrites the tuples with minimal edits and
  inserts or removes `via`.
- **`sketch` is a theme token painted by the renderer.** `sketch none|light|rough`; the built-in
  themes write `none`, and two new built-in themes, `sketch.light` and `sketch.dark`, are the
  technical pair with `sketch light` and `corners rounded`, eight in all; `sketch` is a reserved
  import name. `renderSvg` draws every stroked rect, path and polyline of the element, relation,
  label, frame, lifeline and event groups, heads and pills included, as the fill alone plus two
  stroke-only passes: the outline (a rect turned into four sides with quarter arcs) sampled every
  16 px (`light`) or 12 px (`rough`), each sample moved along the normal by at most 0.6 px or
  1.4 px from a mulberry32 sequence seeded by a hash of the group's id and the pass. Width, dash,
  dash offset, class, opacity and transform are copied to both passes. Text, images, icons, the
  mark, gradients and patterns are untouched, and the layout's scene, tracks, bounds, hit tests and
  canvas overlays stay clean. The theme panel shows `sketch` as a row of pictures.
- **Inter until a hand font is approved.** The sketch themes use Inter, measured and embedded as
  the technical themes, so no sketch picture carries `layout.unmeasured-font`; a hand font waits
  for the owner's approval of its download, and the pictures are regenerated once when it lands.
- **`verticalAlign` within the shape's text band.** `top`, `middle` (default) or `bottom`, a free
  style property beside `textAlign`, refused in flow diagrams as decision 0043 refuses the text
  properties. The text block keeps its height; `top` searches the shape's text band from its top
  edge plus `padding` for the first row band whose inscribed span holds the block, `bottom` from
  the bottom edge, and the block moves back towards the middle when no band holds it. The band is
  each shape's: the box, the inside of a curve, between a cylinder's rims, above a document's wave
  or a callout's tail, an arrow's shaft, away from a flag's notch. `layout.vertical-align-ignored`
  (warning) reports it once per statement where it moves nothing: on the shapes whose text spot is
  fixed (triangle, pentagon, star, person, agent, icon), with a centred icon, and on texts, icons,
  images, groups and lines.
- **One alignment picker.** The strip shows a 3 × 3 "Text alignment" grid after Shape for free
  boxes, three cells for free texts, the written pair pressed and the default greyed; a cell writes
  the properties that change in one step, and the Theme chip removes both.

## Alternatives considered

- **`-` alone, `—` or `~~` for a line.** `-` is a number's sign and `a - b` reads as arithmetic;
  `—` is not ASCII (decision 0003 keeps the lexicon ASCII); `~~` is Mermaid's invisible link.
- **Replacing `twoWay` by `heads`.** Every consumer would change for no new behaviour.
- **A token that forbids heads, or `arrowhead none` written by the compiler.** draw.io and
  Excalidraw let a line take an end decoration, the importers would still need `arrowhead none`
  for a line with a tail, and the strip could not tell an invented style from a written one.
- **Line tokens in sequence diagrams.** Nothing in the profile draws a message without a head.
- **A relation between point endpoints, `(x, y) -- (x, y)`.** Statements start with a keyword or
  an id (decision 0003), routes need a named relation, and the placement would split between the
  relation and its route.
- **A `line` shape of a box.** `place` and `size` give a box, not two points: no bends, no heads,
  no effects, and a diagonal would be the box's diagonal.
- **The label as `: "Label"` after the points, or `via (x, y), (x, y)` without brackets.** A
  colon clause would be a parser change for one statement, and one `via` grammar is better than
  two.
- **A third scene role for lines, or a line registered as both element and relation.** Every
  consumer that switches on role would need the case, or one id would have two entries; an
  element group with a `track` needs one rule in `planMotion`.
- **A Line tool of its own, or `arrowhead triangle` written literally.** A fourth gesture for what
  the arrow tool already means, and a theme switch would leave a stray triangle on an editorial
  sheet.
- **`rough.js`.** A download the owner has not approved, randomness not seeded by default, and the
  renderer's first dependency.
- **A per-element `sketch` style.** draw.io has it diagram-wide, a mixed picture looks like a
  mistake, and a theme is where the family puts a look (decisions 0007 and 0013).
- **An SVG filter (`feTurbulence`, `feDisplacementMap`).** Not deterministic across renderers,
  dropped by some PDF and video captures, and it would wobble the text.
- **Sketching in the layout's scene.** Every consumer of the geometry would see jittered paths.
- **Naming the hand font before it is bundled.** Every sketch picture would carry
  `layout.unmeasured-font` and estimated widths, and the snapshots would move twice anyway.
- **`verticalAlign` on flow nodes, or a pixel offset.** Decision 0043 keeps the text properties
  free-only; an offset is precise but does not know the shape.
- **Two glyph rows or a select for the alignment.** Six chips for what draw.io shows as one grid,
  or words where the strip shows pictures.

## Consequences

- The language stays 0.2: the tokens, `line`, `sketch` and `verticalAlign` are additive. Every
  `.model.json` snapshot gains `heads` on each relation and `line` on each element; the version
  stays 0.1.
- The sheets under `corpus/import` lose their `arrowhead none` styles and the names that only
  carried them.
- New diagnostics: `layout.vertical-align-ignored` and `layout.degenerate-line`, both warnings.
  The `syntax.unexpected-character` hint names six tokens, and `layout.unknown-theme` lists eight
  built-in themes.
- New public surface: `Relation.heads`, `RelationHeads`, `RELATION_ARROWS`, `arrowToken`,
  `Element.line`, `SKETCH_LEVELS`, `VERTICAL_ALIGNS`, `Theme.sketch`, `Scene.sketch`,
  `sketchItems`, the protocol's `connect.heads`, `ElementInfo.line`, `createLine` and
  `setLinePoints`.
- An anonymous relation's key (`a->b#1`) and a generated id change when statements are reordered,
  and the wobble of what they name changes with them; named targets keep theirs.
- Sketched pictures are larger, since each stroked item becomes up to three. Measured on
  2026-10-24:

  | Picture                                                   | Clean         | Sketched      |
  | --------------------------------------------------------- | ------------- | ------------- |
  | `gallery/free/sketch` (embedded fonts, the gallery's SVG) | 136,282 bytes | 165,309 bytes |
  | `gallery/free/sketch` with `--fonts system`               | 6,540 bytes   | 35,567 bytes  |
  | `corpus/acceptance/free/shapes` and `free/sketch`         | 17,282 bytes  | 77,629 bytes  |

  The clean whiteboard is the same sheet rendered with `theme "technical.light"`; the acceptance
  pair differs only in its theme, title and heading, and is rendered with `system` fonts. The fonts dominate an embedded export, so the
  sketched gallery file is 21 % larger, while the strokes alone grow about five times. Nothing but
  `renderSvg` reads the sketched paths, and the sketch themes are opt-in.

- A hand font for the sketch themes remains open: its download needs the owner's approval, and
  the sketch pictures are regenerated once when it lands.
