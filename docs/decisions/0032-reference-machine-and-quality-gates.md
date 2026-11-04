# 0032. Reference machine and quality gates

Status: accepted (acceptance-and-quality change, 11 October 2026)

## Context

The proposal's release criteria are about the product as a whole: an acceptance corpus in four
profiles, zero cut or overlapping labels, visual tests with pinned resources, deterministic
geometry and frames, fluid interaction measured on a reference machine, a first export in under
ten minutes, and exports verified where they are used. It left the reference machine and the
numeric targets as pending decisions. Every package had its own tests, but nothing measured these
criteria together, and a first audit of the drawings found two faults no check saw: a connector of
an assisted C4 view ran through a box with its label on top, and a connector entering a group ran
over the group's title.

## Decision

- **The reference machine** is the one the product is built on: Intel Core i9-11980HK (8 cores, 16
  threads), 64 GB, Windows 11, Node 24, Edge 155, Chrome 154, Firefox 157 and FFmpeg 6.1. Every
  recorded figure names the machine and versions it ran with.
- **Interaction targets**, at the 95th percentile on the reference machine, for views of up to 30
  elements in each profile:
  - the analysis a file gets after an edit (compile, layout and diagnostics inside its project):
    under **500 ms**;
  - a canvas drag from the message to the new drawing (plan, edit, analysis, render): under
    **100 ms**.

  Tests assert them with a factor of four, so that shared CI machines do not fail by chance;
  `pnpm bench --write` records the exact figures in `docs/performance.md`.

- **First export**: from `init` to exported SVG, PNG, PDF and MP4, the machine's part is under
  **60 s** for every template, which leaves the proposal's ten minutes to the person reading and
  changing the template. The playground path is timed too.
- **Labels**: zero cut or overlapping labels over every corpus, template and example. The layout
  audits each drawing it makes and reports `layout.label-cut` and `layout.label-overlap`; `validate`
  reports layout diagnostics, so `validate --strict` in CI fails on them.
- **Visual references** are PNGs at scale 1, drawn by the installed Edge or Chrome with the bundled
  fonts and the pinned ELK. A pixel differs when a channel differs by more than 16 of 255; a
  drawing passes with at most 0.1 % differing pixels and no differing run longer than 2 pixels. The
  manifest records the browser version; references change only with `--update`.
- **Determinism** is checked by content: SVG and HTML byte for byte, PNG pixel for pixel, video
  frame by frame with FFmpeg's frame hashes, so container metadata never counts.
- **Exports are verified where they are used**: automatically in Edge, Chrome and Firefox
  (Firefox through WebDriver BiDi, with the browser already installed), including the playground's
  own exports; by hand in PowerPoint, Keynote and Google Slides with a kit of files and a checklist
  whose results table the owner fills in.
- **One command runs every criterion**: `pnpm acceptance` writes `docs/quality/results.md`.

## Alternatives considered

- **A cloud CI runner as the reference.** Reproducible to anyone, but shared runners vary by tens
  of percent between runs, and the proposal speaks of the machine people work on.
- **Frame rates as the interaction target.** The canvas draws with the browser; what the person
  waits for is the round trip from a drag to the new drawing, which is what is measured.
- **Strict pixel equality.** Anti-aliasing differs between GPU paths of the same browser version;
  the tolerance absorbs it, and the run limit still catches a moved label or line.
- **Comparing video files byte for byte.** WebM muxers write time-dependent metadata; frame hashes
  compare what is seen.
- **Driving slide applications with UI automation.** Fragile, licence-bound and different on every
  version; a person with the applications checks them with the kit.
- **Downloading Playwright's own browsers.** Not approved, and not what people use; the installed
  Edge, Chrome and Firefox are driven instead.

## Consequences

- The layout keeps labels clear by itself: relation labels slide to a clear stop, straight
  connectors pass under group titles in pieces, and default connectors go around boxes in assisted
  and manual layouts; `layout.connector-crossing` reports what still crosses.
- Exported players and catalogs carry an empty inline icon, because Firefox asked the server for
  `/favicon.ico` and logged the policy's refusal as an error.
- `packages/acceptance` is a private package of tests and runners; its figures are only meaningful
  with the machine line next to them.
- A new browser version may change pixels within the tolerance; a larger change is reviewed and
  recorded deliberately.
