# SVG export

[Español](../es/language/svg-export.md)

`meltemi-diagrams export <file.meltemi>` renders every `flow` and `free` diagram of a file to SVG. This page describes what
the exporter draws, how it chooses positions it was not given, and what the SVG contains. The
pipeline is `compile()` in `@meltemi/diagrams-model`, `layoutDiagram()` in `@meltemi/diagrams-layout` (model to vector scene)
and `renderSvg()` in `@meltemi/diagrams-render` (scene to text).

```bash
pnpm mdg export examples/konfio-agent-platform/konfio-agent-platform.meltemi
```

Options: `--diagram <id>` exports one diagram, `--out <path>` names the file (one diagram) or an
existing directory, `--stdout` prints one diagram, `--format svg` is the only format today. The
output is named `<file>.svg`, or `<file>.<diagram-id>.svg` when the file holds several diagrams.
With `--stdout`, diagnostics go to stderr so that stdout holds only the SVG. Exit codes follow
`meltemi-diagrams validate`: 0, 1 with error diagnostics, 2 for usage errors.

## What renders

Every flow, free, sequence and C4 diagram without errors. The exporter arranges `layout auto` and `layout assisted`
diagrams with ELK ([layout.md](layout.md)); `layout manual` reports every element without a
`place` as `layout.missing-placement`. Hosts that call `layoutDiagram()` without an engine render
`auto` and `assisted` diagrams only when every element is placed, and report
`layout.mode-unsupported` otherwise. A file without a renderable diagram reports
`export.no-diagram`. Free diagrams, their objects, images and layers are described in
[free.md](free.md). Sequence diagrams are laid out without an engine from the order of their
events, and `--scenario <id>` exports one path ([sequence.md](sequence.md)). C4 views are laid
out like flow diagrams, with C4 shapes ([c4.md](c4.md)).

Groups never need a `place`: without `place` and `size` a group fits its children with the theme's
`groupPadding` on the sides and bottom (16 px in `technical.*`) and its `groupHeader` on top for
the title (40 px), or `groupPadding` again when it is untitled (label `""`, no description, no
icon). With both statements it is drawn exactly there. One statement without the other is
`layout.missing-placement`.

In flow diagrams, coordinates are diagram coordinates for every element, inside groups too. In free
diagrams, the children of a group are placed relative to its interior ([free.md](free.md)).
`place` is the centre of the box and `size` its width and height.

## Default sizes

Sizes come from the theme's tokens ([styles.md](styles.md)). The values below are those of the
`technical.*` themes; other type sizes scale them.

