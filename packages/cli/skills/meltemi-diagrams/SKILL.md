---
name: meltemi-diagrams
description: Create, edit, convert and export architecture diagrams as code in the Meltemi language (.meltemi files) - flow sheets with groups, plain nested containers, data stores, decisions, notes, tags, boxes in twenty-four shapes (AI agents, persons and provider icons drawn as the shape among them) with corner radii and icons on any side or at the centre, automatic (ELK), assisted or manual layout, ports, constraints, styles, themes, and SVG, PNG, PDF and HTML-player exports with repeatable export profiles, free compositions (slides with boxes, text, icons, images, layers and links to flow views), sequence diagrams (participants, calls, replies, activations, notes, alt/opt/loop/par fragments and exportable scenarios), C4 architecture models with context, container and component views, motion effects, and stories that walk through a diagram scene by scene (reveal, highlight, focus, camera, trace, transitions between views). Use when asked to draw or document a system or software architecture, convert an existing diagram (HTML, SVG, Mermaid, PlantUML, draw.io, a screenshot) into code, or change a .meltemi file.
---

# Meltemi Diagrams

Diagrams as code for the Meltemi family. A sheet is a `.meltemi` text file; the `meltemi-diagrams` command
compiles it, validates it and exports SVG. The text is the source of truth: when a `.meltemi` file
can produce the image, never draw the image by hand and never edit the exported SVG.

## Workflow

1. Collect the pieces from the request or the source material: elements (boxes, data stores,
   decisions), bands (groups), arrows with their labels, annotations (notes, tags), what is
   proposed versus in use, and the numbered steps of the main path. Choose the profile: `flow` for
   an architecture or process that ELK can arrange, `free` for a slide or a hand-composed picture
   with headings, icons and images ([reference/free.md](reference/free.md)), `sequence` for an
   interaction over time between participants ([reference/sequence.md](reference/sequence.md)),
   a `model` with `c4` views for a C4 architecture (context, containers, components) shared by
   several pictures ([reference/c4.md](reference/c4.md)).
   To walk an audience through a diagram, add a `story` after it
   ([reference/stories.md](reference/stories.md)).
   A Mermaid or PlantUML source is imported, never retyped: `pnpm mdg import source.mmd` writes
   `source.meltemi` and reports what it approximated or dropped
   ([reference/converting.md](reference/converting.md)).
   A flow sheet becomes a slide with `pnpm mdg convert sheet.meltemi --to free`. Sequence
   diagrams have no layout modes or positions: skip step 2's layout choice and write the events in
   order.
2. Write the file from the template below. Pick the layout mode:
   - `layout auto` (the default) for a new sheet: write no positions; ELK arranges the boxes in the
     `direction` (`LR`, `TB`, ...). Add constraints such as `row a, b` when you need alignment.
   - `layout assisted` to pin some boxes with `place` and let ELK arrange the rest around them.
   - `layout manual` when converting a picture or matching an original exactly: give every element
     a `place`, and a `size` to any box whose width matters.

   `pnpm mdg layout path/to/sheet.meltemi` writes ELK's positions into the file as `place`
   statements (and turns `auto` into `assisted`) when you want to fine-tune them by hand. Keep the
   labels in the language of the source.
   For icons, find names with `pnpm mdg assets icons <words>` (for example `database`) and set
   them with `style <id> { icon "tabler:database" }`; never invent an icon name. The icon goes
   beside the text by default; `iconPosition right|top|bottom|center` moves it (`center` makes it
   the picture of the box) and `iconSize 32` (8 to 128, or `auto`) sizes it. Architecture icons
   with their label below, as provider diagrams draw them, are `shape icon`:
   `style fn { icon "aws:lambda"; shape icon }` ([reference/free.md](reference/free.md)).

3. Validate: `pnpm mdg validate path/to/sheet.meltemi` (from the repository root). Fix every
   diagnostic; each code is explained in [reference/language.md](reference/language.md).
