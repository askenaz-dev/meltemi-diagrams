# Converting an existing diagram into a `.meltemi` sheet

The goal is a sheet whose export can be put beside the original with only intended differences.
Work from the source's own geometry whenever it has one.

## Mermaid and PlantUML: import

Never retype a Mermaid or PlantUML diagram; import it:

````bash
pnpm mdg import docs/checkout.mmd            # writes docs/checkout.meltemi
pnpm mdg import design.puml --out sheets/design.meltemi
pnpm mdg import README.md                    # every ```mermaid and ```plantuml block
````

- Mermaid `flowchart`/`graph`, `sequenceDiagram`, `C4Context`/`C4Container`/`C4Component`/
  `C4Dynamic`, `architecture-beta` and `block-beta`; PlantUML component, deployment, use case,
  sequence and C4-PlantUML diagrams, with `!define`, `!procedure`, `!function`, variables,
  conditionals, loops and local `!include` files. Other types are refused.
- Read every finding: `import.approximated` (kept with another drawing), `import.unsupported-construct`
  (dropped) and `import.syntax` (a line it could not read, kept as a `// Not imported:` comment).
  Exit 1 means something essential is missing: add it by hand from the comment and the source.
- Flow imports use `layout auto`; adjust them on the canvas or with `layout assisted` and `place`.
  When the source changes, run `pnpm mdg import <source> --merge`: placement, styles, classes,
  animations, scenarios and local labels are kept for everything still in the source.
- C4 macros become a `model` and a view; check the level, the scope and the `include` list.
- Shapes are kept: Mermaid hexagons, parallelograms, trapezoids, circles, stadiums, subroutines
  and flags, and PlantUML clouds, hexagons, actors, use cases, interfaces and files become nodes
  (or boxes) with `style <id> { shape … }`; mirrored Mermaid forms are drawn as the nearest shape
  and reported. Mermaid `block:` groups become untitled groups.
- `docs/import/mermaid.md` and `docs/import/plantuml.md` in the repository list what each construct
  becomes.

The rest of this page is for sources that cannot be imported: HTML, SVG, draw.io, screenshots.

## 1. Get the geometry

| Source                  | Where the numbers are                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| HTML or SVG sheet       | `rect x y width height` and `text x y`; arrows as `line`/`path`; classes tell the category  |
| draw.io / Excalidraw    | the XML or JSON holds `x`, `y`, `width`, `height` per shape                                 |
| D2 and other text tools | no coordinates: list nodes and edges, then design a grid (columns 200 px apart, rows 80 px) |
| Screenshot or photo     | estimate on a 20 px grid; keep relative alignment, not pixel fidelity                       |

Record each box as centre and size: `place id at (x + w/2, y + h/2)` and `size id (w, h)`.

In draw.io a shape inside a container has `parent` set to the container and `x`, `y` relative to
the container's top-left corner. In a free diagram write the container as a group and the child's
`place` relative to the group's interior: `(x + w/2 - 16, y + h/2 - 16)` for an untitled group,
`(x + w/2 - 16, y + h/2 - 40)` for a titled one (technical themes). In a flow diagram keep diagram
coordinates.

## 2. Map the pieces

| In the original                                                  | In the sheet                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Coloured band or swimlane with a title                           | `group id "Title" { ... }` with `place` and `size` of the band; colours in `style`   |
| Nested plain rectangles, untitled containers (draw.io)           | untitled groups `group id "" { ... }`, `style id { fill "…"; stroke "…"; radius 0 }` |
| Backdrop behind a row of boxes                                   | an untitled group with `place`, `size` and `layer back` (`layers back, main`)        |
| Rectangles drawn one inside another                              | boxes declared outer first, outer labels `""`; the stack is not an overlap           |
| Hexagon, ellipse, circle, cloud, document, actor, star, triangle | `style id { shape hexagon }` on a `node` (flow) or `box` (free); see the note below  |
| Square or more rounded corners (`rounded=0`)                     | `style id { radius 0 }`, or `radius 16`; `rule group { radius 0 }` for all groups    |
| Box with title and subtitle                                      | `node id "Title" { description "subtitle" }` (or `id["Title"]` without subtitle)     |
| Database, cache, bucket, queue of records                        | `data id "Name" { description "..." }`                                               |
| Diamond / question                                               | `decision id "Question?"`                                                            |
| Free text, footnotes, limits                                     | `note id "line\nline"`                                                               |
| Small badges or pills on boxes                                   | `tag id "TEXT"` placed on the corner                                                 |
| Dashed outline, "proposed", "to validate"                        | `style a, b, c { line dashed }`                                                      |
| Numbered step circles on arrows                                  | relation labels `"1"`, `"2"` with `label r1 at 50% offset (16, 0)` and a dark style  |
| Arrow                                                            | `a -> b` (named `as id` when it has a label, a route or a style)                     |
| Bent arrow                                                       | `route id from a.side to b.side via [(x, y)]`, one waypoint per bend                 |
| Legend                                                           | a row of `tag`s under the sheet with the category colours                            |
| Explanatory paragraphs, step list                                | comments next to the relations; the ones not drawn stay as comments                  |

Some shapes are the nearest picture, not the same one. `shape triangle` points up, while draw.io's
`triangle` points right unless rotated: draw a right-pointing marker as `shape arrow`, or accept
the turned triangle. `shape person` is a head over a body, not draw.io's stick-figure actor.

Keep the original ids where they exist; otherwise derive camelCase ids from the labels.

## 3. Write the file

Order inside the diagram: properties, bands with their children, free-standing elements, tags,
relations with comments, legend, `placement`, then `style`. Group the placement block by area and
the style block by palette, with one shared statement for "dashed".

## 4. Prove it

1. `pnpm mdg validate file.meltemi` until no diagnostics remain.
2. `pnpm mdg export file.meltemi`, open the SVG beside the original (`pnpm preview`).
3. Compare arrow by arrow: in the original the arrows usually join boxes where they overlap, which
   is what the exporter does without routes; only arrows that bend need waypoints.
4. Write down the intended differences (cylinders for stores, left-aligned band titles, legend inside
   the sheet, fonts) in a README next to the file.

## Worked example

The Konfío Agent Platform sheet (30 boxes, 4 bands, 13 arrows, 8 steps, 7 tags) converts into one
file where only one arrow carries a waypoint; every other arrow is reproduced by the anchor rules.
See `examples/konfio-agent-platform/` in the Meltemi Diagrams repository, or the generic
[examples/platform.meltemi](../examples/platform.meltemi) in this skill.
