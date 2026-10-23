## MODIFIED Requirements

### Requirement: Video of stories and effects
`meltemi-diagrams export <file> --format mp4|webm|gif` SHALL write a video of a story (`--story`)
or of a diagram's effects, frame by frame: each frame `i` drawn at `i × 1000 / fps` ms with the
same functions as the player, after fonts and images load, so the video lasts the story's duration
(or the effects' duration) whatever the machine's speed. MP4 and WebM SHALL default to
1920 × 1080 at 30 fps and GIF to 960 × 540 at 15 fps, the picture fitted and centred; `--size` and
`--fps` SHALL change them. Without `--duration`, a diagram whose effects repeat forever SHALL last
`defaultMotionDuration` (the least common multiple of the effects' cycles after the longest delay,
capped at 10 s, else the longest cycle), a diagram without moving effects SHALL last 1 s, and the
command SHALL print a notice naming the duration used; `--duration` SHALL always win. An MP4 with a
transparent background SHALL be drawn over the theme's background with a notice saying MP4 has no
transparency. A `--size` whose side exceeds 16 384 pixels SHALL be scaled down to fit, keeping its
proportions, with a notice naming the size used. A `--duration`, `--fps` or `--size` outside its
range SHALL be a usage error.

#### Scenario: Purchase story as MP4
- **WHEN** `mdg export purchase.meltemi --story purchase --format mp4` runs
- **THEN** `purchase.purchase.mp4` is H.264, 1920 × 1080, 30 fps and lasts 7.4 s

#### Scenario: Endless effects without a duration
- **WHEN** `mdg export checkout.meltemi --format gif` runs on a diagram with `animate pay { effect flow }` and `animate api { effect pulse }` and no durations written
- **THEN** `checkout.gif` has 90 frames at 15 fps, the frames differ, and stderr notes that the video lasts 6 s, one loop of the effects

#### Scenario: No moving effects
- **WHEN** `mdg export overview.meltemi --format mp4` runs on a diagram without effects
- **THEN** `overview.mp4` lasts 1 s and stderr notes that the diagram has no moving effects

#### Scenario: Transparent MP4
- **WHEN** `mdg export checkout.meltemi --format mp4 --background transparent` runs
- **THEN** the video is opaque with the theme's background and stderr notes that MP4 has no transparency

#### Scenario: Bad duration
- **WHEN** `mdg export checkout.meltemi --format gif --duration soon` runs
- **THEN** the usage error names the accepted form of a duration, nothing is written and the exit code is 2
