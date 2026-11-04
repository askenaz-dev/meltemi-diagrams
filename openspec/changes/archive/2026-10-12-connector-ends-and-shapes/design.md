## Context

The language has two arrows, `->` and `-->` (`packages/language/src/lexer.ts`), mapped to a
relation's `line` by each profile's `arrows` table (`packages/model/src/schema.ts`). Heads exist
only at the target: `arrowhead()` in `packages/layout/src/geometry.ts` handles `triangle` (filled,
the line pulled back to its base), `open` (a V, the line to the tip) and `none`, and the relation
emitter of `layout.ts` draws them after the line; sequence messages pick `triangle` for calls and
`open` for replies and async calls (`sequence.ts`). Route kinds are `auto`, `orthogonal`,
`polyline` and `bezier`; bends are always sharp. Scene items carry `dashed: boolean`, rendered as a
`5 4` dash. The inspector shows `arrowhead` and `routing` as selects, and the strip (1.1) has the
relation's `line` (the arrow) and `style.arrowhead`.

## Goals / Non-Goals

**Goals:**

- Set the head at each end of a relation, in the text and on the canvas, with draw.io's and
  Excalidraw's common heads and the crow's-foot ends of ER diagrams.
- Dotted lines and rounded corners, by style and by theme.
- Choose line, route, corners and heads by their pictures.
- Keep every existing drawing and file meaning.

**Non-Goals:**

- New route kinds: `auto`, `orthogonal` (elbow), `polyline` (straight) and `bezier` (curved) are
  Excalidraw's three types plus automatic.
- Hand-drawn (sketchy) strokes.
- Two-way relations in C4 models, whose relations stay `->` and whose views take them from the
  model.

## Decisions

### `<->` and `<-->` are arrows; `arrowtail` is a style

Two-way arrows are common enough (Mermaid `<-->`, PlantUML `<-->`, ER links) to deserve syntax,
and they keep the text short: `a <-> b` instead of a named relation with a style. A head of
another kind at the start is a style, `arrowtail`, as DOT names it, with the values of
`arrowhead`. The start head is `arrowtail`, else the end's head when the arrow is two-way, else
none. This mirrors `line`: the arrow sets a default, a style overrides it. The relation keeps
`line` (`solid` or `dashed`) and gains `twoWay`, which the model JSON writes as a new field (an
addition, so version 0.1 stays). `<-` alone stays invalid: a relation is written from its source.

### Heads by name, filled and outlined pairs

Values are single camel-case words, as every enum of the language: `triangle`, `triangleOutline`,
`open`, `diamond`, `diamondOutline`, `circle`, `circleOutline`, `bar`, `cross`, `many`,
`oneOrMany`, `zeroOrMany`, `zeroOrOne`, `onlyOne`, `none`. Outlined shapes are UML's hollow heads
(generalisation, aggregation); the crow's-foot ends cover ER cardinalities, which a declared `erd`
type and imported diagrams need. `one` is not added: it would draw as `bar`.

### One geometry for every head, at either end

`endMarker(points, kind, size, end)` returns the line trimmed where the head needs it and the
head's parts (filled or outlined polygons, polylines and circles), in the line's colour and width.
With L the theme's `arrowSize` and W = 7/8 L:

| Head | Shape at the tip | Line ends at |
| --- | --- | --- |
| `triangle`, `triangleOutline` | triangle L long, W wide | its base |
| `open` | a V, L long, W wide | the tip |
| `diamond`, `diamondOutline` | diamond 1.5 L long, W wide | its back |
| `circle`, `circleOutline` | circle of radius 0.45 L touching the tip | its back |
| `bar` | a bar 1.2 W long, L/2 before the tip | the tip |
| `cross` | an X of W, 0.6 L before the tip | the tip |
| `many` | crow's foot: from L before the tip to the tip and 0.6 W either side | the tip |
| `oneOrMany` | `many` and a bar 1.3 L before the tip | the tip |
| `onlyOne` | bars L/2 and L before the tip | the tip |
| `zeroOrOne` | a bar L/2 before the tip and an outlined circle behind it | the circle's back |
| `zeroOrMany` | `many` and an outlined circle behind it | the circle's back |

The start head is the same geometry on the reversed points. Outlined shapes are not filled: the
line stops at their back, so nothing shows through them. The line is drawn first and the heads
after it, so the moving dash still finds the line as the first stroked item and labels stay last.
A relation group's `track` is the trimmed line, as today.

### Curves trimmed at both ends

`bezierThrough` takes the start's base as well as the end's: the curve leaves the start head's
base along the source side's normal, so heads at both ends sit on the curve's tangents.

### Rounded corners are sampled

`corners rounded` replaces each bend of a straight or elbow line by a quadratic curve through the
bend, with a radius of 10 px, less when a neighbouring segment is shorter than twice that. The
curve is sampled (eight steps a corner) into the polyline itself, so connectors stay polylines:
the gaps under group titles, the label audit, composition checks, motion tracks and the canvas
outline keep working unchanged. Bézier connectors are smooth already and ignore it. The theme
token `corners` sets the default; built-in themes write `sharp`, so nothing moves.

### Dotted lines

`line dotted` draws round dots: a dash of 0 and a gap of `1.5 × width + 3`, with round caps, so
the dots grow with the line. Scene items gain `dotted`, beside `dashed`; a motion dash overrides
both. Relations keep `line` from their arrow; `dotted` comes only from styles.

### The strip's pictures

The editor marks fields with `glyphs` (`line`, `route`, `corners`, `arrowStart`, `arrowEnd`); the
canvas draws each value as a small SVG (a short line with the head, the route's shape, the corner)
from its own table, never from the engine, and falls back to a select for any field it does not
know. Line, route and corners are rows of icon chips with a "theme" chip, like the colour rows;
each head is a button showing the current head that opens a grid of every head (radiogroup,
arrows to move, Enter to choose, Escape to close). For a relation, the line row joins the arrow
and the style: solid and dashed rewrite the arrow (removing a written `line` style), dotted writes
`line dotted`.

### Importers

Mermaid `<-->` (and `<-.->`, `<==>`) becomes `<->` (`<-->`); `o--o`, `x--x` become two-way with
`circle` or `cross` at both ends; `--o` and `--x` set `arrowhead circle|cross`; link curves
(`linkStyle … interpolate`, `e1@{ curve: … }`) become `routing` (`linear` polyline, `step…`
orthogonal, the others bezier). Sequence `<<->>` and `<<-->>` become `<->` and `<-->`. PlantUML
arrows with both heads become `<->`/`<-->`, and the heads `|>`, `*`, `o`, `x` become
`triangleOutline`, `diamond`, `diamondOutline` and `cross` at their end. What still has no
equivalent stays approximated.

## Risks / Trade-offs

- [Every model JSON gains `twoWay`] → snapshots are regenerated once; the field is documented in
  `model-json.md`; consumers that ignore unknown fields are unaffected.
- [Sampled corners make longer point lists] → eight points a corner, a few hundred bytes a diagram.
- [A two-way relation and an `arrowtail` say the same thing two ways] → the arrow is the short form
  for "the same head at both ends", the style the general one, as `-->` and `line dashed` already
  are.
- [Fifteen heads in a select would be unreadable] → the grid shows them as pictures; the text keeps
  their names, which completion and hover list.
