# Quality and acceptance

Meltemi Diagrams 1.0 is accepted when every criterion below holds. Each one is checked by a command
of this repository, and `pnpm acceptance` runs them all and records the outcome in
[quality/results.md](quality/results.md). The reference machine and the performance targets are in
[decision 0032](decisions/0032-reference-machine-and-quality-gates.md).

| Criterion                                                                                                       | Checked by                                                                 | Recorded in                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| An acceptance corpus in the four profiles compiles and lays out cleanly, and its drawings match their snapshots | `pnpm test` (`packages/acceptance`)                                        | `corpus/acceptance/**/*.svg`                                                                                     |
| No label is cut or overlapped, in any corpus, template or example                                               | `pnpm test`; `layout.label-cut` and `layout.label-overlap` in every editor | [quality/results.md](quality/results.md)                                                                         |
| Small edits change only what they should and keep comments, positions and message order                         | `pnpm test` (`corpus/acceptance/edits/`)                                   | [quality/results.md](quality/results.md)                                                                         |
| Syntax errors give diagnostics, keep the editor's services and the last good drawing                            | `pnpm test` (`corpus/acceptance/errors/`)                                  | [quality/results.md](quality/results.md)                                                                         |
| Drawings match pixel references made with pinned fonts, layout engine and browser                               | `pnpm acceptance:visual`                                                   | `corpus/acceptance/visual/`                                                                                      |
| Geometry and frames are deterministic; every export format gives the same content twice                         | `pnpm test`; `pnpm acceptance:determinism`                                 | [quality/results.md](quality/results.md)                                                                         |
| The editor answers within the targets on the reference machine                                                  | `pnpm bench --write`; asserted with a margin by `pnpm test`                | [performance.md](performance.md)                                                                                 |
| A template becomes exported files in minutes                                                                    | `pnpm acceptance:first-export`                                             | [quality/results.md](quality/results.md)                                                                         |
| Every export works where it is used: browsers automatically, slide applications by hand                         | `pnpm verification:browsers`; `pnpm verification:kit`                      | [verification/browsers.md](verification/browsers.md), [verification/office-apps.md](verification/office-apps.md) |

## The acceptance corpus

`corpus/acceptance/` holds the sheets the criteria are measured on:

- `flow/`, `sequence/`, `c4/` and `free/`: for each profile, long labels, cycles, nested containers,
  parallel relations and a view of thirty elements. Each sheet has an SVG snapshot beside it (a C4
  sheet one per view, `<sheet>.<view>.svg`).
- `errors/`: one syntax error per profile. The test checks the diagnostic, that completion, hover
  and symbols still answer, and that the canvas keeps the last good drawing marked as stale.
- `edits/`: edit scenarios. Each JSON file names a sheet and a list of steps; a step is an
  operation of the canvas (`setPosition`, `setRelationLabel`, `renameElement`, …) with what must
  hold afterwards:

  | Key        | What it asserts                                              |
  | ---------- | ------------------------------------------------------------ |
  | `changed`  | every removed or added line matches one of these patterns    |
  | `absent`   | the text no longer matches these patterns                    |
  | `present`  | the text matches these patterns                              |
  | `unmoved`  | by diagram, elements whose boxes stay where they were        |
  | `at`       | by diagram, elements and the centre their box has afterwards |
  | `order`    | a sequence diagram whose messages keep their order           |
  | `rejected` | the operation is refused with this reason                    |

  Every step keeps the sheet's comments, and every element that remains looks as it did.

Adding a sheet: write it, run `pnpm test` once to write its snapshot (`pnpm test -u` refreshes
snapshots after a deliberate change), look at the SVG, and run `pnpm acceptance:visual --update` to
record its pixel reference. A sheet that shows a fault in the layout stays in the corpus once the fault is fixed.

## Labels

The layout audits every drawing it makes: a text beyond the shape that holds it, beyond its
background or the picture is **cut**; a text over another text, over a box it does not belong to,
or crossed by another connector **overlaps**. The findings are `layout.label-cut` and
`layout.label-overlap` warnings in the editor, the playground and `validate` ([diagnostics](language/diagnostics.md)).
The acceptance tests hold every corpus, template and example at zero. The layout keeps labels
clear by itself where it can: relation labels slide along their connector to a clear stop,
connectors pass under group titles, and default connectors go around boxes ([layout](language/layout.md)).

## Visual regression

`pnpm acceptance:visual` draws every valid acceptance sheet as PNG at scale 1 in the installed Edge
or Chrome with the bundled fonts, and compares it with its reference in
`corpus/acceptance/visual/<profile>/`. A pixel differs when a channel differs by more than 16 of
255; a drawing passes with at most 0.1 % differing pixels and no differing run longer than 2
pixels. A failure writes the drawn PNG and a diff image under `packages/acceptance/.test-output/visual/`.

`manifest.json` records the browser and version the references were drawn with; a run with another
version names both next to the results. After a deliberate change to the drawings, look at the
diff images, then record the new references with `pnpm acceptance:visual --update`.

## Determinism

Laying out a sheet in fresh project sessions gives equal scenes, and frames of stories and effects
at control times (the start and end of every scene, the middle of every action) are equal SVG text;
the tests check both. `pnpm acceptance:determinism` exports the purchase reference example twice
in every format and compares SVG and HTML byte for byte, PNG pixel for pixel, and MP4, WebM and GIF
frame by frame with FFmpeg's frame hashes, so that a container's time stamps never count. It names
the browser and the FFmpeg it ran with.

## Performance

The editor's path is measured on the 30-element views of the four profiles: the analysis a file
gets after an edit, and a canvas drag from the message to the new drawing. `pnpm bench` prints the
figures with parse, compile, export and arrangement timings, and `pnpm bench --write` records them
in [performance.md](performance.md). `pnpm test` asserts the targets with a factor of four, so that
a slower machine does not fail them by chance.

`pnpm acceptance:first-export` times the way from a template to files: `init`, `validate` and the
export of SVG, PNG, PDF and MP4 with the CLI for each template, and the playground from opening the
page to the downloaded SVG.

## Export verification

`pnpm verification:browsers` exports the purchase example in every format and opens each file in
Edge, Chrome and Firefox (Firefox through WebDriver BiDi), served from 127.0.0.1 with nothing else
reachable; it also makes the same exports in the playground in each browser. PDF is read from the
file. The results, with each browser's version, are in [verification/browsers.md](verification/browsers.md).
A browser that is not installed is reported as skipped; `MELTEMI_EDGE`, `MELTEMI_CHROME` and
`MELTEMI_FIREFOX` name another executable, and `--only Firefox` checks one browser without
rewriting the document.

Slide applications cannot be driven by a test. `pnpm verification:kit <folder>` writes the seven
files people put into slides, with the checklist of [verification/office-apps.md](verification/office-apps.md),
whose results table the owner fills in for PowerPoint, Keynote and Google Slides.

## Running everything

```bash
pnpm acceptance
```

It builds the playground, then runs the acceptance tests, the visual regression, the determinism,
the benchmark, the first export and the browser matrix, rewrites
[performance.md](performance.md) and [verification/browsers.md](verification/browsers.md), and
writes [quality/results.md](quality/results.md) with the date, the machine and the versions. It
needs Edge or Chrome, and FFmpeg for the videos; it takes about ten minutes on the reference
machine. Run it before a release and commit the documents it writes.
