# The Meltemi language (0.2), flow profile

A `.meltemi` file is UTF-8 text with LF or CRLF line breaks. Statements end at a line break or
`;`; `//` and `/* */` are comments and are preserved by every tool. Identifiers match
`[A-Za-z_][A-Za-z0-9_]*`; strings are double-quoted with `\"`, `\\`, `\n` and `\t` escapes;
numbers may carry a unit (`1200ms`, `2s`, `50%`).

## File structure

```text
language "0.2"                      // optional header, must come first

import "../themes/company.meltemi" as company       // imports go before the blocks
import corporate from "../themes/company.meltemi"

theme <id> { <token> <value> ... }  // optional, see themes.md

diagram <id>: flow { ... }          // one or more diagrams
```

## Projects and imports

A folder with `project.json` (`{ "name": "...", "language": "0.2" }`) is a project; files in it
import each other with relative paths (`./`, `../`, ending in `.meltemi`, never URLs).
`import "<path>" as <ns>` makes `<ns>.<id>` available; `import <id> [as <alias>] from "<path>"`
binds ids directly. Use imported themes by name: `theme "corporate"`, `theme "company.base"`,
`extends "company.base"`. Import cycles are errors (`module.cycle`). Validate a whole project with
`pnpm mdg validate <project folder>`; the full rules are in the repository's
`docs/language/projects.md`.

Every block compiles: `flow`, `free`, `sequence` and `c4` diagrams render, `story` blocks play
([stories.md](stories.md)) and `export` profiles write deliveries (below); free compositions are described in [free.md](free.md), sequence
diagrams in [sequence.md](sequence.md), and models with C4 views in [c4.md](c4.md). Any element block may hold `link <diagram>.<element>`, which ties
it to an element of another diagram.

## Inside `diagram <id>: flow { }`

| Statement                                                          | Meaning                                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `title "..."`, `description "..."`                                 | SVG `<title>` and `<desc>`; the title also appears in the brand frame                         |
| `layout auto`, `layout assisted`, `layout manual`                  | ELK arranges everything, the unplaced boxes only, or nothing (layout.md)                      |
| `routing orthogonal`                                               | connector shape: `auto` (default), `orthogonal`, `polyline`, `bezier`                         |
| `theme "<name>"`                                                   | built-in or file theme; default the project theme or `technical.light`                        |
| `preset document`, `preset slide`, `preset board`, `canvas (w, h)` | canvas size and limits; `board` grows with a whiteboard (see themes.md)                       |
| `class id { ... }`, `rule kind { ... }`                            | reusable styles and styles for every element of a kind (themes.md)                            |
| `direction LR`                                                     | flow of the automatic layout (`LR`, `RL`, `TB`, `BT`)                                         |
| `layers back, main, front`; `layer back` in a block                | paint order, back to front; `main` always exists; elements, groups and relations take `layer` |
| `id["Label"]`                                                      | node (rounded box)                                                                            |
| `id[("Label")]`                                                    | data store (cylinder)                                                                         |
| `node id "Label"`, `decision id "Label?"`, `data id "Label"`       | typed declarations; label defaults to the id                                                  |
| `group id "Label" { ... }`                                         | band holding declarations, relations and nested groups                                        |
| `group id "" { ... }`                                              | a plain container: no title band, padding 16 px all round (free.md)                           |
| `note id "Line one\nLine two" [on element]`                        | free text, left-aligned, no border; `on` attaches it to an element with a dotted leader       |
| `tag id "PKCE"`                                                    | small pill with mono text                                                                     |
| `a -> b`, `a --> b`, `a <-> b`, `a <--> b`                         | solid or dashed relation, one way or two-way; undeclared ids become nodes                     |
| `a -- b`, `a --- b`                                                | a solid or dashed line without heads between two elements                                     |
| `a -> b: "Label" as id`                                            | relation with label and id                                                                    |
| `{ description "..." }` after an element or relation               | second text line of a box; description of a relation                                          |
| `{ assumption "why" }` after a relation                            | an inferred relation, drawn dashed and muted until someone confirms it                        |
| `{ class a, b }` after an element, group or relation               | apply classes                                                                                 |
| `{ port in west 30% }` after an element                            | a named port on a side, at a percentage along it (50 % by default)                            |
| `placement { ... }`                                                | positions, sizes, routes, label anchors (below)                                               |
| `style <t>[, <t>...] { ... }`                                      | visual properties for elements or named relations                                             |
| `animate <t>[, <t>...] { ... }`                                    | motion effects: flow particles, a moving dash, a pulse, a trace (below)                       |

