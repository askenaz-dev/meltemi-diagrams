## Context

- `storyFrame` and `sceneAt` draw any instant; the player runtime draws them in a browser page with
  the document's font faces; `@meltemi/diagrams-capture` drives the installed browser over the
  DevTools protocol (change 16).
- FFmpeg 6 with libx264, libvpx-vp9 and the GIF encoder is installed; the product uses the system
  FFmpeg and does not bundle it.

## Goals / Non-Goals

**Goals:** MP4, WebM and GIF of stories and effects from the CLI, profiles and VS Code; exact frame
times; documented encoder settings; checks of duration, dimensions and codec.

**Non-Goals:** audio (synthetic voice is outside 1.0), AI video (outside 1.0).

## Decisions

### D1. Frames in one page

The capture opens one page with the player runtime, the player document and the output size; the
page exposes `__draw(t)`, which sets the frame's SVG (`MeltemiPlayer.frameSvg(doc, t)`, the
function the player draws with) and resolves once fonts are ready and two frames have been drawn.
For each frame `i` of `N = round(duration × fps)`, the capture calls `__draw(i × 1000 / fps)` and
takes a PNG screenshot; frames go to FFmpeg's standard input as they come
(`-f image2pipe -framerate <fps> -i -`).

### D2. Encoders

| Format | Settings                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| MP4    | `-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -movflags +faststart`; opaque, even sides             |
| WebM   | `-c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1`, `-pix_fmt yuva420p -auto-alt-ref 0` when transparent, else `yuv420p` |
| GIF    | `palettegen=stats_mode=diff` then `paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, `-loop 0`    |

Defaults: 1920 × 1080 at 30 fps (MP4, WebM), 960 × 540 at 15 fps (GIF); the picture is fitted and
centred on the background. A story lasts its own duration; effects last their `duration`, or until
the last finite effect ends (`export.missing-duration` otherwise).

### D3. Where FFmpeg comes from

`MELTEMI_FFMPEG`, then `ffmpeg` on the path, then the usual install folders. Without it, video
exports fail with a message that says how to install or point at it. The export line names FFmpeg's
version next to the browser's.

## Risks / Trade-offs

- [Capture speed] → a 7.4 s story at 30 fps is 222 screenshots; frames stream to FFmpeg, so memory
  stays flat; the duration of the video never depends on it.
- [Encoder licences] → libx264 is GPL; the product does not distribute FFmpeg, and the docs say
  which encoder writes each format.
