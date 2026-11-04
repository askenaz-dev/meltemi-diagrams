# export-verification Specification

## Purpose
Checking exports where they are used: every format of the reference example opened in Edge, Chrome and Firefox, the playground's own exports in each browser, PDF read from the file, and a kit with a checklist for slide applications that the owner checks by hand.
## Requirements
### Requirement: Browser matrix
`pnpm verification:browsers` SHALL export the purchase reference example in every format and open
each in Edge, Chrome and Firefox (through WebDriver BiDi), checking:

- SVG and animated SVG load as an image and inline and draw pixels, and the animated one changes
  over time;
- PNG loads at its size;
- PDF has the expected page size, embedded fonts, extractable text and link annotations (read from
  the file);
- the HTML player plays offline, moves forward, answers the keyboard and logs no error;
- the catalog opens, navigates and searches offline;
- MP4 and WebM report their duration and size and draw a frame at control times;
- GIF decodes at its size;
- the playground, in each browser, writes the command line's SVG byte for byte and the PNG at its
  scale, and records GIF, WebM and MP4 that FFmpeg decodes at their size and frame count, or says
  that the browser cannot encode the format.

A browser that is not installed or cannot be driven SHALL be reported as skipped. The results, with
the date and each browser's version, SHALL be written to `docs/verification/browsers.md`.

#### Scenario: Recorded matrix
- **WHEN** the runner completes with the three browsers installed
- **THEN** `docs/verification/browsers.md` has one row per format and browser with its result and version

### Requirement: Office applications
`pnpm verification:kit <folder>` SHALL write the purchase example's SVG, PNG, PDF, MP4, WebM, GIF and
HTML player with a checklist. `docs/verification/office-apps.md` SHALL describe the checks for
PowerPoint, Keynote and Google Slides (insert, scale, fonts, links, playback, transparency, size)
and keep a results table per application, version and format, which the owner fills in.

#### Scenario: Kit
- **WHEN** `pnpm verification:kit kit` runs
- **THEN** `kit/` holds the seven files and `checklist.md`

