# Free compositions

Use `diagram <id>: free { }` for a slide, an executive picture or an explanation that does not fit
a flow notation. Objects are placed by hand (`layout manual` is the default); relations,
`placement`, constraints, `style`, `class`, `rule`, `animate`, themes, `preset` and `canvas` work
as in flow diagrams.

## Objects

| Declaration                       | Object                                                                                                       | Default size                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `box <id> "Label"`, `id["L"]`     | a shape with a label and an optional `description`                                                           | its shape's size, widened to its text |
| `id[("Label")]`                   | a box with the `cylinder` shape                                                                              | 160 × 64                              |
| `text <id> "Text\nmore"`          | measured text without a frame                                                                                | its extent                            |
| `icon <id> "tabler:server"`       | an icon of the packs; find names with `pnpm mdg assets icons <w>`                                            | 48 × 48                               |
| `image <id> "img/logo.png"`       | a PNG, JPEG, GIF, WebP or SVG file of the project, relative to the file                                      | its pixel size, at most 640 wide      |
| `note <id> "Text" [on <element>]` | an annotation: text with no frame until styled, and a dotted leader to the element it is attached to (below) | its text's extent                     |
| `group <id> "Label" { ... }`      | a band holding objects and relations; `group <id> "" { }` is plain                                           | written, or fitted to children        |
| `line <id> from (x, y) to (x, y)` | a line that joins no element: a divider, a bracket, an underline (below)                                     | the bounding box of its points        |

`node`, `decision`, `data` and `tag` are flow kinds and are refused here; `note` is a free kind.
Relations take the lines without heads `a -- b` and `a --- b` too.

## Notes

`note remark "Checked at the gateway" on gateway { layer front }` is text at the theme's note size in
the muted colour, left-aligned and without a frame. `style remark { fill "#fff7d6"; stroke warning;
line dashed }` gives it an outline (any of `fill`, `stroke` or `pattern` does); `fontSize`,
`fontWeight`, `textAlign`, `radius`, `color`, `icon` and `rotation` apply, `shape` does not. The
block takes `description`, `class`, `layer`, `link` and `url`. `on <element>` attaches the note to
any other element of the diagram: a dotted leader joins them, `layout auto` keeps them near each
other, renaming the element rewrites the clause, and deleting the element leaves the note. An
unknown target is `ref.unknown-element`; a note on itself, `prop.invalid-value`. A note with an
outline can take `animate remark { effect dash }`; without one, only a pulse.

## Shapes and corners

`style a { shape hexagon }` draws a box (or a flow `node`) as one of twenty-four shapes. Each has a
default size (technical themes; it scales with the label size), keeps its text inside its outline
and grows until the text fits, and connectors end on its outline:

| Size      | Shapes                                                                               |
| --------- | ------------------------------------------------------------------------------------ |
| 160 × 56  | `rounded` (default), `rectangle`, `pill`, `parallelogram`, `arrow`, `framed`, `flag` |
| 160 × 64  | `cylinder`, `trapezoid`, `hexagon`                                                   |
| 160 × 72  | `ellipse`, `octagon`, `document`, `callout`                                          |
| 160 × 80  | `diamond`                                                                            |
| 160 × 96  | `triangle`, `pentagon`                                                               |
| 160 × 104 | `person`                                                                             |
| 160 × 120 | `agent`                                                                              |
| 120 × 120 | `square`, `circle`, `star`                                                           |
| 180 × 100 | `cloud`                                                                              |
| 64 × 64   | `icon` (or its `iconSize`), the label outside (below)                                |

- `square` and `circle` are a rectangle and an ellipse with a square default size; `arrow` points
  right; `framed` has two inner lines (a subroutine); `callout` has a tail at the bottom left.
- `person` is a round head over a body; `agent` is an AI agent, a robot head (eyes, mouth and an
  antenna) over a body. Both keep the text in the body; an end on the north side meets the head.
- `\n` breaks a box's or a node's label into lines, as in a `text`.
- A `size` too narrow for the text inside a shape is `layout.text-overflow`; use the hint's width.
- A pinned end (`route r from a.east to d.north 30%`) is drawn where the side's normal meets the
  outline, so arrows touch diamonds, ellipses and stars.
- `radius 0..64` sets the corner radius of boxes, nodes, notes and groups (`radius 0` squares
  them); `rectangle`, `square` and `framed` are always square, the other shapes ignore it. The
  theme's `radius` (8) and `groupRadius` (14) are the defaults.
- Decisions, data stores, notes, tags, groups, texts, icons and images refuse `shape`, in `style`
  statements as in rules: their kind is their drawing. Only `rule box` and `rule node` may set it.

