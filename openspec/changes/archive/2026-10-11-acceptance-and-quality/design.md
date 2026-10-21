## Context

Every package has its own tests and the corpus keeps SVG snapshots, but the proposal's release
criteria are about the product as a whole: an acceptance corpus in four profiles, zero cut or
overlapping labels, pinned visual tests, determinism of geometry and frames, measured performance
on a reference machine, a first export in under ten minutes and an export matrix per destination.
A first audit of the drawings found two real faults the composition checks did not see: a
connector in an assisted C4 view ran straight through a box with its label on top, and a connector
entering a group ran over the group's title.

## Goals / Non-Goals

**Goals:**

- Check labels where they are seen: in the drawing, for every profile.
- Fix what the checks find, in the layout, so that the corpus is at zero.
- One place that runs every release criterion and records the results.

**Non-Goals:**

- Checking PowerPoint, Keynote and Google Slides by software: they run on the owner's machines;
  the code provides the files, the checklist and the table.
- A universal frame rate: the proposal promises fluid interaction on the reference corpus only.

## Decisions

### The label audit works on the scene

`auditLabels` walks the scene's groups (elements, relations, labels, events, the frame). It measures
each text with the measurer the layout used: from the cap height above the baseline to the
descenders. It then reports:

- **cut**: a text beyond the picture (or the story camera's view box), beyond the background drawn
  just before it in a label group (a relation's pill, a sequence guard's band), or beyond the box
  of the element that draws it;
- **overlap**: a text over a text of another owner; over the box of an element it does not belong
  to (containers, boxes that hold other boxes, may hold labels; annotations such as tags, notes and
  free texts may sit on boxes, and free boxes on other layers may too); or crossed by a drawn
  connector other than its own.

Working on the scene covers every profile and every future drawing code without knowing how each
lays text out. `layoutDiagram` runs the audit after every layout and turns the findings into
`layout.label-cut` and `layout.label-overlap` warnings on the declaration that draws the text. A text
whose element or relation another check already names (`text-overflow`, `overlap`,
`label-under-connector`, `connector-crossing`) is not reported twice.

### The layout keeps labels clear

- **Labels slide.** A relation label without a `label` statement tries 50 %, 42 %, 58 %, 34 %, 66 %,
  26 %, 74 %, 18 % and 82 % of its connector. It takes the first stop that covers no shape, no group
  title band, no placed label and no other connector, or the least covered one. The stops are
  fixed, so the result is deterministic and a clear label never moves.
- **Connectors pass under titles.** A straight connector that crosses a group's title and
  description (not a group it joins) is drawn in pieces with a 3 px gap around them. The relation's
  `track`, which motion follows, stays whole.
- **Default routes go around boxes.** In `assisted` and `manual` mode, an `auto` or `orthogonal`
  connector with no waypoints, no written ports and no lane is checked against the other shapes. If
  it crosses any, the router tries the L and Z routes between the middles of all sixteen side pairs,
  each leaving and entering square with a 20 px stub. It keeps the one that crosses the fewest,
  then the shortest, then the one with the fewest bends, and only when it crosses fewer than the
  default. ELK's routes in `auto` mode already avoid boxes.
- **`layout.connector-crossing`** reports what still crosses, so that a person can add a `route`.

### `validate` lays out

`validate` merges each file's `layout.*` diagnostics from the same analysis the editor runs into
its compile and project diagnostics, deduplicated. CI's `validate --strict` therefore fails on
composition faults, labels included. Exports and the editor already showed them.

### The acceptance package

`packages/acceptance` (private) has:

- `test/` (run by `pnpm test`): the acceptance conditions, the label target over every corpus,
  template and example, the SVG snapshots of the acceptance corpus, the determinism of scenes and
  control frames, and the performance targets with a margin for slower machines;
- `src/` runners, run with `tsx`: visual regression, export determinism, first-export timing, the
  browser matrix, the office kit, the benchmark, and `run-all.ts`, which runs them in order and
  writes `docs/quality/results.md`.

The corpus lives in `corpus/acceptance/<profile>/` with `errors/` and `edits/`. An edit scenario
is a JSON list of `EditOperation`s with expectations: the ranges that may change, the comments
that must remain, and the elements that must not move.

### Visual regression with pinned resources

References are PNGs at scale 1 in `corpus/acceptance/visual/`, with `manifest.json` recording the
browser and its version. Fonts are pinned by the bundled packages, ELK by its version, and the
browser by the recorded version: a different version makes the comparison report the versions next
to the result.

A pixel differs when a channel differs by more than 16 of 255. A drawing passes with at most 0.1 %
of differing pixels, which absorbs anti-aliasing, and no differing run longer than 2 px. Failures
write `actual` and `diff` PNGs. The PNG reader is written here (8-bit RGBA and RGB, no interlace,
`node:zlib`).

### Determinism of frames

Scenes are compared as JSON across fresh project sessions. Control frames (the start and end of
every scene and the middle of every action) are compared as SVG text. Exported videos are compared
with `ffmpeg -f framemd5`: the hash of every decoded frame, so the container's metadata (time
stamps, encoder strings) never counts as a change. The proposal asks this "within the pinned
environment"; the runner records the FFmpeg and browser versions.

### Reference machine and targets (decision 0032)

The reference machine is the one the product is built on: Intel Core i9-11980HK, 16 threads,
64 GB, Windows 11, Node 24, Edge 155. The targets measured on it:

- analysis after an edit (compile, layout and diagnostics of the file inside its project, through
  `ProjectSessions`) p95 under 500 ms for views of up to 30 elements in each profile;
- a canvas drag round trip (message, plan, edit, analysis, render) p95 under 100 ms;
- the first export from a template, machine time, under 60 s, which leaves the ten minutes to the
  person reading and changing the template.

The tests assert the first two with a factor of 4 for slower CI machines; `pnpm bench --write`
records the exact figures.

### Verification matrix

Playwright drives Edge and Chrome through their DevTools protocol and Firefox (157, installed)
through WebDriver BiDi (`channel: "moz-firefox"`). For each format of the purchase reference
example:

| Format | Check |
| --- | --- |
| SVG, animated SVG | loads as an image and inline, draws pixels, and the animated one changes over time |
| PNG | loads at its size |
| PDF | page size, embedded fonts, extractable text and link annotations, read from the file |
| HTML player | plays offline, moves forward, answers the keyboard, and logs no error |
| Catalog | opens, navigates and searches offline |
| MP4, WebM | metadata, duration and size; seeking to control times draws a frame |
| GIF | decodes at its size |
| Playground | in each browser: SVG equal to the CLI's, PNG at its scale, GIF, WebM and MP4 recorded in the page and decoded by FFmpeg |

Results are written with the browser versions to `docs/verification/browsers.md`. The office kit is
a folder of the same files with a checklist; `docs/verification/office-apps.md` has the table the
owner fills in for each application, version and format.

## Risks / Trade-offs

- [Label sliding and rerouting change drawings] → only where a label or connector was in the way;
  every changed snapshot is reviewed.
- [Pixel references depend on the browser version] → the version is recorded and shown; tolerance
  absorbs anti-aliasing; references are updated deliberately with `--update`.
- [Performance tests on shared CI machines] → assertions keep a factor of 4 over the targets; the
  recorded figures come from the reference machine.
- [Firefox through BiDi is newer in Playwright] → the runner reports a browser it cannot drive as
  skipped, not failed.

## Migration Plan

None.

## Open Questions

None.