4. Export: `pnpm mdg export path/to/sheet.meltemi` writes `sheet.svg` beside the source.
   `--stdout` prints it, `--theme editorial.light` gives a neutral sheet without the brand frame
   and `--theme stage.light` a presentation sheet. `--format png` (with `--scale`, `--size 1920x1080`,
   `--background transparent`) and `--format pdf` use the installed Edge or Chrome; an `export`
   block in the file makes a delivery repeatable with `--profile <id>` or `--profiles`
   ([reference/language.md](reference/language.md)).
5. Review the SVG in a browser (`pnpm preview` serves the repository at `http://localhost:4173`).
   Check: no overlapping boxes, text fits its box, arrows leave and enter the intended sides,
   labels are readable, a legend exists when colours carry meaning. The export prints composition
   warnings (`layout.overlap`, `layout.label-under-connector`, `layout.container-margin`,
   `layout.connector-overlap`); fix every one.
6. Iterate with small edits. Keep ids stable and keep the author's comments. Finish with
   `pnpm mdg format path/to/sheet.meltemi` so the file has the canonical layout.

People who prefer a visual tool open the same file in VS Code with the Meltemi Diagrams extension
(`docs/editor.md`). It shows a canvas beside the code, and each drag, resize or inspector change is
a small edit of the text. A sheet you write stays editable there, and their changes come back as
ordinary text edits that you can review.

## Template

```text
language "0.2"

diagram checkout: flow {
  title "Checkout"
  description "One sentence that becomes the <desc> of the SVG."
  layout manual

  group backend "Backend" {
    api["Order API"] { description "REST · validates input" }
    data orders "Orders DB" { description "PostgreSQL" }
  }
  client["Client app"] { description "web & mobile" }
  tag jwt "JWT"
  note limits "Limits to confirm\n500 rps per tenant"

  client -> api: "1" as request
  api -> orders: "2" as persist

  placement {
    place client at (120, 60); size client (160, 56)
    place api at (420, 60); size api (200, 56)
    place orders at (420, 200)
    place jwt at (500, 32)
    place limits at (700, 60)
    label request at 50% offset (0, -16)
    label persist at 50% offset (16, 0)
  }

  style request, persist { fill "#0B1830"; color "#FFFFFF" }
}
```

## Rules that save iterations

- Ids match `[A-Za-z_][A-Za-z0-9_]*` and are unique per diagram across elements and relations.
  Labels carry the human text (`\n` breaks a label into lines); `description` is the smaller text
  under the label, inside the box.
- Name every relation you need to route, position a label on, or style: `a -> b: "text" as id`.
- `place` is the centre of the box in pixels; y grows downwards. Groups fit their children unless
  you give them both `place` and `size`.
- Default sizes: `node` 160 x 56, `decision` 160 x 80, `data` 160 x 64, widened automatically to
  fit their text; a `shape` has its own default size ([reference/free.md](reference/free.md));
  tags and notes size themselves from their text. Use `size` only to make boxes larger or equal;
  if `layout.text-overflow` appears, use the width its hint gives.
- Shapes go on flow nodes and free boxes: `style api { shape hexagon }`, one of `rounded`,
  `rectangle`, `square`, `ellipse`, `circle`, `diamond`, `cylinder`, `pill`, `triangle`,
  `parallelogram`, `trapezoid`, `pentagon`, `hexagon`, `octagon`, `star`, `cloud`, `document`,
  `callout`, `arrow`, `framed`, `flag`, `person`, `agent` (an AI agent: a robot head over a body
  that holds the text), `icon` (the element drawn as its `icon` alone, 64 x 64, with the label
  outside at `labelPosition`, `bottom` by default). Decisions, data stores, notes, tags and groups
  draw their own shape and refuse it, and so do free texts, icons and images. Text stays inside
  the shape and arrows end on its outline (on the icon's square for `shape icon`). `radius <n>`
  (0 to 64) sets the corner radius of a node, box, decision, note or group, and rounds every
  shape with corners: `rectangle` and `square` (square by default), the polygons' vertices (sharp
  by default: `style h { shape hexagon; radius 10 }`); `radius 0` squares a rounded box,
  `rule group { radius 0 }` squares every group. Circles, ellipses, pills, cylinders, clouds and
  documents ignore it.
