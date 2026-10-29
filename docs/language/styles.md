# Styles, themes and presets

[Español](../es/language/styles.md)

A diagram's look comes from its theme and from a small set of style statements. Everything is
written in the `.meltemi` file, so the same source renders the same way in the CLI, the editor and
every export format. There is no CSS.

## Themes

A theme is a set of design tokens. Eight themes are built in:

| Theme                                         | For                            | Character                                                                                          |
| --------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `technical.light` (default), `technical.dark` | architecture review            | Inter, the Meltemi palette, a footer frame with the mark                                           |
| `editorial.light`, `editorial.dark`           | documents and long reading     | IBM Plex Sans, quiet greys, open arrowheads, no frame                                              |
| `stage.light`, `stage.dark`                   | presentations and video        | Inter, high contrast, larger type and strokes, wide margins, a header frame                        |
| `sketch.light`, `sketch.dark`                 | whiteboards and early thinking | the technical themes with strokes painted by hand (`sketch light`) and rounded bends; Patrick Hand |

A diagram picks a theme with `theme "<name>"`. Without one it uses the project's default theme
(`"theme"` in `project.json`, see [projects.md](projects.md)) or `technical.light`. `meltemi-diagrams
export --theme <name>` overrides both.

### Theme blocks

`theme <id> { }` defines a theme at the top level of a file. It extends a built-in theme or another
theme and sets only the tokens it changes:

```text
theme company {
  extends "technical.light"
  accent "#6a4fd0"
  labelSize 14
  brand "Company · Meltemi Diagrams"

  class partner { line dashed; stroke accent }
  rule data { pattern dots }
}
```

A theme without `extends` extends `technical.light`. Themes are imported like any block
([projects.md](projects.md)).

### Tokens

