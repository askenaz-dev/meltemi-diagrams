## MODIFIED Requirements

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
SHALL be drawn over the theme's background, and a size over the limit scaled down to fit, each
with a notice shown after the download. A duration, size or frame rate that does not parse or is
outside its range SHALL be refused in the dialog before anything is drawn. Progress SHALL be shown
per frame, and the person SHALL be able to cancel.

#### Scenario: GIF frames
- **WHEN** a story of 2 s is exported as GIF at 15 fps
- **THEN** the file has 30 frames of 960 × 540 and loops

#### Scenario: GIF of effects without a duration
- **WHEN** a diagram with `animate pay { effect flow }` is exported as GIF with the Duration field empty, which showed `6s` greyed
- **THEN** the file has 90 frames of 960 × 540, consecutive decoded frames differ, and the message after the download names the 6 s used

#### Scenario: Transparent MP4
- **WHEN** a story is exported as MP4 with the background `transparent`
- **THEN** the video is opaque with the theme's background and the message after the download says MP4 has no transparency

#### Scenario: WebM readable
- **WHEN** a story of 2 s is exported as WebM in Edge or Chrome
- **THEN** FFmpeg reads 60 frames of 1920 × 1080 in VP9 or VP8

#### Scenario: MP4 readable
- **WHEN** a story of 2 s is exported as MP4 in Edge or Chrome
- **THEN** FFmpeg reads 60 frames of 1920 × 1080 in H.264

#### Scenario: Bad duration
- **WHEN** `soon` is typed in the Duration field and the export is started
- **THEN** the dialog shows that the duration takes a time up to 600s, and no frame is drawn