- `rotation <degrees>` (0 to 360, clockwise) turns an element of a flow or free diagram about the
  centre of its box, text and icon included (`style label { rotation 270 }` for text up a side);
  `place` and `size` stay those of the unturned box, and arrows meet the turned outline. Groups,
  sequence diagrams and C4 views refuse it.
- Nested plain rectangles (a visual editor's containers) are untitled groups: `group g "" { ... }`
  with `style g { fill "#dae8fc"; stroke "#6c8ebf"; radius 0 }`. They draw no title and reserve no
  title band: their interior starts 16 px below the top edge instead of 40 px. A box meant to hold
  others is such a group, never a `node` or `box` with boxes stacked on it: a stack is only drawn
  on top, so the engine separates it and moving the outer box leaves the inner ones behind. A
  group's `size` is the least the engine gives it in `layout auto`, its children centred.
- Boxes stacked on purpose, each strictly inside the one before, are declared outer first; give
  the outer boxes empty labels (`box outer ""`) or labels away from the inner ones
  (`textAlign left`, a separate `text`). A stack declared inner first, or two boxes of the same
  size at the same place, is `layout.overlap`.
- A band behind boxes is an untitled group with `place`, `size` and `layer back` (with
  `layers back, main`); boxes and groups on different layers are not checked against each other,
  and the engine arranges boxes over the band, in `layout assisted` and, at the top level, in
  `layout auto`.
- Arrows need no `route`: facing sides meet at the centre of their overlap, so boxes aligned in a
  column get straight vertical arrows. Add `route id from a.east to b.north via [(x, y)]` only for
  a bend.
- `place` is ignored in `layout auto` (`layout.placement-ignored`): write `layout manual` or
  `layout assisted` whenever a sheet has positions.
- A box with named ports (`bus["Bus"] { port in west 30% }`) is entered at that exact point with
  `route r from a.east to bus.in`. `routing orthogonal|polyline|bezier` changes the connector
  shape for the diagram or, in a `style`, for one relation.
- Dashed means proposed: one statement, `style a, b, c { line dashed }`.
- Numbered steps are relation labels `"1"`, `"2"` with `label r1 at 50% offset (16, 0)` and a
  dark style; the narrative goes in comments next to the relations.
- A legend is a row of `tag` elements under the sheet with the category colours, plus a dashed
  white tag for "proposed".
- One diagram per file unless they share a model; the SVG is named after the file.
- In `free` diagrams, a child's `place` is relative to its group's interior, every group has a
  `place`, and the paint order is the source order within each layer: declare on-top objects last
  or give them `layer front` (with `layers main, front`).

## When the result looks wrong

| Symptom                                          | Fix                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `layout.missing-placement`                       | add `place <id> at (x, y)`; groups need `place` and `size` together or neither   |
| `layout.placement-ignored`                       | the sheet has positions but no `layout`: add `layout manual` or `assisted`       |
| `layout.constraint-conflict`                     | two placed boxes cannot satisfy the constraint; move one or drop the constraint  |
| `layout.overlap` after `auto` or `assisted`      | add `distance a, b 40` or pin one box with `place`                               |
| `layout.overlap` on boxes stacked on purpose     | declaration order: declare the outer box before the boxes inside it              |
| `layout.label-overlap` on a stack                | the stacked labels coincide; leave the outer labels empty or move them           |
| `prop.invalid-value` on `shape`                  | only `node` and `box` take `shape`; a decision is already a diamond              |
| `layout.icon-missing`, a dashed square           | `shape icon` needs an `icon` style on the element (or a rule or class)           |
| `layout.label-position-ignored`                  | `labelPosition` needs `iconPosition center` or `shape icon`; remove it otherwise |
| a band pushes boxes or warns                     | make it an untitled group with `place`, `size` and `layer back`                  |
| `ref.unknown-relation` on `route`/`label`        | the relation is anonymous: add `as <id>` to it                                   |
| `prop.duplicate` in a style                      | the property is already set for that target in an earlier `style`                |
| arrow crosses a box                              | add a waypoint with `route ... via [(x, y)]` or move the box                     |
| text wider than its box                          | add `size <id> (w, h)` or shorten the description                                |
| diagonal arrow where a straight one was expected | the two boxes do not overlap on that axis; align them or use a waypoint          |

## Sharing in the cloud (only when the person asks)

A project can mirror itself in the optional Meltemi cloud service, to open it in the browser, share
it or publish its catalog as a web page. These commands need a signed-in person and change things
outside the repository, so run them only when asked, and never add `--force` unasked.

- `pnpm mdg login` opens the person's browser to approve the request (`--no-browser` prints the
  address); `logout` revokes the token and `whoami` says who it is for. In CI the token is
  `MELTEMI_TOKEN`. Exit code 3 means "run `login`".
