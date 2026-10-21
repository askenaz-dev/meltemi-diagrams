# 0025. Export profiles, and PNG and PDF from the installed browser

Status: accepted (export-png-pdf change, 11 October 2026)

## Context

The proposal's `export` block is a reproducible delivery profile: each profile describes format,
dimensions, resources, font treatment and animation behaviour. PNG serves documents and slides
with configurable resolution and optional transparency; PDF serves sheets and documents with
defined dimensions, checked fonts, vectors and links; a slide may carry a frame and a link to the
walkthrough. Playwright and Chromium are the proposal's candidates for captures and PDF printing,
and reproducibility is promised within a pinned environment, not across systems. Edge and Chrome
are installed where the product is built; the approved plan drives the installed browser.

## Decision

- **Profiles compile.** `export <id> for <target> { … }` becomes `Document.exports`, every option
  checked against the format and the target, with `export.*` diagnostics. Video options are
  compiled now; the encoder comes with change 17. No block of the language is parse-only any more,
  so `block.unsupported` is gone.
- **The browser draws PNG and PDF.** The SVG the exporter writes, with embedded fonts, is drawn by
  the installed Chromium browser: screenshots for PNG (device scale factor, transparent default
  background when asked) and print-to-PDF for PDF (CSS page of the picture's size, tagged, vectors,
  fonts and links kept). The same engine that displays SVG in browsers draws the files, so they look
  like the SVG.
- **A small DevTools client, no dependency.** `@meltemi/diagrams-capture` speaks the DevTools
  protocol over `--remote-debugging-pipe` (NUL-separated JSON on file descriptors 3 and 4), with the
  switches that keep Edge from relaunching itself. It is plain JavaScript modules so that a plain
  `node` runs it: the synchronous command line calls a child process, the editor calls it directly.
- **One production path.** `produceExport` and `profileRequest` in the editor's Node entry turn a
  request into SVG or HTML text or a capture job; the command line and VS Code only differ in how
  they write the results.
- **Links.** `url` on elements and entities, and a profile's `link` for the whole picture, written
  as SVG `<a>` elements; only `http:`, `https:`, `mailto:` and relative URLs are accepted.

## Alternatives considered

- **Playwright.** Approved and used by the tests, but a large runtime dependency for two calls; the
  protocol subset needed is small.
- **A rasterizer and a PDF writer of our own.** Exact control, but text shaping, fonts, images and
  anti-aliasing would have to match the browser's SVG rendering; the browser is the reference.
- **resvg or similar.** Would need a native or WebAssembly download that was not approved.

## Consequences

- PNG and PDF need a Chromium browser on the machine (or `MELTEMI_BROWSER`); SVG and HTML need none.
- Video exports (change 17) capture frames the same way and encode them with the system FFmpeg.
- The verification matrix (change 23) records the browser version each export names.
