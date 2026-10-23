# playground-exports Specification

## Purpose
Every export the playground makes in the browser with the CLI's requests and code: pictures, PDF by printing, the HTML player, GIF, WebM and MP4, profiles, source, project archive, model JSON and catalog.
## Requirements
### Requirement: Same requests as the CLI
The page's export dialog SHALL build the same `ExportRequest`s as the CLI and the editor, for the
open diagram or a story of the file: format, theme, font policy, static or animated, instant,
scenario, scale, size, background (`transparent`, a colour or a token), link, embed, autoplay,
loop, frames per second and duration, with the CLI's defaults. It SHALL produce them with the same
`produceExport`, so texts, pictures and frames match the CLI's for the same source. It SHALL list
the export profiles of the file and run each one as `meltemi-diagrams export --profile` would, the
output named as the profile says. Problems SHALL be shown with the CLI's wording, and an export
SHALL wait until every font and icon it reads has been fetched.

#### Scenario: Same SVG
- **WHEN** the `flow` template's diagram is exported as SVG with embedded fonts in the page and with `meltemi-diagrams export`
- **THEN** both SVG texts are identical

#### Scenario: Profile
- **WHEN** the person runs the `purchase` template's `sheet` profile
- **THEN** the page produces the PDF the profile describes, named as the profile names it

### Requirement: Pictures
SVG (static or animated) and the HTML player SHALL be written as produced. PNG SHALL be the SVG drawn
on a canvas at the output size times the scale, with a transparent background when asked, at most
16,384 pixels a side. PDF SHALL open the browser's print dialog on a page the size of the picture
with no margin, so that "Save as PDF" writes it as vectors; the dialog SHALL say so.

#### Scenario: PNG size
- **WHEN** a 480 × 300 diagram is exported as PNG at scale 2
- **THEN** the file is a 960 × 600 PNG

#### Scenario: Print page
- **WHEN** PDF is chosen for a 480 × 300 diagram
- **THEN** the print frame holds the SVG and a `@page` rule of 480 × 300 pixels with no margin

### Requirement: Video and GIF in the browser
GIF, WebM and MP4 SHALL be made from the frames of the player document at
`i × 1000 / fps` milliseconds for `round(duration × fps / 1000)` frames, drawn by the player's
`frameSvg` at the output size, with the CLI's defaults (1920 × 1080 at 30 fps; GIF 960 × 540 at 15
fps) and its duration rules: the Duration field SHALL show, greyed, the duration the export takes
when it is left empty (the story's length, or the effects' default duration, or 1 s without
moving effects), and the export SHALL use it. GIF SHALL use one palette of at most 256 colours,
ordered dithering, frames cropped to what changed, and loop forever. WebM SHALL hold VP9 (or VP8)
from the browser's WebCodecs encoder and MP4 H.264 with even dimensions, each in a container
written by the page, playable by FFmpeg and browsers. A format the browser cannot encode SHALL be
disabled with the reason and the CLI command that makes it. An MP4 with a transparent background
SHALL be drawn over the theme's background, and so SHALL a WebM, whose browser encoders have no
alpha, with a notice naming the CLI command that keeps it transparent; a size over the limit SHALL
be scaled down to fit; each SHALL be said after the download. A duration, size or frame rate that does not parse or is
outside its range SHALL be refused in the dialog before anything is drawn. Progress SHALL be shown
per frame, and the person SHALL be able to cancel.

#### Scenario: GIF frames
- **WHEN** a story of 2 s is exported as GIF at 15 fps
- **THEN** the file has 30 frames of 960 × 540 and loops

#### Scenario: GIF of effects without a duration
- **WHEN** a diagram with `animate pay { effect flow }` and `animate api { effect pulse }` is exported as GIF with the Duration field empty, which showed `6s, one loop of the effects` greyed
- **THEN** the file has 90 frames of 960 × 540, consecutive decoded frames differ, and the message after the download names the 6 s used

#### Scenario: Transparent MP4
- **WHEN** a diagram is exported as MP4, then as WebM, with the background `transparent`
- **THEN** both videos are drawn over the theme's background, the first message says MP4 has no transparency and the second that the command line keeps a WebM transparent

#### Scenario: WebM readable
- **WHEN** a story of 2 s is exported as WebM in Edge or Chrome
- **THEN** FFmpeg reads 60 frames of 1920 × 1080 in VP9 or VP8

#### Scenario: MP4 readable
- **WHEN** a story of 2 s is exported as MP4 in Edge or Chrome
- **THEN** FFmpeg reads 60 frames of 1920 × 1080 in H.264

#### Scenario: Bad duration
- **WHEN** `soon` is typed in the Duration field and the export is started
- **THEN** the dialog shows that the duration takes a time up to 600s, and no frame is drawn

### Requirement: Source, project, model and catalog
The page SHALL download the open file's source, the project as `.zip`, the model JSON of the open
file (as `meltemi-diagrams convert` writes it), and the project's HTML catalog (as
`meltemi-diagrams build catalog` writes it, with the catalog runtime, offline).

#### Scenario: Catalog
- **WHEN** the person downloads the catalog of the `purchase` template
- **THEN** the file is one HTML page holding its 4 diagrams and 1 story, with no external reference

