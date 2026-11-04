# playground-exports Specification

## Purpose
Every export the playground makes in the browser with the CLI's requests and code: pictures, PDF by printing, the HTML player, GIF, WebM and MP4, profiles, source, project archive, model JSON and catalog.
## Requirements
### Requirement: Same requests as the CLI
The page's export dialog SHALL build the same `ExportRequest`s as the CLI and the editor, for the
open diagram or a story of the file: format, theme, font policy, static or animated, instant,
scenario, scale, size, background (`transparent`, a colour or a token), link, embed, autoplay,
loop, frames per second and duration, with the CLI's defaults; the one field it adds beyond the
CLI's, `branding: "none"`, SHALL be sent only by a person entitled to it who asked for it
("Exports without the branding"). It SHALL produce them with the same `produceExport`, so texts,
pictures and frames match the CLI's for the same source. It SHALL list the export profiles of the
file and run each one as `meltemi-diagrams export --profile` would, the output named as the
profile says. Problems SHALL be shown with the CLI's wording, and an export SHALL wait until every
font and icon it reads has been fetched.

#### Scenario: Same SVG
- **WHEN** the `flow` template's diagram is exported as SVG with embedded fonts in the page and with `meltemi-diagrams export`
- **THEN** both SVG texts are identical

#### Scenario: Profile
- **WHEN** the person runs the `purchase` template's `sheet` profile
- **THEN** the page produces the PDF the profile describes, named as the profile names it

#### Scenario: No branding field without the choice
- **WHEN** an entitled person exports with the branding box unchecked, and a person who is not entitled exports anything
- **THEN** the requests have no `branding` field and the SVGs equal the CLI's for the same source

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

### Requirement: Exports without the branding
When the page's session is a cookie session whose answer says `user.entitlements.unbranded` is
`true`, the export dialog SHALL show a checkbox **Export without the Meltemi branding** under the
Theme field, for every format and target, unchecked each time the dialog opens, with a hint saying
what it leaves out (the strip at the foot of the sheet: the Meltemi mark, the wordmark and the
title) and that the catalog's pictures follow. Checked, the request SHALL carry `branding: "none"`
and the export SHALL be laid out with the frame override of `flow-svg-export` ("Styles and
themes"): no `frame` group and no mark gradient in the SVG, in the PNG and PDF pictures, in every
view the HTML player bundles and in every frame of a GIF, WebM or MP4, with the theme's other tokens
unchanged; the status line after the download SHALL add "Without the Meltemi branding." after the
download's message; and the catalog downloaded from the same dialog SHALL be built with the same
override for its pictures, its footer "Built with Meltemi Diagrams <version>" and its generator
meta unchanged. Anonymous, on a static server, for a session whose `user` lacks `entitlements` or
whose `unbranded` is anything but `true`, and for a token session, the dialog SHALL have no such
control at all. The file's profiles SHALL be unaffected by the box, and a published catalog SHALL
be built without the override. The words SHALL be in the interface language.

#### Scenario: An entitled person exports an SVG without the strip
- **WHEN** a person whose session answer carries `user.entitlements: { "unbranded": true }` checks the box and exports the `flow` template's diagram as SVG
- **THEN** the downloaded SVG has no `<g data-role="frame">`, no `meltemi-wind` gradient, the same `width` as the branded one and a `height` 44 px smaller, the same fonts and background, and the status line reads "Downloaded flow.svg. Without the Meltemi branding."

#### Scenario: The hint under the box
- **WHEN** the entitled person opens the dialog
- **THEN** under the checkbox a hint reads "Leaves out the strip at the foot of the sheet: the Meltemi mark, the wordmark and the title; the catalog's pictures follow."

#### Scenario: Every format
- **WHEN** the same person exports the `purchase` template's story as an HTML player and as a GIF with the box checked
- **THEN** no view embedded in the player holds a `frame` group, and the first GIF frame has the height of the unframed scene

#### Scenario: The catalog from the dialog
- **WHEN** the entitled person checks the box and presses the catalog button
- **THEN** no picture of the downloaded catalog holds a `frame` group or a `meltemi-wind` gradient, and the page's footer still reads "Built with Meltemi Diagrams <version>." with its generator meta

#### Scenario: Unchecked at each opening
- **WHEN** the person exported with the box checked, closes the dialog and opens it again
- **THEN** the box is unchecked and the next export carries the branding

#### Scenario: Nothing on a static server
- **WHEN** the page is served by the playground suite's static server, whose `/api/session` answers `{ "user": null }`
- **THEN** the export dialog has no checkbox about the branding, hidden or otherwise, and exports as before

#### Scenario: Nothing for a plain person
- **WHEN** a signed-in person whose session answer carries `user.entitlements: { "unbranded": false }`, or a `user` with no `entitlements`, opens the export dialog
- **THEN** there is no checkbox about the branding and the SVG carries the strip

#### Scenario: A hostile answer entitles nobody
- **WHEN** `/api/session` answers a `user` whose `entitlements` is `{ "unbranded": "yes" }` or a string
- **THEN** the page treats the person as not entitled and shows no checkbox

#### Scenario: Profiles keep the branding
- **WHEN** the entitled person checks the box and runs the file's `sheet` profile from the dialog
- **THEN** the profile's output carries the strip its theme gives, as `meltemi-diagrams export --profile sheet` writes it

#### Scenario: In Spanish
- **WHEN** the interface language is Spanish and the entitled person opens the dialog
- **THEN** the checkbox reads "Exportar sin la marca de Meltemi", its hint "Omite la franja al pie de la hoja: la marca de Meltemi, el nombre y el título; las imágenes del catálogo la siguen.", and the status line after an unbranded download ends with "Sin la marca de Meltemi."