| Kind                                                  | Without `size`                                                                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node`                                                | 160 x 56, wider when the label or a description line needs it (+`padding`, 16 px, on each side), and wider or taller for an icon beside, above or below the text at its `iconSize`               |
| `node` with `shape`                                   | the shape's size ([free.md](free.md#text-and-shapes)), grown until the text fits the shape's text area; `shape icon` is 64 x 64, or a written `iconSize`, plus its frame, with its label outside |
| `node`, `decision`, `data` with `iconPosition center` | 120 x 120, widened for its label; a decision or a data store grows until its outline holds the label and the icon                                                                                |
| `decision`                                            | 160 x 80, grown until the text fits inside the diamond                                                                                                                                           |
| `data`                                                | 160 x 64, widened as a node                                                                                                                                                                      |
| `group`                                               | children's box + `groupPadding` sides and bottom, `groupHeader` top (`groupPadding` when untitled), widened for its title; a child drawn with `shape icon` counts with its label                 |
| `tag`                                                 | measured text width + 18, by 18                                                                                                                                                                  |
| `note`                                                | measured width of the longest line, by 18 per line plus 4                                                                                                                                        |

The base boxes scale with `labelSize` (160 x 56 at 13 px). A box is also at least as tall as its
label and description lines plus four fifths of `padding` above and below, so several description
lines grow it.

Text is measured with the bundled fonts before layout (see [fonts.md](fonts.md)), so boxes without
`size` always fit their text. An explicit `size` that leaves less than 6 px between the text and
an edge (for a diamond or another shape, the edge of its text area) is reported as
`layout.text-overflow`, with a hint giving a width that fits; the text is never scaled down.
Relation label pills are as wide as their measured text plus 12 px.

## Shapes and text

| Kind       | Drawing (sizes of `technical.*`)                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `node`     | rounded rectangle (`radius` 8, or its own `radius`); label `labelSize` 13 px at `labelWeight` 600; description lines 11 px; with `shape`, that shape, with the text in its text area |
| `data`     | cylinder (body and top ellipse); text as a node, shifted down by half the ellipse height                                                                                             |
| `decision` | diamond; text as a node, inside the diamond                                                                                                                                          |
| `group`    | rounded band (`groupRadius` 14, or its own `radius`) with the title (`groupTitleSize` 13 px) at the top-left, description under it; an untitled group draws its outline only         |
| `note`     | left-aligned `noteSize` 11 px muted text, 18 px per line, no border unless `fill`, `stroke` or `pattern` is set                                                                      |
| `tag`      | pill with `tagSize` 10.5 px mono text; `tag` fill and `tagText` text by default                                                                                                      |

The twenty-four shapes that nodes and free boxes take, with their sizes, text areas and outlines,
are listed in [free.md](free.md#text-and-shapes); `shape icon` draws the icon alone with the label
outside ([free.md](free.md#icons-as-shapes)), and `iconPosition` places an icon beside, above,
below or at the centre of the text ([styles.md](styles.md#icons-in-boxes)).

Outlines are `strokeWidth` wide (1 px). The label and the description of a node, a decision, a
data store, a box or a C4 entity may hold `\n` line breaks, each line drawn under the last.
Relation labels are pills (surface fill, line stroke) with `relationLabelSize` 11 px text, centred
on the route point given by `label <relation> at <n>% offset (dx, dy)`, or at 50 % without offset
when there is no `label` statement.

## Connectors

A relation is a `connectorWidth` polyline (1.3 px in `technical.*`) ending in the theme's
`arrowhead`, `arrowSize` long and seven eighths as wide:

- `triangle` (technical and stage): a filled triangle; the line stops at its base;
- `open` (editorial): an unfilled chevron in the connector colour and width; the line reaches the
  tip;
- `none`: no head; the line reaches the box.

`arrowhead` and `arrowtail` styles choose any of the heads of [styles.md](styles.md#arrow-heads)
at the target and at the source; a two-way relation (`<->`, `<-->`) draws the target's head at
both ends. Heads are drawn after the line and before the label, in the connector's colour and
width; filled shapes stop the line at their base, hollow ones at their back. A Bézier connector
is trimmed at both ends.

`-->` and `line dashed` use a `5 4` dash pattern; `line dotted` draws round dots, a dash of 0 and
a gap of `1.5 × width + 3` with round caps.

The anchor on each box follows decision 0006:

1. With waypoints, each side anchors at the projection of its neighbouring waypoint, clamped to the
   side. `route ext from clients.east to gateway.north via [(1035, 48)]` leaves `clients` at
   y = 48 and enters `gateway` at x = 1035.
2. Facing parallel sides without a waypoint between them meet at the centre of the overlap of their
   extents. A box spanning x 260..460 above a box spanning x 240..700 gets a vertical connector at
   x = 360. When the extents do not overlap, each side uses its own centre.
3. Sides that do not face each other leave from their centres; perpendicular sides are joined by
   one elbow.
4. An `auto` port (the default, also `from api` without a port) picks the side that faces the
   neighbouring point, judged relative to the box proportions, so a wide band prefers its east or
   west side for a box beside it.

Explicit waypoints always win over these rules. A named port, or a compass side with a percentage
(`api.east 50%`), anchors at its own point, which waypoints do not move, and free ends that meet
one side of a box less than 16 px apart take lanes along it ([layout.md](layout.md#connectors)). The `routing` property chooses
orthogonal, straight or curved connectors; see [layout.md](layout.md).

**Anchors on outlines.** These rules find points on a box's rectangle. On a box drawn with
another shape (a decision's diamond, a data store's cylinder, a tag's pill, a node or box with a
`shape` other than `rounded`, `rectangle`, `square` or `framed`), every such point, the engine's
route ends included, then slides along the inward normal of its side to the first point of the
outline, or to the nearest outline point when the normal meets none; a point in a corner of the
rectangle (a lane pushed to the end of its side) goes to the nearest outline point. Arrowheads and curves follow
the final tip, and the text keeps the side and the percentage. A route that ends `to d.north 5%` on
a 160 × 80 diamond centred at (280, 200) ends at (208, 196), on its upper-left edge, not at the
rectangle's corner.

## Styles

| Property    | Element                                                    | Relation                                |
| ----------- | ---------------------------------------------------------- | --------------------------------------- |
| `fill`      | background; `"none"` draws no background                   | label pill background                   |
| `stroke`    | outline colour                                             | connector and arrowhead colour          |
| `color`     | label and description text                                 | label pill text                         |
| `line`      | `dashed` or `dotted` outline                               | overrides the arrow style (`->`, `-->`) |
| `width`     | outline width                                              | connector width                         |
| `radius`    | corner radius of rounded rectangles and groups             | not allowed                             |
| `shape`     | the drawing of a node or a free box                        | not allowed                             |
| `pattern`   | `hatch`, `dots` or `cross` over the shape, at 35 % opacity | not allowed                             |
| `arrowhead` | not allowed                                                | the head at the target                  |
| `arrowtail` | not allowed                                                | the head at the source                  |
| `corners`   | not allowed                                                | `rounded` bends                         |
| `icon`      | an icon left of or above the text ([assets.md](assets.md)) | an icon in the label pill               |
| `iconColor` | colour of a monochrome icon                                | colour of a monochrome icon             |

Colours may be token names (`stroke danger`), which follow the theme. Patterns are drawn in the
element's stroke colour, or `muted` without one, so meaning never depends on colour alone. Classes,
kind rules and the order in which they apply are in [styles.md](styles.md).

A label pill without `stroke` borrows the `fill` colour, so `style r1 { fill "#1b1f23"; color "#fff" }`
gives a dark circle for a one-character label. Styles with several targets
(`style a, b, c { ... }`) are the usual way to mark every proposed piece `line dashed`.

## Themes

The theme decides palette, type, spacing, strokes, arrowheads and the brand frame. Built-in themes:

| Name                        | Background | Surface   | Ink       | Muted     | Line      | Font          | Frame  |
| --------------------------- | ---------- | --------- | --------- | --------- | --------- | ------------- | ------ |
| `technical.light` (default) | `#F7FBFF`  | `#FFFFFF` | `#0B1830` | `#526579` | `#DCE5ED` | Inter         | footer |
| `technical.dark`            | `#07111F`  | `#0F1B2D` | `#F7FBFF` | `#88A0B9` | `#183149` | Inter         | footer |
| `editorial.light`           | `#ffffff`  | `#ffffff` | `#1b1f23` | `#5b6570` | `#c7cdd2` | IBM Plex Sans | none   |
| `editorial.dark`            | `#13161a`  | `#1b1f24` | `#e5e8eb` | `#9aa4ad` | `#3b434b` | IBM Plex Sans | none   |
| `stage.light`               | `#FFFFFF`  | `#FFFFFF` | `#0A0F1A` | `#3D4A5C` | `#9AA8B8` | Inter         | header |
| `stage.dark`                | `#05080F`  | `#0E1626` | `#FFFFFF` | `#A9B8CC` | `#2B3B52` | Inter         | header |

