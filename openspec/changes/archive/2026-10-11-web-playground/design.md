## Context

The libraries already compile, lay out, draw, edit, animate and export in any JavaScript host, and
the VS Code webview already runs the canvas in a browser engine. Three seams kept them out of a
plain web page:

- `@meltemi/diagrams-layout-elk` imported `node:fs` and `node:module` at load time;
- `ProjectSessions`, `produceExport`, `layoutIn` and `buildCatalog` lived in, or imported from,
  the Node entry of `@meltemi/diagrams-editor`, which pulls the capture worker and Git;
- the canvas application lived in the extension package.

The font library and the Tabler pack read files through synchronous readers; ELK runs through its
worker's synchronous dispatcher. A page can provide both, provided the files are there when read.

While checking what files a host must ship, the extension turned out to miss the Fontsource
`unicode.json` tables: without them the library finds no script subsets, so VS Code embedded no
fonts in exports and measured Cascadia Mono (which has no complete file) with Inter.

## Goals / Non-Goals

**Goals:**

- One static page that a person opens and uses at once: templates, visible code, the same canvas,
  the same exports, a share link; nothing to install, no account, no request to another origin.
- The same libraries and the same canvas as the CLI and the editor, with no fork of behaviour.
- A clear path to continue locally: the project downloads as a folder the CLI and VS Code open.

**Non-Goals:**

- Hosting: publishing the static site is an owner action, like the Marketplace (roadmap).
- AI assistance in the page: it would put a provider key in a web page and open the page's network
  policy to provider origins. AI stays in the CLI and the editor (decision 0029), and the first
  diagram works without it, as the proposal asks.
- Real-time collaboration (excluded from 1.0).

## Decisions

### A static site built with esbuild

`packages/playground/build.mjs` bundles `src/main.ts` as ES modules with code splitting, so the
ELK worker (1.6 MB) is a separate chunk fetched in parallel with the first paint. It writes
`dist/index.html`, the bundles, `playground.css`, `canvas.css` (from the canvas package),
`templates.json` (read from `packages/cli/templates`), `assets/fonts/…` (the files
`bundledFontFiles()` lists), `assets/tabler/…`, `assets/player.js` and `assets/catalog.js` (the
runtimes written into HTML exports), and `NOTICES.md` with the licence of every bundled component.
Any static server serves it; `pnpm preview` serves the repository for development.

The page's policy is a `<meta>` Content-Security-Policy: `default-src 'none'`, scripts, styles,
fonts, images and `connect-src` from `'self'` (plus `data:`/`blob:` images and fonts and inline
styles for drawn SVG), `frame-src 'self'` for the print frame, `base-uri 'none'`,
`form-action 'none'`. Nothing in the page can reach another origin, and the browser test fails on
any request outside the served origin.

### Projects in memory

A `MemoryHost` implements `ProjectHost` over a map of paths under `/playground`, text and bytes.
The browser-safe `ProjectSessions` (moved to `src/projects.ts` of the editor) compiles it with the
page's font reader, Tabler reader and ELK loader; the Node entry keeps a `ProjectSessions` that
fills the same options with the local file system and installed packages, so the CLI and the
extension are unchanged. Templates come from `templates.json` with the manifest
`templateManifest()` writes for `init`.

### Files read synchronously, fetched on demand

`LazyFiles` is a synchronous reader over a cache. A read of a file not yet fetched returns
`undefined`, records the path and starts fetching it from the page's origin; when the fetches
settle, the page analyses again. The library already degrades gracefully on a missing file
(estimated widths, no icon), so the first render is never blocked and the final one is exact.
Exports wait for every file they read (`settle` until no new path is missed) before they write.
At start the page fetches the complete Inter files and the Tabler outline data, which the
templates use, so most sessions never redraw.

### The same canvas, in the page

The canvas application moves to `@meltemi/diagrams-canvas` (`CanvasApp`, `CanvasHostApi`, the
DOM helpers, panels, story panel and `canvas.css`). VS Code's `main.ts` mounts it with
`acquireVsCodeApi`; the playground mounts it in its canvas pane with a host whose `post` hands the
message to a `CanvasSession` on the next task, as the webview's message channel would. The page
defines the `--vscode-*` colour variables the stylesheet reads, for light and dark.