Free-only text properties (refused in flow diagrams):

- `fontSize 6..160`, `fontWeight 400|500|600|700`, `textAlign left|center|right` on boxes and
  text (text defaults to 1.6 × the label size, left aligned);
- `verticalAlign top|middle|bottom` on boxes (`middle` by default) moves the label, description
  and icon to the top or bottom of the shape's text band, the theme's padding from its edge:
  `style card { shape rectangle; textAlign left; verticalAlign top }` is draw.io's top-left text.
  Ellipses and other narrowing shapes move a wide block back towards the middle until it fits;
  cylinders keep it between the rims, documents above the wave, callouts above the tail. On
  `triangle`, `pentagon`, `star`, `person`, `agent` and `icon` shapes, with `iconPosition center`,
  and on texts, icons, images, groups and lines it moves nothing (`layout.vertical-align-ignored`);
- a text, icon or image with `fill`, `stroke` or `pattern` gets a frame.

## Lines

```text
line divider "Phase 2" from (40, 160) to (520, 160)          // a labelled divider
line bracket from (40, 220) to (520, 280) via [(280, 220)]   // bends in a via list
group notes "Notes" {
  text remark "Read first"
  line underline from (0, 22) to (120, 22)                   // in the group's interior
}
style divider { line dashed; stroke muted }
style bracket { routing orthogonal; corners rounded; arrowhead triangle }
```

- A `line` joins nothing: use it for dividers, brackets, underlines and strokes; between two
  boxes write a relation (`a -- b`) so it follows them.
- Its points are written in the statement, in the parent group's interior like `place`; it takes
  no `place`, `size` or `rotation` (`prop.invalid-value`).
- It takes a relation's styles: `stroke`, `width`, `line`, `arrowhead` and `arrowtail` (none by
  default), `routing` (`polyline` by default, `orthogonal`, `bezier`), `corners`, and `color`,
  `fill`, `icon` for its label pill; a box's properties (`shape`, `radius`, the text properties)
  are `prop.invalid-value`. `rule line { }` styles every line.
- The label is the optional second argument, on a pill at 50 %;
  `label divider at 20% offset (0, -14)` in `placement` moves it. `flow`, `dash`, `pulse` and
  `trace` run along a line.
- A line whose points coincide is drawn as a dot: `layout.degenerate-line`. Flow, sequence and C4
  diagrams refuse `line` (`prop.unknown`).

## Icons in boxes and as shapes

Flow diagrams take these too. The `icon` of a node, decision, data store or box goes beside the
text (`iconPosition left`, the default, or `right`), above or below it (`top`, `bottom`), or at the
centre as the picture of the box (`center`), with the label in a band at the `labelPosition` edge
inside (`bottom` by default). `shape icon` draws the element as its icon alone, with the label
outside at `labelPosition`, as provider icons are drawn in architecture diagrams:

```text
box gateway "API Gateway"
box fn "Checkout"
box orders "Orders"
box tile "Orders DB"
gateway -> fn
fn -> orders

style gateway { icon "aws:api-gateway"; shape icon }               // label below the icon
style fn { icon "aws:lambda"; shape icon; labelPosition top }      // label above
style orders { icon "aws:dynamodb"; shape icon; fill surface; stroke line }   // framed
style tile { icon "tabler:database"; iconPosition center }          // 120 × 120 tile
```

- `iconSize` is the icon's side: 8 to 128 (px or unitless) or `auto`. Beside the text the theme's
  18 px is the default; a number grows a box without `size`, and is clamped (never cut) in a box
  with a written `size`, where `auto` fills the room. A centred icon is as large as fits; a
  written `size` without room for an 8 px icon beside the label band is `layout.text-overflow`.