- **Technical**, for architecture review: Aegean blue tags (`#2563EB`, cyan in the dark theme), the
  Meltemi gradient for the mark (`#1D4ED8` to `#0891B2` on light, `#3B82F6` to `#22D3EE` on dark)
  and the sizes of the tables above.
- **Editorial**, for documents and long reading: quiet greys, ink-coloured tags, smaller radii,
  1 px connectors with open arrowheads and no frame.
- **Stage**, for presentations and video: higher contrast, 16 px labels, 13 px descriptions and
  relation labels, 2 px connectors, 10 px arrowheads, 48 px margins and a header frame.

Every built-in theme has the signal colours `success`, `warning`, `danger` and `info`, and the
built-in classes ([styles.md](styles.md)).

A file can define its own theme with a `theme <id> { }` block (tokens in
[grammar-0.2.md](grammar-0.2.md#theme-blocks)) and select it with `theme "<id>"`. A project can set
a default theme in `project.json` ([projects.md](projects.md)). `meltemi-diagrams export --theme
<name>` overrides the diagram's choice. Any unknown name renders with `technical.light` and reports
`layout.unknown-theme` as a warning. Explicit colours in styles are kept as written in every theme;
colour token names follow it.

### Frame

`frame footer` (the default of the technical themes) adds a strip under the sheet with a hairline
in the `line` colour, the Meltemi mark drawn with the gradient `accent` to `accentEnd`, the `brand`
text (semibold) and the diagram `title` right-aligned. Its measures follow `frameSize`: at 12 px the
strip is 44 px high, the mark 24 px and the title 11 px. `frame header` (the stage themes) puts the
strip on top. `mark none` drops the symbol; `brand ""` drops the wordmark; `frame none` removes the
strip, which is how the editorial themes behave. The strip spans the whole canvas, is a scene group
with role `frame`, outside the diagram's elements, and the canvas grows to fit the wordmark and
title.

### Presets and canvas

`preset document` warns (`layout.too-large`) when the canvas is wider than 1,200 px. `preset slide`
extends the canvas to 16:9 with the content centred and warns when the content exceeds
1,920 × 1,080 px. `canvas (w, h)` fixes the canvas and centres the content; a dimension the content
exceeds grows, with the same warning. Text is never shrunk: split dense diagrams into views.

## The SVG

- One `<svg>` with `xmlns`, `width`, `height` and `viewBox`; the canvas is the bounding box of the
  scene plus the theme `margin` (20 px in `technical.*`), rounded up to whole pixels, then sized by
  the preset or `canvas`.
- `<title>` and `<desc>` carry the diagram `title` and `description` when present.
- A background rectangle in the theme background colour, another colour, or none with
  `--background transparent` ([export.md](export.md)).
- Elements with a `url` draw inside an `<a href>` in their group; a picture `link` wraps everything
  drawn in one `<a href>`.
- Every element and relation is a `<g data-id="..." data-role="element|relation">`; relation labels
  are a nested `<g data-role="label">`. Editors can map clicks back to ids with these attributes.
  A group on a layer other than `main` also carries `data-layer="<name>"`.
- Images of free diagrams are `<image href="data:…" preserveAspectRatio="xMidYMid meet">` inside
  their element group, with the description as a `<title>` child. No file or URL is referenced.
- One `<defs>` block appears when the scene uses the brand mark (`<linearGradient>`), patterns
  (`<pattern>` tiles referenced as `fill="url(#…)"` by an overlay shape) or embeds fonts (`<style>`
  with `@font-face` rules). The mark group carries a `transform`. Presentation is
  otherwise inline (`fill`, `stroke`, `stroke-dasharray`, `font-size`, `font-weight`): no CSS
  variables, no `<marker>`, no `dominant-baseline`, no external fonts.
- Baselines come from the layout: the text centre plus half the cap height of the measured font,
  so text sits optically centred with any font.
- Fonts follow the export's font policy: `embedded` (default for `meltemi-diagrams export`: the
  bundled subset files as data URIs), `outlined` (text as paths with `aria-label`), or `system`
  (font names only; the first installed font is used). See [fonts.md](fonts.md).
- Rendering the same source twice gives byte-identical files, which is what the snapshot tests
  under `corpus/` and `examples/` check.
- Effects (`animate`) are not drawn by default. `--at <time>` draws the picture at that instant,
  with particles, dashes and halos as ordinary shapes in a last `<g data-role="motion">`.
  `--motion animated` writes the animated profile: one `<style>` with CSS keyframes, classes on
  the animated shapes, and overlays that are invisible outside their animations, so the static
  picture remains the fallback ([motion.md](motion.md)).

PNG and PDF are drawn from this SVG by the installed browser ([export.md](export.md)).
