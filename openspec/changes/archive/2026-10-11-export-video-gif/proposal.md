## Why

The proposal lists MP4 for presentations and video, WebM for the web and GIF for short previews:
MP4 targets 1080p at 30 fps with an opaque background and a documented encoder, WebM is checked by
browser and codec, GIF has an optimised palette, reduced resolution and weight control. Video is
produced by evaluating the instant of each frame, waiting for fonts and resources, capturing the
scene and encoding the result, so the speed of the computer never changes the story's times;
Playwright and Chromium capture and FFmpeg encodes. An effect that repeats forever needs an
explicit export duration unless it belongs to a finite story. Change 16 compiles video profiles
but nothing writes them yet. Roadmap change 17 asks for MP4, WebM and GIF from stories and effects.

## What Changes

- **Frames.** The player runtime draws any instant of a story or of a diagram's effects in a page
  sized to the output; the capture package evaluates each frame's time in that page, waits for
  fonts and images, and screenshots it, so frames are exact whatever the machine's speed.
- **Encoding.** The system FFmpeg (found on the path, or through `MELTEMI_FFMPEG`; never bundled)
  encodes the frames piped to it: MP4 with H.264 (yuv420p, CRF 18, fast start, opaque), WebM with
  VP9 (CRF 32; with an alpha channel when the background is transparent), GIF with a palette made
  for the clip and Bayer dithering, looping. Defaults: 1920 × 1080 at 30 fps for MP4 and WebM,
  960 × 540 at 15 fps for GIF.
- **CLI.** `export --format mp4|webm|gif` for a story (`--story`) or a diagram's effects, with
  `--size`, `--fps`, `--duration` (required for effects that repeat forever) and `--background`;
  profiles of those formats now run.
- **Editor.** VS Code command **Export Video** (format and target asked).
- **Docs.** Video in `docs/language/export.md`, decision 0026 with the encoder settings and the
  licences of the system FFmpeg's encoders, README, skill reference.

## Capabilities

### New Capabilities

- `video-export`: MP4, WebM and GIF of stories and effects, frame by frame.

### Modified Capabilities

None.

## Impact

- `@meltemi/diagrams-capture` gains frame capture and FFmpeg encoding; the player runtime exposes
  `frameSvg`.
- The CLI and VS Code write video; FFmpeg must be installed for video (SVG, PNG, PDF and HTML do
  not need it).
