# raster-and-print Specification

## Purpose
PNG and PDF exports drawn by the installed Chromium browser over the DevTools protocol, from the command line and the editor.
## Requirements
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

### Requirement: PDF
PDF exports SHALL be printed by the same browser as vectors on one page of the picture's size (or
`size`), with fonts embedded, selectable text, link annotations for URLs and the background unless
it is transparent.

#### Scenario: Page size and links
- **WHEN** a diagram with an element `url "https://example.com"` is exported as PDF
- **THEN** the page is the picture's size and carries a link annotation to `https://example.com`

### Requirement: Export from the editor
VS Code SHALL offer **Export PNG**, **Export PDF** and **Run Export Profile**, written beside the
file with the same capture code.

#### Scenario: Profile from the palette
- **WHEN** **Run Export Profile** picks `slide`
- **THEN** the profile's PNG is written beside the file

