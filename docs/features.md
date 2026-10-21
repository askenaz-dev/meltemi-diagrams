# Features

[Español](es/features.md)

Everything Meltemi Diagrams 1.0 does, by area. The [getting started](getting-started.md) guide
walks through the common path, and the [documentation index](README.md) lists every reference.

- `.meltemi` grammar 0.2 with a lossless parser and stable diagnostics.
- A typed model and validation for `flow`, `free`, `sequence` and `c4` diagrams and architecture
  models, with JSON interchange.
- Structured source edits (move, resize, route, label, rename, remove) that change only the
  affected tokens and keep comments and formatting.
- Projects: `project.json`, relative imports with namespaces, themes shared between files, a
  project-wide default theme and validation ([projects](language/projects.md)).
- Themes and styles: six built-in themes (Technical, Editorial and Stage, light and dark), custom
  themes that extend them, a complete token set (the default speed of effects included), reusable
  classes, kind rules, patterns, fifteen arrow heads at either end and two-way arrows, dotted
  lines, rounded corners, and document and slide presets
  ([styles](language/styles.md)); on the canvas, a style strip of the theme's colour tokens, a
  colour picker and the theme panel, which creates a theme in the file or for the project and
  edits its tokens.
- Icons and assets: the built-in Tabler pack, project Iconify and SVG packs with licences, project
  fonts, `assets.lock.json` and `meltemi-diagrams assets` ([assets](language/assets.md)); icons
  beside, above, below or at the centre of a box, sized per element, or drawn as the shape itself
  with the label outside ([styles](language/styles.md#icons-in-boxes)).
- Layout: automatic and assisted layout with ELK, named ports, alignment and order constraints,
  orthogonal, straight and curved connectors, parallel lanes, composition checks and
  `meltemi-diagrams layout` to write positions down ([layout](language/layout.md)).
- `meltemi-diagrams validate` and `meltemi-diagrams export`: diagnostics for files and projects, and
  SVG export of every compiled profile: `flow` diagrams with notes, tags, data cylinders, decision
  diamonds, group bands and step labels, free compositions, sequence diagrams and C4 views.
- Free compositions ([free](language/free.md)): boxes in twenty-four shapes that connectors meet
  and text fits (flow nodes take them too), corner radii, plain containers and stacks, measured
  text, icons and project images, groups placed by their interiors, layers, identity links to
  other diagrams, and `meltemi-diagrams convert --to free`, which copies a flow diagram as drawn
  into a free one.
- Sequence diagrams ([sequence](language/sequence.md)): eight participant kinds and participant boxes,
  calls, replies, async messages and self-calls, activations, creation and destruction, notes,
  every fragment (`alt`, `opt`, `loop`, `par`, `break`, `critical`, `region`), dividers, delays,
  numbering, order-checked rules, a deterministic layout, and scenarios exported with
  `meltemi-diagrams export --scenario`.
- Models and C4 views ([c4](language/c4.md)): persons, systems, containers, datastores and
  components in one shared model; context, container and component views validated by level and
  scope; relations lifted to the drawn ancestors with traceability and combined only explicitly;
  local labels; views of imported models; links from sequence and free objects; renames that
  reach every view.
- Motion effects ([motion](language/motion.md)): flow particles along relations, moving dashes and
  pulses, on a deterministic clock; `meltemi-diagrams export --motion animated` writes an animated
  SVG with a static fallback, and `--at <time>` the frame at any instant; effects are edited in the
  inspector and previewed on the canvas.
- Stories ([stories](language/stories.md)): scenes that reveal, hide, highlight, focus, frame with a
  camera and trace relations on the same clock, in sequence or in parallel, and change view with a
  cut, a fade or a morph; `meltemi-diagrams export --story <id> --at <time>` writes any frame, and
  the canvas plays a story with a timeline whose drags and **Add to scene** edit the text.
- The HTML player ([player](player.md)): `meltemi-diagrams export --format html` writes an offline
  page, or a fragment to embed, that plays a story or a diagram's effects with pause, progress,
  scenes, reduced motion, a static view, keyboard control and a text summary; every drawing zooms
  and pans, shows cards and a detail panel, and opens the container or component view of a box,
  or the diagram it links to, with a double click or its plus sign.
- PNG and PDF, and export profiles ([export](language/export.md)): `--format png|pdf` with a pixel
  scale, a fixed size and an optional transparent background, drawn by the installed Edge or
  Chrome; vector PDF pages with fonts, selectable text and links; `url` hyperlinks on elements and
  entities; `export` blocks that describe each delivery and run with `--profile` or `--profiles`.
- Video and GIF ([export](language/export.md)): `--format mp4|webm|gif` records a story or a diagram's
  effects frame by frame on the deterministic clock, 1080p at 30 fps by default, encoded by the
  system FFmpeg.
- The HTML catalog ([catalog](catalog.md)): `meltemi-diagrams build catalog` writes one offline page
  of a project's diagrams and stories by folder, with the player, search, links between diagrams
  and through the model's entities, drill-down from a view to the views it opens, SVG downloads,
  and only authorised metadata.
- The complete command line ([cli](cli.md)): `init` with templates, among them the reference
  purchase example; `preview` with live reload; `validate`, `format`, `import` and `export` of
  whole projects; `review` of what changed since a Git revision, by id, with renames told from
  removals and additions and pictures before and after; GitHub and GitLab CI workflows.
- Optional AI assistance ([assist](assist.md)): Anthropic or any OpenAI-compatible endpoint, local
  ones included; first structures, changes by instruction, probably missing relations marked as
  assumptions and explanations of reviews, as proposals of whole blocks you accept in part, checked
  against the project and reconciled with your edits; what is sent is shown first, and keys stay
  outside projects.
- Plugins and safety ([plugins](plugins.md), [security](security.md)): diagram types declared as data
  (kinds, properties, required values, allowed relations, layout, palette, shapes and styles) and
  icon packs, installed explicitly with a pinned version, granted permissions and declared
  compatibility; no code from a project ever runs; paths stay in the project, nothing is fetched,
  sizes are bounded, and errors never show secrets.
- Importers ([import](import/mermaid.md)): Mermaid `flowchart`, `sequenceDiagram`, `C4*`, `architecture-beta`
  and `block-beta`; PlantUML component, deployment, use case, sequence and C4-PlantUML diagrams,
  with the preprocessor; diagram blocks of Markdown files. Every construct is reported as mapped,
  approximated or dropped, the source is never changed, and re-importing keeps the placement,
  styles and other adjustments made since (`meltemi-diagrams import`, and three commands in VS
  Code).
- The playground ([playground](playground.md)): a static web page with the templates, the code with its
  language services beside the same canvas, one undo history, Mermaid and PlantUML import, every
  export (SVG, PNG, PDF by printing, the HTML player, GIF, WebM and MP4, profiles, the project
  archive, the model JSON and the catalog), share links and work kept in the browser; no account,
  and nothing leaves the page.
- Working together ([playground](playground.md#working-together), [cloud](cloud.md)): an optional
  account adds cloud projects that several people open at once. Everyone types without losing a
  character and each person's undo covers their own edits; the header shows who is here, and their
  carets and selections show in the code and on the canvas. Nothing of it is exported or saved.
- The editor for VS Code and its forks ([editor](editor.md)):
  - every language feature, from diagnostics and completion to rename, formatting and quick fixes;
  - a canvas beside the code with a 14 px grid, guides, zoom, pan, a minimap, a palette with a
    grid of shapes and a relation tool, an icon picker that searches every pack and library, shapes
    created empty and text typed where it is drawn, route editing, a style strip and an inspector,
    a theme panel, a clipboard, grouping, drag and drop into groups, alignment, full keyboard
    operation and short transitions that respect reduced motion;
  - every gesture is one small edit of the text.
- Quality: labels kept clear of shapes and other connectors and audited in
  every drawing, connectors that go around boxes, an acceptance corpus of the four profiles, pixel
  references, deterministic exports, performance targets on a reference machine and every export
  opened in Edge, Chrome and Firefox ([quality](quality.md)).
- Stability: the [language change policy](language/policy.md), a [conformance suite](language/conformance.md)
  that another implementation can run, one version for every package and a release check that
  installs the packed CLI and runs it ([releasing](../RELEASING.md)).