- An icon shape is a 64 × 64 square (or `iconSize`; a written `size` wins, the icon fitted
  inside), with nothing behind the icon unless `fill`, `stroke` or `pattern` frames it; a frame
  adds half the padding on each side (an 80 × 80 square around a 64 px icon). Arrows, ports and
  anchors end on the square (`to fn.south` is the icon's bottom edge); groups and the canvas
  count the label too, and a box over the label is `layout.overlap`, so leave room for it. A
  connector on the label's side is drawn from beyond the label; other routes go around it.
- `labelPosition` does nothing unless the icon is the centre piece: `layout.label-position-ignored`.
  `shape icon` without an `icon` is `layout.icon-missing` and draws a dashed placeholder.
- A free `icon <id> "pack:name"` object is an icon without text; for a labelled icon use a box
  with `shape icon`.

## Coordinates

- `place` is the centre, as in flow diagrams.
- **Inside a group, `place` is relative to the group's interior**: its top-left corner plus
  `groupPadding` (16) across and the header down: `groupHeader` (40) in the technical themes, or
  `groupPadding` (16) for an untitled group (`""`, no description, no icon). A child at
  `(w/2, h/2)` touches the interior's top-left corner. Moving the group moves its children.
- Every group needs a `place`. Without `size` it fits its children: padding + rightmost child edge
  - padding wide, header + lowest child edge + padding tall.
- Route waypoints are always diagram coordinates.

## Containers, stacks and bands

These are the pictures of a visual editor's containers and backdrops; flow diagrams take them too.

```text
group outer "" {                      // nested plain rectangles: untitled groups
  group inner "" {
    box core "Core"
  }
}
box plate ""                          // a stack: the outer box first, empty label
box card "Card"
group band "" { layer back }          // a band behind arranged boxes (layers back, main)

style outer { fill "#dae8fc"; stroke "#6c8ebf"; radius 0 }
style inner { fill "#fff2cc"; stroke "#d6b656"; radius 0 }
style band { fill "#f5f5f5"; radius 0 }
```

- **Untitled groups** draw only their outline, have no title band and cut no gap in connectors;
  children keep half the padding (8 px) from every edge (`layout.container-margin`).
- **Stacks**: a box lying strictly inside a box declared before it on the same layer is not
  `layout.overlap`; a partial overlap still is, so are two boxes that coincide, and so is a stack
  declared inner first (its hint says to declare the outer box first). A
  container's own label may lie over its children, but two labels at the same point are
  `layout.label-overlap`: leave the outer labels empty.
- **Bands**: a group with `place` and `size` is neither arranged by the engine nor an obstacle, so
  on a back layer it stays behind the boxes `layout assisted` arranges (pin one box with `place`
  so the others arrange around it). Boxes and groups on different layers are not checked against
  each other, and connectors cross them straight. In `layout auto` a group's `place` is ignored:
  make the band a group holding its boxes.

## Layers, order and links

- `layers back, main, front` lists layers back to front; `main` is the default and comes last
  when unlisted. Put `layer front` in an object's or relation's block.
- Within a layer, groups paint first, then objects (lines included) in source order, then
  relations: declare what must be on top later.
- `link checkout.api` in a block records that the object stands for element `api` of `diagram
checkout` (same file), `link co.api` through `import checkout as co from "..."`, or `link
views.checkout.api` through `import "..." as views`. Identity only; nothing is kept in step.

## From a flow diagram

`pnpm mdg convert sheet.meltemi --to free [--diagram <id>] [--id <new>]` adds a free copy of the
flow diagram as drawn: every box with `place` and `size`, children inside their copied groups,
layers, routes, labels, styles and animations, a `link` from each object to its source, and
classes `from_decision`, `from_data`, `from_tag` for the drawing of the flow kinds; notes stay notes,
with their `on` clause.
Edit the copy freely; the flow diagram is unchanged.

## Diagnostics

| Code                            | Fix                                                                                                                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref.unknown-layer`             | add the layer to `layers` (the hint gives the statement) or fix its name                                                                                                         |
| `ref.unknown-link`              | the diagram or element does not exist; fix the name or remove the `link`                                                                                                         |
| `asset.outside-project`         | image paths are relative, use `/`, no URLs, and stay inside the project                                                                                                          |
| `asset.unknown-image`           | the file does not exist next to the path written                                                                                                                                 |
| `asset.unsupported-image`       | not a PNG, JPEG, GIF, WebP or SVG image, broken, or over 8 MB                                                                                                                    |
| `layout.image-unavailable`      | the host could not read the image; a placeholder is drawn                                                                                                                        |
| `layout.missing-placement`      | an object or a group has no `place`                                                                                                                                              |
| `layout.overlap`                | boxes overlap partly, or a stack is declared inner first: declare the outer box first                                                                                            |
| `layout.icon-missing`           | `shape icon` without an `icon` style: add `icon "pack:name"` or choose another shape                                                                                             |
| `layout.label-position-ignored` | `labelPosition` only moves the label of `iconPosition center` and `shape icon` elements                                                                                          |
| `layout.vertical-align-ignored` | `verticalAlign` moves nothing on this shape or kind: choose a shape with a text band (`rectangle`, `ellipse`, `cylinder`), set `labelPosition` with a centred icon, or remove it |
| `layout.degenerate-line`        | a line's points coincide: move an end or add a bend with `via`                                                                                                                   |
| `prop.invalid-value`            | `fontSize`, `fontWeight`, `textAlign` and `verticalAlign` are free-only; `shape` is for `node` and `box` only; a line takes no `place` or `size`                                 |
