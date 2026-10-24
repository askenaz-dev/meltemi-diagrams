# Free compositions

[Español](../es/language/free.md)

A free diagram is a slide or an explanation that does not fit a strict notation. You place boxes,
text, icons, images, lines and groups where you want them, connect them, and order them in layers.
Every adjustment is code, and the same rules apply in the command line, the editor and every
export.

```text
language "0.2"

diagram overview: free {
  canvas (1600, 900)
  theme "editorial.dark"

  text heading "Arquitectura de eventos"
  box api "API"
  box events "Event bus"

  api -> events: "Publica" as publish

  placement {
    place heading at (800, 90)
    place api at (400, 420)
    size api (240, 120)
    place events at (1080, 420)
    size events (240, 120)
    route publish from api.east to events.west via [(740, 420)]
  }

  animate publish {
    effect flow
    duration 1600ms
    repeat forever
  }
}
```

Free diagrams compile into the same model as flow diagrams (decision 0018). Relations, `placement`,
constraints, `style`, `class`, `rule`, `animate`, themes, presets and canvases work as in flow
diagrams. `layout manual` is the default: every object has a `place`.

## Objects

| Declaration                                                   | Object                                                                                                                              | Default size                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `box <id> ["Label"] [{ … }]`                                  | a shape (below) with a label and an optional description                                                                            | its shape's size, grown to fit the measured text         |
| `id["Label"]`, `id[("Label")]`                                | a box; the second form has the `cylinder` shape                                                                                     | as above                                                 |
| `text <id> "Text"`                                            | measured text without a frame; `\n` breaks lines                                                                                    | the text's extent                                        |
| `icon <id> "<pack>:<name>"`                                   | an icon of the packs ([assets.md](assets.md)), without text; a labelled icon is a box with `shape icon` ([below](#icons-as-shapes)) | 48 × 48                                                  |
| `image <id> "<path>"`                                         | an image file of the project; `description` is its alt text                                                                         | its pixel size, at most 640 wide; 160 × 120 when unknown |
| `group <id> ["Label"] { … }`                                  | a band with a title, or a plain container when untitled, holding children                                                           | written, or derived from its children (below)            |
| `line <id> ["Label"] from (x, y) to (x, y) [via [(x, y), …]]` | a line that joins no element: a divider, a bracket, an underline ([below](#lines))                                                  | the bounding box of its points                           |

`node`, `decision`, `data`, `note` and `tag` belong to flow diagrams; in a free diagram they are
`prop.unknown`, with a hint that lists the free kinds. An element that only a relation mentions is
a box. Relations take the six tokens of flow diagrams, the lines without heads `--` and `---`
among them ([grammar](grammar-0.2.md#lexical-rules)).

### Text and shapes

`shape` applies to boxes and to the nodes of flow diagrams; texts, icons, images and lines refuse
it with `prop.invalid-value`. `radius` applies to the elements and groups of both profiles
([styles.md](styles.md)); `fontSize`, `fontWeight`, `textAlign` and `verticalAlign` to free
diagrams only, and flow diagrams refuse them with `prop.invalid-value` (decisions 0043 and 0058).

| Property        | Values                              | Default                                                |
| --------------- | ----------------------------------- | ------------------------------------------------------ |
| `shape`         | one of the twenty-four shapes below | `rounded`                                              |
| `radius`        | 0 to 64, the corner radius          | the theme's `radius`; `groupRadius` for groups (8, 14) |
| `fontSize`      | 6 to 160                            | the theme's label size; 1.6 times it for `text`        |
| `fontWeight`    | 400, 500, 600, 700                  | the theme's label weight                               |
| `textAlign`     | `left`, `center`, `right`           | `center` for boxes, `left` for text                    |
| `verticalAlign` | `top`, `middle`, `bottom`           | `middle`; boxes only                                   |

| Shape           | Default size                         | Text                                 | Connectors end on             |
| --------------- | ------------------------------------ | ------------------------------------ | ----------------------------- |
| `rounded`       | 160 × 56                             | centred, across the box              | the box                       |
| `rectangle`     | 160 × 56                             | centred, across the box              | the box                       |
| `square`        | 120 × 120                            | centred, across the box              | the box                       |
| `ellipse`       | 160 × 72                             | centred, inside the curve            | the curve                     |
| `circle`        | 120 × 120                            | centred, inside the curve            | the curve                     |
| `diamond`       | 160 × 80                             | centred, inside the four edges       | the edges                     |
| `cylinder`      | 160 × 64                             | in the body, under the top rim       | the rims and the sides        |
| `pill`          | 160 × 56                             | centred, between the round ends      | the round ends and the sides  |
| `triangle`      | 160 × 96                             | two thirds down, towards the base    | the outline                   |
| `parallelogram` | 160 × 56                             | centred, between the slanted sides   | the outline                   |
| `trapezoid`     | 160 × 64                             | centred, between the slanted sides   | the outline                   |
| `pentagon`      | 160 × 96                             | a little below the middle            | the outline                   |
| `hexagon`       | 160 × 64                             | centred, between the pointed ends    | the outline                   |
| `octagon`       | 160 × 72                             | centred, inside the cut corners      | the outline                   |
| `star`          | 120 × 120                            | at the star's centre                 | the outline                   |
| `cloud`         | 180 × 100                            | centred, inside the bumps            | the outline                   |
| `document`      | 160 × 72                             | in the page, above the wavy bottom   | the outline                   |
| `callout`       | 160 × 72                             | in the body, above the tail          | the outline                   |
| `arrow`         | 160 × 56                             | in the shaft, away from the head     | the outline                   |
| `framed`        | 160 × 56                             | between the two inner lines          | the box                       |
| `flag`          | 160 × 56                             | away from the notch                  | the outline                   |
| `person`        | 160 × 104                            | in the body, under the head          | the head and the body         |
| `agent`         | 160 × 120                            | in the body, under the head          | the head (north) and the body |
| `icon`          | 64 × 64, or `iconSize`, plus a frame | outside the icon, at `labelPosition` | the icon's square             |

- **Sizes.** The sizes are those of the `technical.*` themes and scale with `labelSize`. A box
  without `size` takes its shape's size and grows, wider first and then taller, until its label,
  description and icon fit the shape's text area, so a hexagon with a long label is wider than a
  rounded box with the same label. A `size` too narrow is `layout.text-overflow`, whose hint gives
  a width at which the text fits the shape. `square` and `circle` are a rectangle and an ellipse
  with a square default size; a written `size` stretches them. Details (a cylinder's rims, a
  document's wave, a star's points) scale with the shorter side, so a 24 px box still draws them.
  `arrow` points right.
- **People and agents.** `person` is a round head over a rounded body. `agent` draws an AI agent:
  a robot head, a rounded square with two eyes, a mouth and an antenna ending in a dot, over a
  rounded body. Both hold their text in the body. The agent's head and antenna take at most a
  third of its height, so connectors spread along a side meet the body; an end on the north side
  meets the top of the head, not the antenna.
- **Corners.** `radius` rounds `rounded` boxes (the theme's radius by default) and, when it is
  written, the corners of `rectangle`, `square` and `framed` boxes and the vertices of the polygons
  (`diamond`, `triangle`, `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`,
  `arrow`, `flag`, `callout`), and sets the body radius of `person` and `agent`. `pill` keeps round
  ends, and the shapes without corners ignore it.
- **Rotation.** `rotation <degrees>` turns any object but a group clockwise about the centre of its
  box, its text and icon with it; its `place` and `size` stay those of the unturned box, and the
  group around it grows to hold the turned drawing.
- **Connectors.** An end found on a side of the box (by the anchor rules, a percentage, a named
  port, a lane or the engine) slides along the side's normal to the first point of the outline,
  or to the nearest point of the outline where the normal meets none (between a star's points,
  beside a callout's tail) or where the end sits in a corner of the box. A pinned end such as
  `d.north 5%` keeps its side and percentage in the
  text and is drawn on the outline. `layout.connector-crossing` and the label audit measure shapes
  by their outline and their text area, not by their rectangle.
- **Vertical alignment.** `verticalAlign` moves a box's text block (its label, its description and
  an icon beside, above or below them) up or down within the shape's text band. `middle` is the
  spot of the table above. `top` puts the block in the first band from the top edge of the text
  band plus the theme's `padding` whose width holds it; `bottom` in the last one, from the bottom
  edge minus `padding`. In a shape that narrows towards its edge, such as an ellipse, a wide block
  moves back towards the middle until a band holds it, and a block taller than the shape stays at
  the middle. The text band is the box for `rounded`, `rectangle`, `square`, `framed`, `pill`,
  `hexagon`, `octagon`, `parallelogram` and `trapezoid`; inside the curve for `ellipse` and
  `circle`; inside the edges for `diamond` and the bumps for `cloud`; between the rims for
  `cylinder`; above the wave for `document`; above the tail for `callout`; the shaft for `arrow`;
  away from the notch for `flag`. `textAlign` keeps its meaning across the band, so
  `textAlign left; verticalAlign top` puts the text in the top left corner. The label audit and
  `layout.text-overflow` measure the block where it is drawn, and the editor types it there.
- **Alignment that moves nothing.** `triangle`, `pentagon`, `star`, `person`, `agent` and `icon`
  draw their text at a fixed spot, and a box with `iconPosition center` keeps its label band at
  `labelPosition`; on them, and on texts, icons, images, groups and lines, `verticalAlign` is
  `layout.vertical-align-ignored` (warning), once per statement that writes it, with a hint to
  choose a shape with a text band, to set `labelPosition`, or to remove it. A rule or a class is
  reported only when none of the elements it styles uses the value, and a theme's once, on the
  diagram's `theme`.

```text
box card "Orders" { description "Top left" }
style card { shape rectangle; textAlign left; verticalAlign top }
```

Lines of text are 1.25 times the font size apart, and `\n` starts a new line in a text and in the
label of a box or a flow node. A text, icon or image with `fill`, `stroke` or `pattern` gets a
frame with half the theme padding inside it. Icons take `iconColor`, then `color`. Rules take the
free kinds: `rule box { shape pill }`, `rule text { color muted }`; only `rule box` and
`rule node` may set `shape`.

### Icons as shapes

`shape icon` draws a box, or a flow node, as its icon alone with its label outside, the way
provider icons are drawn in architecture diagrams:

```text
diagram serverless: free {
  box gateway "API Gateway"
  box fn "Checkout"
  box orders "Orders"

  gateway -> fn
  fn -> orders

  placement {
    place gateway at (100, 100)
    place fn at (300, 100)
    place orders at (500, 100)
  }

  style gateway { icon "aws:api-gateway"; shape icon }
  style fn { icon "aws:lambda"; shape icon; labelPosition top }
  style orders { icon "aws:dynamodb"; shape icon; fill surface; stroke line }
}
```

- **The square.** The box is the icon's square: 64 × 64 at the 13 px label size, scaled with it,
  or the side a number in `iconSize` gives it. A written `size` wins, and the icon fits it keeping
  its proportions. The icon fills its square; nothing is drawn behind it unless `fill`, `stroke`
  or `pattern` is set, which frames it with half the theme padding inside. The frame grows the
  square by that much on each side, so the icon keeps its size: `orders` above is 80 × 80 around
  its 64 px icon. In a written `size` the icon fits inside the frame, and a `size` whose frame
  leaves no room for an 8 px icon is `layout.text-overflow`.
- **The label.** The label and the description are drawn outside the square at `labelPosition`:
  `bottom` by default, `top`, `left` or `right`, half the theme padding away, aligned by
  `textAlign` (centred by default).
- **Connectors.** Anchors, magnets, ports, selection and resizing use the square: `to fn.south`
  ends at its bottom edge, above a label drawn below it. A connector that leaves or enters the
  square on the label's side and runs straight past the label is drawn from beyond the label, its
  head clear of the text; any other route that would cross the element's own label goes around
  it. The engine, group margins, derived groups and the canvas size count the square and its
  label together; `layout.overlap` checks the square and the label as two parts, so a box in the
  empty corner beside the icon is fine and a box over the label is not; and the label audit
  treats the label as the element's own text.
- **Without an icon.** `shape icon` with no `icon` style is `layout.icon-missing` (warning, on the
  `shape` property), and a dashed placeholder with the id is drawn.
- **Centred icons.** To keep the box around the icon, write `iconPosition center` instead of
  `shape icon`: the icon is the picture of the box and the label sits inside it, at the
  `labelPosition` edge ([styles.md](styles.md#icons-in-boxes)).

## Groups and interior coordinates

The `place` of an object inside a group is relative to the group's **interior**: the group's
top-left corner plus `groupPadding` across and the group's header down. The header is
`groupHeader`, the band of the title, for a titled group, and `groupPadding` for an untitled one
(`groupPadding` is 16 and `groupHeader` 40 in `technical.light`). Moving a group moves its
contents without rewriting them.

```text
group backend "Backend" {
  box api "API"
}
placement {
  place backend at (300, 200)   // diagram coordinates
  size backend (400, 240)
  place api at (60, 40)         // inside backend: drawn at (176, 160)
}
```

- A group needs a `place`. Without `size` it takes `groupPadding + rightmost child edge +
groupPadding` by `header + lowest child edge + groupPadding`, measured from the interior; a
  titled group is never narrower than its title.
- Top-level objects and route waypoints use diagram coordinates.
- `LayoutResult.origins` gives every child's interior origin, so hosts convert between drawn and
  written positions.

### Plain containers

A group whose label is `""`, with no `description` and no `icon` style, is **untitled**. It
reserves no title band, draws only its outline (no title, icon or description), cuts no gap in
the connectors that cross it, and asks its children for half `groupPadding` at the top as on the
other sides (`layout.container-margin`). With `fill`, `stroke` and `radius 0` it is a plain
rectangle, so nested untitled groups draw the nested rectangles of a visual editor:

```text
diagram nested: free {
  group blue "" {
    group pink "" {
      group yellow "" {
        box core "Core"
      }
    }
  }

  placement {
    place blue at (300, 200)
    size blue (360, 280)
    place pink at (164, 124)      // in blue's interior, 16 px in from its top-left corner
    size pink (280, 200)
    place yellow at (124, 84)
    size yellow (200, 120)
    place core at (84, 44)
  }

  style blue { fill "#dae8fc"; stroke "#6c8ebf"; radius 0 }
  style pink { fill "#f8cecc"; stroke "#b85450"; radius 0 }
  style yellow { fill "#fff2cc"; stroke "#d6b656"; radius 0 }
}
```

Flow diagrams draw untitled groups the same way, in every layout mode; the engine leaves
`groupPadding` above their children. An empty label with a `description` or an icon keeps the
band, which then holds them.

## Lines

A `line` is a line that joins no element: a divider between phases, a bracket, an underline, a
stroke on a slide. Its points are in the statement, after `from`, `to` and an optional `via` list
of bends, so it needs no `place`:

```text
diagram phases: free {
  box web "Web"
  box api "API"
  web -> api

  line divider "Phase 2" from (40, 160) to (520, 160)
  line bracket from (40, 220) to (520, 280) via [(280, 220)]

  group notes "Notes" {
    text remark "Read first"
    line underline from (0, 22) to (120, 22)
  }

  placement {
    place web at (120, 80)
    place api at (440, 80)
    place notes at (280, 400)
    size notes (240, 120)
    place remark at (60, 6)
    label divider at 20% offset (0, -14)
  }

  style divider { line dashed; stroke muted }
  style bracket { routing orthogonal; corners rounded; arrowhead triangle }
  animate bracket { effect flow }
}
```

- **Points.** Two tuples of numbers without units after `from` and `to`, and a list of tuples after
  `via`, which continues across lines as a route's does. They are in the interior coordinates of
  the line's group, as `place` is ([above](#groups-and-interior-coordinates)): `underline` above
  is drawn under `remark`, and moves with `notes`. A statement whose points are missing or are not
  tuples is `prop.invalid-value`, with the form in the hint. `place`, `size` and `rotation` are
  refused on a line, with the hint that its points are written in its statement.
- **Label.** The second argument, empty by default. It is drawn as a relation's label, on a pill
  at the middle of the line, and `label <id> at <n>% [offset (dx, dy)]` moves it.
- **Styles.** A line takes the properties of a relation: `stroke` (the theme's `connector` by
  default), `width` (`connectorWidth`), `line` (`dashed`, `dotted`), `arrowhead` and `arrowtail`
  (none by default), `routing` (`polyline` by default, `orthogonal`, `bezier`), `corners`, and
  `color`, `fill` and `icon` for its pill. A box's properties (`shape`, `radius`, `pattern`,
  `iconPosition`, `labelPosition`, `iconSize`, the text properties) are `prop.invalid-value`.
  `rule line { … }` styles every line; its block takes `description`, `class`, `layer` and `url`.
- **Routing.** The points are the line's anchors and waypoints; how `orthogonal` and `bezier` go
  through them is in [layout.md](layout.md#connectors). A line has no lanes or detours and takes
  no part in the composition checks between boxes.
- **Order.** A line is an object: on its layer, it is painted in source order with the boxes, so a
  line declared after a box is drawn over it. Its box, the bounding box of its drawn points, counts
  for marquee selection, a group derived from its children and the canvas size.
- **Effects.** `flow`, `dash`, `pulse` and `trace` run along a line as along a relation
  ([motion.md](motion.md)).
- **Points that coincide.** A line with no length is drawn as a dot of its width and reported as
  `layout.degenerate-line` (warning), with the hint to move an end or give it a bend.
- **In the editor.** The relation tool dragged on empty canvas draws a line; a selected line shows
  a handle at each end and bend and in the middle of each stretch, and dragging them rewrites the
  points, snapped to the grid ([the editor](../editor.md#free-compositions)).

Flow, sequence and C4 diagrams refuse `line` with `prop.unknown`; there, a line between two boxes
is a relation written `--` or `---`.

## Layers and order

```text
layers back, main, front
box card "Card" { layer back }
text label "Front" { layer front }
```

`layers` lists layers from back to front. `main` always exists and comes last when it is not
listed; objects and relations without `layer` are on it. An undeclared layer is
`ref.unknown-layer`. The scene is painted layer by layer; within a layer, groups first (outer
before inner), then the other objects in source order, lines included, then relations. Boxes and groups on
different layers are not checked against each other, and a connector neither goes around nor is
reported crossing a box on another layer than its own. In the editor, bring to front and send to
back move the declaration within its block, and the Layers panel adds, renames, hides and removes
layers. Flow diagrams take `layers` and `layer` with the same rules; sequence diagrams and C4
views refuse them.

**Stacks.** A box declared after a box of its layer that holds it, strictly inside it, is painted
over it and is not `layout.overlap`: a stack is written outer first. Declared the other way round,
the stack is reported on the later box, with a hint to declare the outer box first; a partial
overlap is always reported, and so are two boxes that coincide. Connectors between boxes stacked
inside another box go straight across it. A box's own label may lie over the boxes it holds, but
two labels drawn at the same point are `layout.label-overlap`, so leave the outer labels empty or
keep them apart (`textAlign left`, or a `text` as the caption):

```text
box outer ""
box middle ""
box inner "Core"

placement {
  place outer at (300, 200)
  size outer (260, 240)
  place middle at (300, 200)
  size middle (210, 180)
  place inner at (300, 200)
  size inner (150, 130)
}
```

**Bands.** A placed and sized untitled group on a back layer is a band behind boxes: the engine
neither arranges it nor pushes arranged boxes out of it, so in `layout assisted` the boxes it
places sit over it. In `layout auto` a group's `place` is ignored; there the band is a group that
holds its boxes.

```text
diagram platform: free {
  direction LR
  layout assisted
  layers back, main

  group band "" { layer back }
  box web "Web"
  box api "API"
  db[("Orders")]

  web -> api
  api -> db

  placement {
    place web at (140, 120)
    place band at (400, 120)
    size band (720, 140)
  }

  style band { fill "#f5f5f5"; stroke "#d0d0d0"; radius 0 }
}
```

## Images

Image paths are relative to the `.meltemi` file, use `/` and stay inside the project:

- a URL, an absolute path or backslashes are `asset.outside-project` (from the model), and so is a
  path that leaves the project root (from the project);
- a missing file is `asset.unknown-image`;
- a file that is not a PNG, JPEG, GIF, WebP or SVG image, is broken, or is larger than 8 MB is
  `asset.unsupported-image`.

PNG, JPEG, GIF and WebP sizes come from their headers. SVG images are sanitised like icons and
written back as plain paths; their size comes from `width` and `height`, or from the `viewBox`.
Exports embed images as `data:` URIs inside `<image>` with `preserveAspectRatio="xMidYMid meet"`,
so the SVG stays portable. Hosts pass `LayoutOptions.images`; without it, or when the file cannot
be read, a dashed placeholder is drawn and `layout.image-unavailable` (warning) is reported.

## Identity links

`link <diagram>.<element>` in a block says that an object stands for an element of another
diagram. It works in flow and free diagrams:

```text
import "./views.meltemi" as views

diagram slide: free {
  box api "API Gateway" { link views.checkout.api }
}
```

| Form                      | Target                                           |
| ------------------------- | ------------------------------------------------ |
| `link checkout.api`       | element `api` of `diagram checkout` in this file |
| `link co.api`             | through `import checkout as co from "…"`         |
| `link views.checkout.api` | through `import "…" as views`                    |

An unknown diagram or element, or a link to the object's own diagram, is `ref.unknown-link`.
Renaming the element rewrites links to it; removing it lists the links, and removing with cascade
deletes them. Go to definition follows a link. A link is identity only: nothing is kept in step
between the views.

## Modes

| Mode               | Free diagrams                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manual` (default) | Every object and group has a `place`.                                                                                                                    |
| `assisted`         | Placed objects stay; ELK arranges the others. A group with placed children needs a `place`; a placed and sized group is neither arranged nor in the way. |
| `auto`             | ELK arranges everything; groups fit their children. Writing it down gives groups a place and a size.                                                     |

`meltemi-diagrams layout` and the editor's Arrange commands write children relative to their
group and give every group a `place` and a `size`.

## Converting a flow diagram

A flow diagram can be copied, as drawn, into a new free diagram in the same file:

```bash
meltemi-diagrams convert sheet.meltemi --to free
```

| Option           | Effect                                                        |
| ---------------- | ------------------------------------------------------------- |
| `--diagram <id>` | the flow diagram to copy; needed when the file has several    |
| `--id <id>`      | the id of the copy; `<diagram>_free` (`_2`, `_3`…) by default |
| `--check`        | writes nothing, says what would be added, exits 1             |
| `--stdout`       | prints the converted text instead of writing it               |

In the editor, **Convert to Free Composition** (Arrange menu, context menu and command palette)
does the same and shows the copy. The copy holds:

- `title`, `description`, `theme`, `preset` or `canvas`, `direction`, `routing` and `layers` when
  set, and `layout manual`;
- one object per element, with its id, label, description, classes, ports, `layer` and a link to
  its source, nested in copied groups with their relations;
- a `place` and `size` for every object as drawn, children inside their group, measured from its
  header (the padding for an untitled group);
- the routes and labels, and the `class`, `style` and `animate` statements as written;
- a class `from_<kind>` per flow kind that needs one, applied first to the converted objects:

| Flow     | Free  | Class                                                                                               |
| -------- | ----- | --------------------------------------------------------------------------------------------------- |
| node     | box   | only when the diagram has `rule node`                                                               |
| decision | box   | `from_decision { shape diamond }`                                                                   |
| data     | box   | `from_data { shape cylinder }`                                                                      |
| note     | text  | `from_note { textAlign left; fontSize <note size>; fontWeight 400; color muted }`                   |
| tag      | box   | `from_tag { shape pill; fill tag; stroke tag; color tagText; fontSize <tag size>; fontWeight 500 }` |
| group    | group | —                                                                                                   |

The diagram's `rule <kind>` properties for a flow kind join that class, so rules still apply
before classes; rules for groups and relations are copied. A node's own `shape` and `radius`
styles are copied as written and therefore win over the class. The source diagram is unchanged, and
the conversion is not reversible. The copy differs from the source in a few details:

- tags use the body font, not the mono font, and are painted under connectors;
- rules of file themes for flow kinds do not reach the copy;
- connectors are routed again between the same boxes; waypoints of `layout auto` sources, which
  were not drawn, are left out.