The page plays the extension's role: it applies plans to the text, keeps the revision, answers
clipboard requests, opens the icon picker (Tabler search) and a file chooser for images (the
image joins the project's files), reveals ranges in the code pane, and turns `export` and
`exportPlayer` into its export dialog.

### Code pane

A `textarea` over a highlighted copy of the text (the overlay technique), with a gutter of line
numbers and diagnostic marks. Colours come from the lexer (`tokenize`: strings, numbers,
comments, arrows) and the services (`semanticTokens` for ids, `KEYWORD_DOCS` for keywords). The
services are the editor's: `completions`, `hover`, `codeActions`, `formatDocument`, `rename`,
`definition`, `selectionAt`. Keys: Ctrl+Space completion, Ctrl+. quick fixes, Shift+Alt+F
format, F2 rename, F12 definition, Tab and Shift+Tab indent, Enter keeps indentation. The
`textarea` keeps native caret, selection, input methods and screen-reader support.

### One history

Text changes from typing, the canvas, quick fixes, formatting, imports and renames go through one
`History` of text snapshots per file (typing coalesces within 700 ms or until a line break).
Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y anywhere in the page use it; the `textarea`'s native undo is
intercepted, so code and canvas undo as one document, as in VS Code.

### Exports in the browser (decision 0031)

`produceExport` (now host-neutral) makes the same requests and texts as the CLI. The page turns
its results into files:

| Result          | In the browser                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| text            | SVG, animated SVG, HTML player, as produced                                                                              |
| PNG capture job | the SVG drawn on a canvas at `scale`, transparent when asked, `toBlob("image/png")`                                       |
| PDF capture job | a print frame whose page is the picture's size (`@page { size; margin: 0 }`); the browser's "Save as PDF" keeps it vector |
| video job       | frames from `frameSvg(document, t)` at `i × 1000 / fps`, drawn on a canvas, then encoded                                  |

Video encoding uses what the browser has, never a download:

- **GIF**: an encoder written here: one palette of up to 256 colours by median cut over a
  histogram of every frame, ordered (Bayer 4 × 4) dithering as FFmpeg's default `paletteuse`, LZW,
  frames cropped to the rectangle that changed, delays in centiseconds with accumulated rounding,
  looping with the NETSCAPE 2.0 block.
- **WebM**: WebCodecs `VideoEncoder` with VP9 (VP8 when VP9 is unsupported) and a WebM writer
  written here (EBML header, segment info with duration, one video track, clusters of simple
  blocks, a keyframe each 2 s, cues).
- **MP4**: WebCodecs H.264 in AVC format and an MP4 writer written here (`ftyp`, `moov` before
  `mdat`, `avcC` from the encoder's description, `stts`, `stss`, `stsc`, `stsz`, `stco`), even
  dimensions as in the CLI.

When the browser has no suitable encoder, the format is disabled in the dialog with the reason and
the CLI command that makes it. Transparent video is refused in the page (WebCodecs alpha support
is partial); the CLI makes transparent WebM. The frames are the same as the CLI's, the encoders
differ, so files differ in bytes but not in content.

### Share links and kept work

`#p=<base64url(deflate-raw(JSON))>` carries `{ v: 1, open, files }` with the text files of the
project (images are not shared; the dialog says so). The fragment never reaches a server.
Reading caps the decompressed size at 4 MiB and the files at the project limits, and a link
replaces the work in the page only after the page has kept the previous work as the "previous
project" it can restore. The page keeps the project in `localStorage` (text files and images up to
512 KiB each), wrapped so that a browser without storage still works.

### Archives

A `.zip` writer and reader written here (stored and deflated entries, CRC-32, deflate through
`CompressionStream("deflate-raw")`). The download holds `project.json` and every file, so
`meltemi-diagrams validate` and VS Code open it as is.

## Risks / Trade-offs

- [The bundle is large: ELK 1.6 MB, fontkit 0.7 MB] → code splitting puts ELK in a parallel
  chunk; fonts and icons are fetched on demand; the code pane works before the first layout.
- [Synchronous layout on the main thread] → analysis waits for a 250 ms typing pause and the
  templates lay out in tens of milliseconds; the editor's own targets apply (change 23).
- [WebCodecs and `CompressionStream` vary between browsers] → features are detected; missing ones
  are disabled with the reason; the test runs in the installed Edge or Chrome.
- [Print to PDF depends on the browser's dialog] → the page sizes the frame exactly; the CLI
  remains the reproducible path for PDF.
- [A share link is a URL anyone can craft] → it only carries text that the page compiles; the
  compiler's limits, the decompression cap and sanitisation apply; nothing runs.

## Migration Plan

None: nothing is published yet. The extension's webview imports the canvas from the new package;
its tests run unchanged against the built bundle.

## Open Questions

None.
