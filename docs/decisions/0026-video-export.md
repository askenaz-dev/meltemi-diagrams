# 0026. Video and GIF, frame by frame through the browser and FFmpeg

Status: accepted (export-video-gif change, 11 October 2026)

## Context

The proposal exports stories and effects as MP4, WebM and GIF for presentations, documentation and
social media, with defined dimensions and frame rate, and promises that the same source and the
same pinned environment give the same frames. Motion already runs on a deterministic clock: the
player draws any instant of a story or of a diagram's effects as a pure function of time (decision
0024). PNG captures already drive the installed Chromium browser (decision 0025). FFmpeg is
installed where the product is built, and the approved plan uses the system FFmpeg and never
bundles it.

## Decision

- **Frames, not screen recording.** A frames page holds the player document, the player runtime and
  `__draw(t)`, which replaces the page with the frame at `t` (`MeltemiPlayer.frameSvg`) at the
  output size. The browser takes one screenshot per frame time; nothing depends on real time, so a
  slow machine writes the same frames as a fast one.
- **Frame times.** A video of duration `D` at `f` frames per second has `round(D × f / 1000)`
  frames, the `i`-th at `i × 1000 / f` ms. The duration is the story's length, the end of the
  effects, `--duration` or the profile's `duration`; effects that repeat forever, or that do not
  move, need one.
- **Encoding.** The screenshots are piped as PNG to FFmpeg (`image2pipe`):

  | Format | Encoder                                             | Defaults            |
  | ------ | --------------------------------------------------- | ------------------- |
  | MP4    | libx264, CRF 18, yuv420p, faststart, padded to even | 1920 × 1080, 30 fps |
  | WebM   | libvpx-vp9, CRF 32; yuva420p when transparent       | 1920 × 1080, 30 fps |
  | GIF    | palettegen and paletteuse (Bayer dither), loops     | 960 × 540, 15 fps   |

  MP4 has no transparency, so a transparent background is refused there.

- **FFmpeg is found, not shipped.** `MELTEMI_FFMPEG`, then `ffmpeg` on the path, then the usual
  install folders; VS Code adds the `meltemi.export.ffmpeg` setting. Each export names the browser
  and the FFmpeg version that made it.
- **One production path.** `produceExport` returns a video job for `mp4`, `webm` and `gif`; the
  command line records it in the capture worker, VS Code records it with progress.

## Alternatives considered

- **Screen recording of the playing player** (the browser's screencast). Depends on real time and
  drops frames under load; the output would not be reproducible.
- **An encoder in JavaScript or WebAssembly.** Would need a download that was not approved and would
  be slower and larger than FFmpeg's.
- **Bundling FFmpeg.** Large, per platform, and a licence obligation for every build of the
  product: libx264 is GPL. Using the user's FFmpeg leaves its licence with its installation;
  libvpx is BSD.

## Consequences

- Video exports need a Chromium browser and FFmpeg on the machine; SVG and HTML need neither.
- A 7.4 s story at 1080p and 30 fps is 222 screenshots; recording takes tens of seconds, so VS Code
  shows progress per frame.
- The verification matrix (change 23) records the browser and FFmpeg versions each export names.