- `pnpm mdg push <folder> --create` makes the cloud project and records it in `project.json`
  (`cloud`). Later `push <folder>` lists what differs by path and by id and asks. `push --check`
  writes nothing and exits 1 when the cloud differs, so it is safe to run.
- `pnpm mdg pull [<id>] [folder]` brings the cloud's files into the folder (files that differ are
  kept unless `--force`); `pnpm mdg review <folder> --base cloud` lists what differs by id.
- `pnpm mdg publish <folder> --slug name` makes the catalog a public web page, so only on request;
  `--unpublish` takes it down. `pnpm mdg projects --json` lists the person's cloud projects.

Never print, read or copy a token (`mdg_…`): it lives in `MELTEMI_TOKEN` or in the credentials file
that `login` keeps, and belongs in no command line, file or commit. `docs/cli.md` has the details.

## Reference

- [reference/language.md](reference/language.md): grammar, vocabulary, diagnostics and fixes.
- [reference/layout.md](reference/layout.md): layout modes, constraints, ports, coordinates, sizes,
  anchors, routes, groups, frame.
- [reference/themes.md](reference/themes.md): built-in themes, theme blocks, the brand frame.
- [reference/converting.md](reference/converting.md): importing Mermaid and PlantUML, turning any
  other diagram or a screenshot into a sheet, with the checks that prove the conversion.
- [reference/free.md](reference/free.md): free compositions, the twenty-four shapes, icons in
  boxes and as shapes, interior coordinates, plain containers, stacks and bands, layers, links,
  images and the conversion from flow.
- [reference/sequence.md](reference/sequence.md): sequence diagrams, fragments, scenarios,
  spacing, their diagnostics and the mapping from Mermaid and PlantUML.
- [reference/c4.md](reference/c4.md): models, C4 views, levels and scopes, lifted and combined
  relations, local labels, imported models and their diagnostics.
- [reference/stories.md](reference/stories.md): stories, scenes, actions, transitions, timing,
  their diagnostics and frame exports.
- [examples/platform.meltemi](examples/platform.meltemi): a complete sheet using every construct.
- [examples/slide.meltemi](examples/slide.meltemi): a flow view and a free slide linked to it.
- [examples/sequence.meltemi](examples/sequence.meltemi): a payment sequence with a group, an
  alternative, a loop, a note, an async message and two scenarios.
- [examples/architecture.meltemi](examples/architecture.meltemi): a model with a context, a
  container and a component view.
- [examples/story.meltemi](examples/story.meltemi): a checkout flow and the story of a purchase.