| Group      | Tokens                                                                                                                    | Value                                                          | `technical.*`                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Colours    | `background`, `surface`, `ink`, `muted`, `line`, `connector`, `band`, `bandLine`, `tag`, `tagText`, `accent`, `accentEnd` | quoted colour                                                  | see [svg-export.md](svg-export.md#themes)                                         |
| Signals    | `success`, `warning`, `danger`, `info`                                                                                    | quoted colour                                                  | `#15803D`, `#B45309`, `#B91C1C`, `#0369A1` on light                               |
| Whiteboard | `highlight` (highlighter strokes), `sticky` (the card of stickies), `stickyText` (their text)                             | quoted colour                                                  | `#ffe600`, `#fff59d`, `#1f2328` on light; `#ffd600`, `#f3e37c`, `#1f2328` on dark |
| Fonts      | `font`, `mono`                                                                                                            | quoted CSS font stack                                          | Inter, Cascadia Mono                                                              |
| Type       | `labelSize`, `descriptionSize`, `groupTitleSize`, `noteSize`, `tagSize`, `relationLabelSize`, `frameSize`                 | number, 6 to 48                                                | 13, 11, 13, 11, 10.5, 11, 12                                                      |
|            | `labelWeight`                                                                                                             | 400, 500, 600 or 700                                           | 600                                                                               |
| Spacing    | `padding` (text to box edge), `groupPadding`, `groupHeader` (group title band), `margin` (around the canvas)              | number, 0 to 200                                               | 16, 16, 40, 20                                                                    |
| Shape      | `radius` (boxes, notes), `groupRadius`: defaults that an element's `radius` overrides                                     | number, 0 to 64                                                | 8, 14                                                                             |
| Strokes    | `strokeWidth` (outlines), `connectorWidth`                                                                                | number, 0 to 8                                                 | 1, 1.3                                                                            |
| Arrows     | `arrowhead`, `arrowSize`, `corners`                                                                                       | a head (below); number, 0 to 32; `sharp` or `rounded`          | `triangle`, 8, `sharp` (`sketch.*`: `rounded`)                                    |
| Sketch     | `sketch`                                                                                                                  | `none`, `light` or `rough`                                     | `none` (`sketch.*`: `light`)                                                      |
| Icons      | `iconSize`, `iconPosition`                                                                                                | number, 8 to 64; `left`, `right`, `top`, `bottom` or `center`  | 18, `left` (stage: 24, `top`)                                                     |
| Frame      | `frame`, `brand`, `mark`                                                                                                  | `none`, `footer` or `header`; quoted text; `meltemi` or `none` | `footer`, `Meltemi Diagrams`, `meltemi`                                           |
| Motion     | `flowDuration`, `dashDuration`, `pulseDuration`, `traceDuration`                                                          | a time, `100ms` to `60s`                                       | none: 1200 ms for flow, 1500 ms for trace, 1 s otherwise                          |
| Canvas     | `selection`, `guide`                                                                                                      | quoted colour                                                  | none: the canvas uses `accent`                                                    |

The canvas tokens colour the editor only: `selection` its selection, handles and the point a
connector end takes, `guide` its alignment guides and the outline and magnets of the box an end
is dragged over. Exports never use them, and styles cannot name them.

The whiteboard tokens are colour tokens like the others, set in every built-in theme and inherited
by the themes that extend them: `stroke highlight` colours a highlighter stroke, and stickies take
`sticky` and `stickyText` unless styled ([free.md](free.md#stickies)). `stickyText` is near-black
in the dark themes too, since a sticky is paper. Pens take `ink` ([free.md](free.md#pen-strokes)).
The theme panel shows the three in a Whiteboard group.

`sketch` paints every stroke as if drawn by hand: outlines, connectors, heads, label pills, group
bands and the frame are drawn twice over a clean fill, each pass wobbling a little (`light`) or
more (`rough`), while text, icons and images stay crisp. The layout does not change, and every
export and the canvas show the same wobble for the same text
([svg-export.md](svg-export.md#sketched-strokes)). It is a theme token, not a style property: a
diagram is sketched whole or not at all, and `style a { sketch rough }` is `prop.unknown`.

```text
theme whiteboard {
  extends "technical.light"
  sketch rough
}
```

Numbers are written without a unit or with `px`; durations with `ms` or `s`, as in `animate`. A
duration token is the default speed of its effect for every diagram that uses the theme: an
`animate` statement without `duration` takes it ([motion](motion.md)). Line heights, pill heights, the frame strip and
default box sizes scale with the type sizes, and boxes without `size` grow to fit their text, so a
larger `labelSize` never makes text overflow.

## Style statements

Three statements style a diagram, from the most general to the most specific:

```text
diagram checkout: flow {
  theme "company"

  rule data { pattern dots }                  // every data store
  class hot { stroke danger; width 2 }        // a reusable set of properties

  api["API"] { class hot, partner }           // classes applied where an element is declared
  api -> db as save { class proposed }        // and where a relation is written
  style db { class critical; fill "#fff" }    // classes and explicit properties for targets
}
```

| Property                 | Value                                                                                            | Applies to                            |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `fill`                   | quoted colour (`"none"` for no background) or colour token name                                  | elements, relation labels             |
| `stroke`                 | quoted colour or colour token name                                                               | outlines, connectors and pens         |
| `color`                  | quoted colour or colour token name                                                               | text                                  |
| `line`                   | `solid`, `dashed` or `dotted`                                                                    | outlines, connectors and pens         |
| `width`                  | number, 0 to 64 (1 to 64 on a pen)                                                               | outlines, connectors and pens         |
| `opacity`                | number, 0 (invisible) to 1 (opaque)                                                              | free elements, groups, lines and pens |
| `radius`                 | number, 0 to 64: the corner radius, over the theme's `radius` or `groupRadius`                   | elements and groups only              |
| `rotation`               | number, 0 to 360: degrees the element turns, clockwise about its box's centre                    | flow and free elements                |
| `shape`                  | one of the twenty-four shapes of [free.md](free.md#text-and-shapes)                              | flow nodes and free boxes             |
| `pattern`                | `none`, `hatch`, `dots` or `cross`                                                               | elements only                         |
| `arrowhead`              | the head at the target (below)                                                                   | relations, free lines and pens        |
| `arrowtail`              | the head at the source (below)                                                                   | relations, free lines and pens        |
| `routing`                | `auto`, `orthogonal`, `polyline` or `bezier` ([layout](layout.md))                               | relations and free lines              |
| `corners`                | `sharp` or `rounded` bends of straight and elbow routes                                          | relations and free lines              |
| `icon`                   | `"<pack>:<name>"` ([assets.md](assets.md))                                                       | elements and relations                |
| `iconColor`              | quoted colour or colour token name                                                               | monochrome icons                      |
| `iconPosition`           | `left`, `right`, `top`, `bottom` or `center` ([icons in boxes](#icons-in-boxes))                 | nodes, decisions, data, boxes         |
| `labelPosition`          | `top`, `bottom`, `left` or `right`: the edge of the label around a centred icon                  | nodes, decisions, data, boxes         |
| `iconSize`               | `auto`, or a number from 8 to 128: the side of the icon                                          | nodes, decisions, data, boxes         |
| `fontSize`, `fontWeight` | the text's size, 6 to 160, and weight, 400, 500, 600 or 700 ([free.md](free.md#text-and-shapes)) | free boxes, texts and stickies        |
| `textAlign`              | `left`, `center` or `right`: where the text sits across its box                                  | free boxes, texts and stickies        |
| `verticalAlign`          | `top`, `middle` or `bottom`: where the text sits down its shape                                  | free boxes and stickies               |
| `class`                  | one or more class ids, in `style` statements and declaration blocks                              | elements and relations                |

- A colour token name (`danger`, `accent`, `muted`, …) follows the theme: `stroke danger` is red in
  every theme, in that theme's red. A bare word that is not a colour token is
  `prop.invalid-value`; write CSS colours quoted, as in `fill "red"`.
- `pattern` overlays the shape with hatching, dots or a grid in the element's stroke colour (or
  `muted`) at 35 % opacity, so meaning never depends on colour alone.
- `pattern`, `iconPosition`, `labelPosition`, `iconSize`, `radius`, `rotation` and `opacity` on a
  relation, `arrowhead` and `arrowtail` on an element other than a free line or a pen, `routing`
  or `corners` on an element other than a free line, and `shape` on anything but a flow `node` or
  a free `box`, are `prop.invalid-value` in `style` statements and rules. A free line takes the
  properties of a relation and refuses those of a box ([free.md](free.md#lines)); a pen takes
  `stroke`, `width`, `line`, `opacity`, `arrowhead` and `arrowtail` and refuses the others
  ([free.md](free.md#pen-strokes)). `fontSize`, `fontWeight`, `textAlign`, `verticalAlign` and
  `opacity` are free-only: flow diagrams refuse them. A class may hold them all; each target takes
  what applies to it.
- `width` is an outline's, a connector's or a pen stroke's width, from 0 to 64; a pen is drawn at
  least 1 px wide, so `width 0` on a pen is `prop.invalid-value`. `width 20` draws a highlighter
  stroke.
- `opacity` fades an element, a group with everything it holds, a free line or a pen of a free
  diagram, from 0 (invisible) to 1 (opaque); a story's visibility multiplies with it.
- `radius` rounds the corners of every shape that has them, clamped to half the shorter side:
  nodes and `rounded` boxes (the theme's `radius` by default), `rectangle`, `square` and `framed`
  boxes and nodes (square by default), the vertices of the polygons and of decisions (sharp by
  default; each is cut `radius` along both of its edges, at most half of each, and joined by a
  curve), the bodies of `person` and `agent`, notes, framed texts, icons and images, and groups:
  `style api { radius 0 }` squares one node, `style h { shape hexagon; radius 10 }` softens a
  hexagon, `rule group { radius 0 }` squares every group. Connectors, magnets and the text area
  follow the rounded outline. Ellipses, circles, pills, cylinders, clouds, documents, data stores,
  tags and the kinds of sequence diagrams have no corners to round.
- `rotation` turns an element of a flow diagram or a free composition clockwise by that many
  degrees about the centre of its box, its text, icon and outside label with it:
  `style api { rotation 90 }`, `rule text { rotation 270 }`. `place` and `size` keep describing
  the unturned box. Connectors meet the turned outline; a port or a pinned point (`api.north 30%`)
  turns with the element and keeps its side's name. The layout engine, groups drawn around their
  children and the composition checks use the turned drawing's bounding box. Groups, sequence
  diagrams and C4 views refuse it with `prop.invalid-value`; 0 and 360 draw upright.
- `shape` draws a node or a box as one of twenty-four shapes, with its own default size, text
  area and an outline that connectors meet ([free.md](free.md#text-and-shapes)):
  `style api { shape hexagon }`, `style planner { shape agent }` for an AI agent, or
  `style fn { icon "aws:lambda"; shape icon }` for an element drawn as its icon. Decisions, data
  stores, notes, tags, groups, free texts, icons and images, sequence participants and C4 entities
  refuse it, since their kind decides their drawing.
- `line dotted` draws round dots spaced by the line's width; `-->`, `---` and `line dashed` draw
  dashes.

### Arrow heads

A relation has a head at its target (`arrowhead`, else the theme's) and, optionally, at its source
(`arrowtail`). Without `arrowtail` the source has no head, or the target's head when the relation
is written `<->` or `<-->`. A relation written `--` (a line) or `---` (a dashed line) has no head
at either end unless `arrowhead` or `arrowtail` is written: the theme's head is only the default of
the arrows.

```text
api <-> cache                                  // the theme's head at both ends
api -- db as link                              // a line: no head at either end
style link { arrowhead circle }                // unless a style writes one
customer -> order as places
style places { arrowtail onlyOne; arrowhead zeroOrMany }
```

| Head                           | Drawn as                                                     |
| ------------------------------ | ------------------------------------------------------------ |
| `triangle`, `triangleOutline`  | a filled or hollow triangle (UML generalisation)             |
| `open`                         | a V                                                          |
| `diamond`, `diamondOutline`    | a filled or hollow diamond (UML composition and aggregation) |
| `circle`, `circleOutline`      | a filled or hollow circle                                    |
| `bar`, `cross`                 | a bar across the line, an X                                  |
| `many`, `oneOrMany`, `onlyOne` | crow's foot, crow's foot and bar, two bars (ER notation)     |
| `zeroOrOne`, `zeroOrMany`      | a bar or a crow's foot, with a hollow circle behind it       |
| `none`                         | no head                                                      |

Heads take the size of the theme's `arrowSize`; hollow shapes are not filled, and the line stops
at their back, so nothing shows through them. `corners rounded` replaces each bend of an `auto`,
`orthogonal` or `polyline` route by a curve 10 px from it; Bézier routes are smooth already.

### Icons in boxes

The `icon` of a node, a decision, a data store or a box goes where `iconPosition` says, at the
size `iconSize` gives it:

```text
diagram icons: flow {
  layout manual

  api["API"]
  orders["Orders"]
  fn["Checkout"]
  api -> orders
  orders -> fn

  placement {
    place api at (120, 80)
    place orders at (360, 80)
    place fn at (600, 80)
  }

  style api { icon "tabler:server"; iconPosition right; iconSize 32 }
  style orders { icon "tabler:database"; iconPosition center; labelPosition top }
  style fn { icon "aws:lambda"; shape icon }
}
```

| `iconPosition`            | Drawing                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `left` (default), `right` | beside the text: the icon and the text form one row, centred in the shape's text area                                                             |
| `top`, `bottom`           | above or below the text, in one column                                                                                                            |
| `center`                  | the picture of the box: the label and the description take a band inside the box at the `labelPosition` edge, and the icon is centred in the rest |

- **Size.** `iconSize` is the side of the icon, from 8 to 128 (with or without `px`), or `auto`.
  Beside the text it defaults to the theme's `iconSize` (18 in the technical themes). A box
  without `size` grows to hold a written number with its text, taller for a large icon beside
  it. A box with a written `size` keeps it: a number is clamped to the room the text leaves, never
  cut, and `auto` fills that room, half the padding from the edges. Without a `size`, `auto`
  beside the text is the theme's size.
- **Centred.** With `center` the icon is as large as fits with the padding around it, or the
  written `iconSize` when that is smaller. A node, decision, data store or box without `size`
  starts at 120 × 120 (at the 13 px label size, scaled with it), wider for a long label and
  larger for a written `iconSize`. Decisions, data stores, and nodes and boxes drawn with a shape
  other than `rounded`, `rectangle` or `square` lay the label and the icon out in the rectangle
  inscribed in their outline, and grow until it holds them. In a box with a written `size` the
  icon takes the room the label leaves, with half the padding around it when the room is short,
  down to 8 px; a `size` without room for that is `layout.text-overflow`, whose hint gives a size
  that holds the icon and the label.
- **Label position.** `labelPosition` (`top`, `bottom` by default, `left` or `right`) is the edge
  the label sits at when the icon is the centre piece: inside the box with `iconPosition center`,
  outside the icon with `shape icon` ([free.md](free.md#icons-as-shapes)). Anywhere else it
  changes nothing, and the layout reports `layout.label-position-ignored` (warning) on the
  property, with the hint to set `iconPosition center` or `shape icon`; written in a rule or a
  class, only when none of the elements it styles has its icon as the centre piece, and from a
  theme's rule or class once, on the diagram's `theme`. On groups, tags, notes, free texts, icons,
  images and C4 entities, whose icon is never the centre piece, the hint is to remove it.
- **The icon as the shape.** `shape icon` draws a node or a box as its icon alone, with its label
  outside; `iconPosition` does not apply to it, and `iconSize` sets its square
  ([free.md](free.md#icons-as-shapes)).
- C4 entities place their icon `left`, `right`, `top` or `bottom` of their text as nodes do, and
  draw `center` as `top`, since their kind decides their drawing.
- Groups, tags and notes draw their icon before their text, at 1.3 times the text size, whatever
  `iconPosition` and `iconSize` say. The theme's `iconPosition` takes the five positions too.
- Icons are drawn from the built-in packs or the project's packs, normalised in size; see
  [assets.md](assets.md).

### Classes

`class <id> { <properties> }` is declared at the top level of a diagram or inside a theme block.
Classes have their own namespace, cannot apply other classes, and may not be declared inside
groups. They are applied with `class a, b` in an element, group or relation block, or in a `style`
statement. A class name resolves to a class of the diagram, then of its theme or the theme's bases
(most specific first), then to a built-in class:

| Class        | Properties                                 |
| ------------ | ------------------------------------------ |
| `highlight`  | `stroke accent; width 2`                   |
| `critical`   | `stroke danger; width 2`                   |
| `proposed`   | `line dashed; stroke warning`              |
| `deprecated` | `pattern hatch; stroke muted; color muted` |
| `external`   | `line dashed; stroke muted`                |

A name that resolves to nothing is `theme.unknown-class` (warning), reported by project
compilation, which is where the whole theme chain is known; the class is then ignored.

### Rules

`rule <kind> { <properties> }` styles every element of a kind (`node`, `decision`, `data`, `group`,
`note`, `tag`; in free diagrams `box`, `text`, `icon`, `image`, `note`, `sticky`, `line`, `pen` and
`group`) or every relation (`relation`). `rule line` and `rule pen` take heads too:
`rule pen { arrowhead triangle }` ends every pen in a triangle. `rule line { line dashed }` reads
oddly but is right: the kind, then the property. Rules are written in diagrams and in theme
blocks, where they reach every diagram that uses the theme; a project-wide rule therefore lives in
the project's default theme. A property set twice for the same kind is `prop.duplicate`. Only
`rule node` and `rule box` may set `shape`; `rule group { radius 0 }` squares every group.

## Precedence

Each property of an element or relation takes the last value set in this order:

1. the theme's tokens (the project's default theme when the diagram has no `theme`);
2. the theme's rules, from the base theme to the most specific;
3. the diagram's rules;
4. applied classes: those of the declaration block, then those of `style` statements in source
   order;
5. explicit properties of `style` statements.

Animation state, added by the motion engine, applies on top of the result.

## Presets and canvas

| Statement         | Canvas                                                | `layout.too-large` (warning)                |
| ----------------- | ----------------------------------------------------- | ------------------------------------------- |
| (none)            | the content plus `margin`, plus the frame             | never                                       |
| `preset document` | as above                                              | wider than 1,200 px                         |
| `preset slide`    | as above, extended to 16:9 with the content centred   | wider than 1,920 px or taller than 1,080 px |
| `preset board`    | as above, whatever its size                           | never                                       |
| `canvas (w, h)`   | `w × h` with the content centred; grows where it must | when the content does not fit               |

`preset` and `canvas` cannot be combined, and another preset word is `prop.invalid-value` listing
`document, slide, board`. The frame strip spans the canvas at its top or bottom edge. Text is
never shrunk to fit a canvas: when the warning appears, split the diagram into views or story
scenes. `preset board` is for whiteboards, which grow with what is drawn on them: a kanban board
or an explanation drawn with pens and stickies ([free.md](free.md)). The warning of
`preset document` and `preset slide` says so in its hints.
