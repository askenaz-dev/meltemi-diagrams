## MODIFIED Requirements

### Requirement: PNG
PNG exports SHALL be captured by the installed Edge, Chrome or Chromium, found automatically or
through `MELTEMI_BROWSER`, after fonts and images load, at a pixel scale (2 by default) or a fixed
`size` with the picture fitted and centred, with the theme's background, another colour, or a
transparent one. When the scale or the size would make a side exceed 16 384 pixels, the export
SHALL use the largest scale, or the largest size of the same proportions, that fits, and SHALL
report a notice naming the size used; the same rule SHALL apply to PDF. A `--scale` outside 1 to 8
or a `--size` outside 16 to 16 384 SHALL stay a usage error. Without a browser the export SHALL
fail with a message that says how to set one.

#### Scenario: Scale and transparency
- **WHEN** a 300 × 200 picture is exported with `--format png --scale 2 --background transparent`
- **THEN** the PNG is 600 × 400 with an alpha channel and a transparent corner

#### Scenario: Scale over the limit is clamped
- **WHEN** a 9000 × 2000 picture is exported with `--format png --scale 4`
- **THEN** it is captured at the scale 16384 / 9000 (about 1.82), 16384 pixels wide, and the notice names 16384 × 3641

#### Scenario: Scale outside the range
- **WHEN** a picture is exported with `--format png --scale 12`
- **THEN** the usage error says the scale takes 1 to 8, nothing is written and the exit code is 2
