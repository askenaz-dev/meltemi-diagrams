## Context

- `export` blocks parse as `ExportBlock` (`export <id> for <ref> { … }`) and are reported as
  `block.unsupported`; their vocabulary was `format`, `size`, `fps`, `duration`, `background`.
- The renderer writes SVG with embedded, outlined or system fonts; `export --at` draws effects or a
  story at an instant; HTML players exist (change 15).
- Edge and Chrome are installed; the approved plan renders PNG and PDF by driving the installed
  browser (Playwright and Chromium are the proposal's candidates).

## Goals / Non-Goals

**Goals:** profiles that describe every delivery; PNG with resolution and transparency; vector PDF
with fonts, text and links at the picture's size; the same results from the CLI and the editor.

**Non-Goals:** video and GIF encoding (change 17; their profile options are compiled now).

## Decisions

### D1. Profiles

```text
export slide for checkout {
  format png
  scale 2                 // png: pixels per unit, 1 to 8 (2 by default)
  size (1920, 1080)       // png, pdf, video: the output, the picture fitted and centred
  background transparent  // or a colour or token; the theme's background by default
  at 1.5s                 // svg, png, pdf: an instant of the effects or the story
  link "https://example.com/purchase.html"  // svg, pdf: the whole picture links there
  file "slides/checkout.png"                // relative to the source, inside its folder tree
}
```

| Option       | Formats                      | Values                                                     |
| ------------ | ---------------------------- | ---------------------------------------------------------- |
| `format`     | all                          | `svg`, `png`, `pdf`, `html`, `mp4`, `webm`, `gif`; required |
| `size`       | png, pdf, mp4, webm, gif     | `(w, h)`, 16 to 16384                                      |
| `scale`      | png                          | 1 to 8                                                     |
| `background` | svg, png, pdf, webm, gif     | `transparent`, a quoted colour or a colour token           |
| `at`         | svg, png, pdf                | a time; without it, the static view (diagrams) or the end (stories) |
| `motion`     | svg                          | `static` or `animated` (diagrams only)                     |
| `theme`      | all                          | a theme name                                               |
| `fonts`      | svg, html                    | `embedded`, `outlined`, `system`                           |
| `scenario`   | all, sequence diagrams       | a scenario id                                              |
| `link`       | svg, pdf                     | an `http:`, `https:` or `mailto:` URL                      |
| `fps`        | mp4, webm, gif               | 1 to 60 (30 by default)                                    |
| `duration`   | mp4, webm, gif               | a time; required for effects that repeat forever           |
| `file`       | all                          | a relative path without `..`; `<stem>.<id>.<ext>` by default |

The target is a diagram or a story of the file, or an imported diagram. An option that does not
apply to the format, transparency in MP4, `motion animated` on a story, `scenario` on a diagram
without it, are `export.invalid-option`. `block.unsupported` is gone.

### D2. Links

`url "https://…"` on elements (every profile) and model entities; the layout copies it to the
element's group as `href`, the renderer wraps the group's drawing in `<a href>` and Chromium keeps
it as a PDF link annotation. Only `http:`, `https:` and `mailto:` are accepted
(`prop.invalid-value` otherwise). A profile's `link` wraps the whole picture.

### D3. Capture

`@meltemi/diagrams-capture` holds a small DevTools-protocol client written in JavaScript modules
(so a plain `node` can run it): it starts the browser headless with `--remote-debugging-pipe`,
opens a page with the SVG in a document whose page size is the picture's, waits for
`document.fonts.ready` and decoded images, then calls `Page.captureScreenshot` (with the device
scale factor and, for transparency, a transparent default background) or `Page.printToPDF`
(`preferCSSPageSize`, no margins, backgrounds printed). Jobs are batched in one browser session.
`capture(jobs)` is asynchronous (the editor); `captureSync(jobs)` runs the same code in a child
`node` process for the synchronous CLI. `findBrowser()` checks `MELTEMI_BROWSER`, then the usual
Edge, Chrome and Chromium locations; without one, PNG and PDF exports fail with a clear message.

### D4. CLI and editor

`export --format png|pdf` writes `<stem>.png`/`.pdf` (with `--scale`, `--size WxH`,
`--background`, `--link`, `--at`, `--theme`, `--scenario`, `--story`). `--profile <id>` runs one
profile and `--profiles` all of them; other output options are then refused. VS Code adds **Export
PNG**, **Export PDF** (asking which diagram) and **Run Export Profile** (asking which profile),
using the same capture code asynchronously.

## Risks / Trade-offs

- [A browser is required] → PNG and PDF say how to point at one; SVG and HTML need none.
- [Browser versions differ] → the proposal fixes reproducibility within a pinned environment;
  results record the browser version in the export's log line.
