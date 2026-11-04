## ADDED Requirements

### Requirement: Video of stories and effects
`meltemi-diagrams export <file> --format mp4|webm|gif` SHALL write a video of a story (`--story`)
or of a diagram's effects, frame by frame: each frame `i` drawn at `i × 1000 / fps` ms with the
same functions as the player, after fonts and images load, so the video lasts the story's duration
(or the effects' `--duration`) whatever the machine's speed. MP4 and WebM SHALL default to
1920 × 1080 at 30 fps and GIF to 960 × 540 at 15 fps, the picture fitted and centred; `--size` and
`--fps` SHALL change them. Effects that repeat forever without `--duration` SHALL be a usage error.

#### Scenario: Purchase story as MP4
- **WHEN** `mdg export purchase.meltemi --story purchase --format mp4` runs
- **THEN** `purchase.purchase.mp4` is H.264, 1920 × 1080, 30 fps and lasts 7.4 s

### Requirement: Encoders
The system FFmpeg SHALL encode MP4 with H.264 (yuv420p, opaque), WebM with VP9 (with alpha when the
background is transparent) and GIF with a palette made for the clip, looping. Without FFmpeg, video
exports SHALL fail with a message saying how to install it or set `MELTEMI_FFMPEG`.

#### Scenario: Transparent WebM
- **WHEN** a WebM profile has `background transparent`
- **THEN** the video's pixel format has an alpha channel

### Requirement: Video from profiles and the editor
Video profiles SHALL run with `--profile` and `--profiles`, and VS Code SHALL offer **Export
Video** for the stories and diagrams of a file.

#### Scenario: Profile
- **WHEN** `mdg export purchase.meltemi --profile presentation` runs
- **THEN** `purchase.presentation.mp4` is written