Elements and relations share one namespace per diagram. Anonymous relations get the key
`<from>-><to>#<n>` in tools and JSON; name a relation (`as id`) before routing or styling it.

## Placement

```text
placement {
  place api at (360, 180)                                  // centre of the box
  size api (200, 56)                                       // width, height
  route create from api.east to orders.west via [(520, 180)]
  label create at 50% offset (0, -16)                      // position of the relation label
  row api, orders                                          // constraints: align, row, column,
  distance orders, db 80                                   // order and distance
}
```

Ports: `north`, `south`, `east`, `west`, `auto` (`from api` means `api.auto`) and the ports an
element declares with `port`; an undeclared name is `placement.unknown-port`. A route's endpoints
must be the relation's source and target, in that order. Each element has at most one `place` and
one `size`; each relation at most one `route` and one `label`. Several `placement` blocks may
exist; order does not matter.

## Styles

```text
style api, db { fill "#ebe5fd"; stroke "#6a4fd0"; color "#33247a" }
style obo, ciba, proxy { line dashed }
style r1, r2 { fill "#0B1830"; color "#FFFFFF" }      // dark label pills
style legendBox { fill "none" }
```

| Property        | Element                                                                        | Relation                                   |
| --------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| `fill`          | background (`"none"` for no fill)                                              | label pill background                      |
| `stroke`        | outline colour                                                                 | connector and arrowhead colour             |
| `color`         | label and description text                                                     | label pill text                            |
| `line`          | `solid`, `dashed` or `dotted` outline                                          | overrides the arrow style                  |
| `width`         | outline width (0 to 64; a pen's stroke 1 to 64)                                | connector width                            |
| `radius`        | corner radius (0 to 64) of boxes, groups                                       | not allowed                                |
| `shape`         | `node` only: `hexagon`, `icon`… (free.md)                                      | not allowed                                |
| `pattern`       | `hatch`, `dots`, `cross` or `none`                                             | not allowed                                |
| `arrowhead`     | not allowed                                                                    | head at the target (below)                 |
| `arrowtail`     | not allowed                                                                    | head at the source (below)                 |
| `routing`       | not allowed                                                                    | `auto`, `orthogonal`, `polyline`, `bezier` |
| `corners`       | not allowed                                                                    | `sharp` or `rounded` bends                 |
| `class`         | apply classes                                                                  | apply classes                              |
| `icon`          | `"pack:name"`, placed by `iconPosition`                                        | inside the label pill                      |
| `iconColor`     | colour of a monochrome icon                                                    | same                                       |
| `iconPosition`  | `left`, `right`, `top`, `bottom`, `center`                                     | not allowed                                |
| `labelPosition` | label edge of a centred icon or `shape icon`: `top`, `bottom`, `left`, `right` | not allowed                                |
| `iconSize`      | `auto` or 8 to 128: the icon's side                                            | not allowed                                |

Colours are quoted (`"#6a4fd0"`) or colour token names that follow the theme (`danger`, `accent`,
`muted`, `success`, `warning`, `info`, …).

Heads (`arrowhead` at the target, `arrowtail` at the source): `triangle`, `open`, `none`,
`triangleOutline` (UML generalisation), `diamond` and `diamondOutline` (composition and
aggregation), `circle`, `circleOutline`, `bar`, `cross`, and the ER crow's feet `many`,
`oneOrMany`, `onlyOne`, `zeroOrOne`, `zeroOrMany`. A relation has no start head unless it is
written `<->`/`<-->` (the end's head at both ends) or has `arrowtail`. A line `--` (dashed `---`)
has no head at either end unless `arrowhead` or `arrowtail` is written; write it for an
association, a link to a note or a plain connection, instead of `arrowhead none`:

```text
customer -> order as places
style places { arrowtail onlyOne; arrowhead zeroOrMany }   // one customer places zero or more orders
api <-> cache                                              // two-way
api -- db                                                  // a line, no heads
note1 --- api                                              // a dashed line, no heads
style slow { line dotted; corners rounded }                // dotted, rounded bends
```

The six tokens are `->`, `-->`, `--`, `---`, `<->`, `<-->`; `--->` is a syntax error. Sequence
diagrams take the four arrows and C4 views `->` and `-->`: another token is `prop.invalid-value`.

Setting the same property twice for a target across statements is `prop.duplicate`; different
properties in different statements are fine.

## Animate

```text
animate r1, r2 { effect flow; particles 2 }          // particles along named relations
animate save { effect dash; direction reverse }      // a dash moving along a line or outline
animate db { effect pulse; duration 1500ms; repeat 3; delay 300ms; color accent }
animate r1 { effect trace }                           // a highlight that fills the relation, then restarts
```

`effect` is required. `duration` 100 ms to 60 s (the theme's `flowDuration`, `dashDuration`,
`pulseDuration` or `traceDuration`, else 1200 ms for flow, 1500 ms for trace and 1 s otherwise),
`repeat` `forever` (default) or 1 to 1000, `delay`, `direction forward|reverse` (flow, dash and
trace), `particles 1..8` (flow), `color` (flow, pulse and trace; a trace defaults to `accent`).
Flow and trace run on relations (and free lines and pens) only; dash on relations, free lines,
pens, boxes with an outline and notes or texts that style an outline (`fill`, `stroke` or
`pattern`); pulse on elements, relations, notes and fragments. One effect of each kind per target
(`animate.conflict`). Exports are static unless you ask:
`pnpm mdg export sheet.meltemi --motion animated` writes an animated SVG (CSS keyframes, static
fallback), `--at 1.5s` the frame at that time. Use the static export for documents and slides.

## Stories

`story <id> for <diagram> { scene ... }` walks through a diagram: `reveal`, `hide`, `highlight`,
`focus`, `camera`, `trace`, `draw` (pens, lines and relations drawn again) and `hold` on one
clock, `parallel` blocks, and `view` with a `transition` to change diagram.
`pnpm mdg export sheet.meltemi --story <id> --at 2s` writes a frame. See [stories.md](stories.md).

## Export profiles and links

```text
export slide for checkout {
  format png              // svg, png, pdf, html (player), mp4, webm, gif
  scale 2                 // png pixels per unit
  size (1920, 1080)       // png, pdf, video: fitted and centred
  background transparent  // or a quoted colour or a token
  file "slides/checkout.png"
}
```

Plugins installed in `project.json` may declare diagram types (`diagram s: erd { entity a "A" }`):
their kinds are boxes with the type's style and properties; `pnpm mdg plugins <project>` lists them.
`pnpm mdg convert <file> --to json` writes the file's model JSON for other tools.
`pnpm mdg init <folder> --template flow|c4|sequence|free|purchase` starts a project;
`pnpm mdg preview <project>` serves its catalog and reloads it as files change;
`pnpm mdg review <project> --base main` lists what changed by id (renames included).
`pnpm mdg build catalog <project>` writes one offline HTML catalog of the project (settings in
`project.json` `catalog`; comments and source stay out unless `--source`). In the catalog and in
`--format html` pages, a double click (or the plus sign) on a system opens its container view, on
a container its component view, on an element with `link` the diagram it names: write those
views (`level` + `scope`) and links so readers can drill down; descriptions show on hover.
`pnpm mdg export sheet.meltemi --profiles` writes every profile; `--profile slide` one.
`--format mp4|webm|gif` records a story (`--story`) or effects with the installed browser and
FFmpeg: 1080p at 30 fps, GIF 960 × 540 at 15 fps. Effects that repeat forever last one loop of their
cycles (6 s with the defaults) unless `--duration` or a profile's `duration` says otherwise, and the
export notes the length it chose; a transparent MP4 takes the theme's background. Options of
another format are `export.invalid-option`. Elements, groups and model entities take
`url "https://…"`: SVG, PDF and HTML exports keep the link.
`pnpm mdg login`, `push`, `pull`, `publish` and `projects` keep a project in step with its copy in
the optional cloud service, which `project.json` records in `cloud`, and
`pnpm mdg review <project> --base cloud` compares with it; run them only when asked (see SKILL.md).

## Diagnostics and fixes

| Code                                                             | Cause and fix                                                                                                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `syntax.expected-token`, `syntax.unexpected-token`               | malformed statement; check quotes, `->`, parentheses, one statement per line                                                                        |
| `syntax.unterminated-string`                                     | a string reached the end of the line; close it, use `\n` for line breaks                                                                            |
| `syntax.unexpected-character`                                    | characters such as `=>`, `--->` or `#` outside strings; the relation tokens are `->`, `-->`, `--`, `---`, `<->`, `<-->`                             |
| `ref.duplicate-id`                                               | the id is already an element, relation or top-level block; rename one                                                                               |
| `ref.unknown-element`                                            | target of `place`, `size`, `style` or a qualified endpoint does not exist; declare it                                                               |
| `ref.unknown-relation`                                           | `route`/`label` on an unnamed relation; add `as <id>`                                                                                               |
| `placement.route-mismatch`                                       | `route` endpoints are reversed or wrong; use the relation's source then target                                                                      |
| `placement.duplicate`                                            | second `place`/`size` for an element or `route`/`label` for a relation; delete one                                                                  |
| `placement.unknown-port`                                         | the route names a port the element does not declare; the hint lists its ports                                                                       |
| `prop.unknown`                                                   | unknown word; the hint lists what the block accepts                                                                                                 |
| `prop.invalid-value`                                             | wrong value shape; the message names the expected form; `shape` only on `node` and `box`; a relation token the profile refuses (`--` in a sequence) |
| `prop.duplicate`                                                 | property set twice for the same target; keep one                                                                                                    |
| `layout.missing-placement`                                       | manual layout and an element without `place`, or a group with only one of `place`/`size`                                                            |
| `layout.mode-unsupported`                                        | a host without a layout engine met unplaced boxes; the command line always has ELK                                                                  |
| `layout.placement-ignored`                                       | `place` or waypoints in `layout auto`; write `layout assisted` or `manual`                                                                          |
| `layout.constraint-conflict`                                     | placed boxes break a constraint; move a `place` or change the constraint                                                                            |
| `layout.overlap`                                                 | two boxes overlap, or a box crosses a group edge; move it or add `distance`; a stack goes outer first                                               |
| `layout.label-under-connector`                                   | a label sits on another arrow; move it with `label r at <n>% offset (dx, dy)`                                                                       |
| `layout.container-margin`                                        | a box touches the edge or title band of its sized group; enlarge the group or move it                                                               |
| `layout.connector-overlap`                                       | two arrows run along each other; use other ports, a waypoint or `routing bezier`                                                                    |
| `layout.connector-crossing`                                      | an arrow runs through a box it does not join; move the box or add a waypoint                                                                        |
| `layout.unknown-theme`                                           | theme name is neither built in nor in the file; warning, renders with the default                                                                   |
| `theme.unknown-base`, `theme.cycle`                              | `extends` names a missing theme or loops; point it at a built-in theme                                                                              |
| `theme.unknown-class`                                            | a class is not in the diagram, its theme or the built-in ones; declare it or fix the name                                                           |
| `asset.unknown-icon`, `asset.unknown-pack`                       | the icon name or pack does not exist; search with `pnpm mdg assets icons <words>`                                                                   |
| `layout.too-large`                                               | the sheet exceeds its `preset` or `canvas`; split it into views instead of shrinking, or write `preset board` for a whiteboard                      |
| `layout.text-overflow`                                           | an explicit `size` is too narrow for its text; use the width in the hint                                                                            |
| `layout.unmeasured-font`                                         | a theme's or a style's `font` names no bundled or project family, or characters no font has: name a bundled family                                  |
| `layout.icon-missing`                                            | `shape icon` without an `icon`: a dashed placeholder is drawn; add the icon or change the shape                                                     |
| `layout.label-position-ignored`                                  | `labelPosition` without `iconPosition center` or `shape icon`; add one of them or remove it                                                         |
| `animate.missing-effect`, `animate.invalid-target`               | write `effect`; flow and trace on named relations, free lines and pens, dash on lines, pens and boxes, pulse anywhere                               |
| `animate.conflict`                                               | one effect of each kind per target; merge the two statements                                                                                        |
| `story.*`                                                        | stories; see [stories.md](stories.md)                                                                                                               |
| `export.*`                                                       | export profiles: a known target, a `format`, options of that format, a video `duration`                                                             |
| `ref.unknown-link`                                               | a `link` names a diagram or element that does not exist; fix it or remove the link                                                                  |
| `ref.unknown-layer`, `asset.*-image`, `layout.image-unavailable` | free compositions; see [free.md](free.md)                                                                                                           |
| `export.no-diagram`                                              | no flow or free diagram in the file                                                                                                                 |
