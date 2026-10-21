## Why

The proposal's `export` block is a reproducible delivery profile: each profile describes format,
dimensions, resources, font treatment and animation behaviour, and exports must keep visual
identity and meaning. PNG serves documents and presentations with configurable resolution and
optional transparency; PDF serves sheets and documents with defined dimensions, checked fonts,
vectors and links; a slide may carry a frame and a link to the walkthrough when its destination
cannot play animation. Playwright and Chromium are the proposal's candidates for captures and PDF
printing. Today `export` blocks only parse (`block.unsupported`) and the CLI writes SVG and HTML.
Roadmap change 16 asks for export profiles and PNG and PDF output.

## What Changes

- **Export profiles.** `export <id> for <diagram-or-story> { … }` compiles into
  `Document.exports`: `format svg|png|pdf|html|mp4|webm|gif`, `size (w, h)`, `scale`,
  `background transparent|<colour>`, `at <time>`, `motion static|animated`, `theme`, `fonts`,
  `scenario`, `link`, `fps`, `duration` and `file`, each checked against the format. Diagnostics
  `export.unknown-target`, `export.missing-format`, `export.invalid-option` and
  `export.missing-duration` (a video of effects that repeat forever needs a duration).
  `block.unsupported` and the parse-only vocabulary disappear: every block of the language now
  compiles.
- **Links.** Elements and model entities take `url "https://…"` (also `http:` and `mailto:`); the
  SVG wraps them in `<a>`, and PDF and HTML keep the link. A profile's `link` makes the whole
  picture a link, such as a frame that leads to the story's player.
- **Capture.** New package `@meltemi/diagrams-capture` drives the installed Edge, Chrome or Chromium
  (found automatically or through `MELTEMI_BROWSER`) over the DevTools protocol through a pipe, with
  no download: PNG screenshots at a pixel scale, with an opaque or transparent background, and
  vector PDF printing with embedded fonts, selectable text and link annotations, on a page of the
  picture's size. It waits for fonts and images before capturing.
- **CLI.** `export --format png|pdf` with `--scale`, `--size WxH`, `--background` and `--link`;
  `export --profile <id>` runs one profile and `--profiles` every profile of the file; validate
  reports profile diagnostics.
- **Editor.** Completion, hover and outline for export profiles and `url`; VS Code commands **Export
  PNG**, **Export PDF** and **Run Export Profile**.
- **Docs.** `docs/language/export.md`, grammar, diagnostics, model JSON, svg-export, editor guide,
  README, skill reference, decision 0025.

## Capabilities

### New Capabilities

- `export-profiles`: the `export` block, its options per format and its diagnostics.
- `raster-and-print`: PNG and PDF captures through the installed browser.
- `links`: element and entity URLs and picture links in SVG, PDF and HTML.

### Modified Capabilities

None.

## Impact

- `Document.exports`; `block.unsupported` and `PARSE_ONLY_BLOCKS` are removed; the parse-only
  corpus goes away.
- Scene groups may carry `href`, the scene a `link`; the renderer writes `<a>` elements.
- New package `packages/capture` (no third-party dependency; a browser must be installed for PNG and
  PDF).
- The CLI accepts `png` and `pdf`; video formats compile in profiles and are written by change 17.
