# Exports

[Español](../es/language/export.md)

Every diagram, story and set of effects can be written as SVG, PNG, PDF or an HTML player, from
the command line or the editor. An `export` profile names one delivery reproducibly: what it
exports, the format and every option, so `meltemi-diagrams export sheet.meltemi --profiles` writes
the same files on every machine with the same tools (decision 0025).

## From the command line

| Command                                                                         | Result                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `pnpm mdg export sheet.meltemi`                                                 | `sheet.svg` (see [svg-export.md](svg-export.md))           |
| `pnpm mdg export sheet.meltemi --format png`                                    | `sheet.png` at twice the size, with the theme's background |
| `pnpm mdg export sheet.meltemi --format png --scale 4 --background transparent` | a 4 × PNG on a transparent background                      |
| `pnpm mdg export sheet.meltemi --format png --size 1920x1080`                   | a 1920 × 1080 PNG with the picture fitted and centred      |
| `pnpm mdg export sheet.meltemi --format pdf`                                    | `sheet.pdf`, one vector page of the picture's size         |
| `pnpm mdg export sheet.meltemi --story tour --at 2s --format pdf`               | the frame of the story at 2 s                              |
| `pnpm mdg export sheet.meltemi --format html --story tour`                      | the story's player ([player.md](../player.md))             |
| `pnpm mdg export sheet.meltemi --diagram context --format html`                 | `sheet.context.html`, with every view it opens             |
| `pnpm mdg export sheet.meltemi --story tour --format mp4`                       | `sheet.tour.mp4`, 1920 × 1080 at 30 fps                    |
| `pnpm mdg export sheet.meltemi --format gif --duration 4s`                      | a looping GIF of the diagram's effects                     |
| `pnpm mdg export sheet.meltemi --profile slide`                                 | what the profile `slide` describes                         |
| `pnpm mdg export sheet.meltemi --profiles`                                      | every profile of the file                                  |

`--background` takes `transparent`, a colour token (`accent`, `canvas`, …) or a CSS colour, for
SVG, PNG and PDF; `--link <url>` makes the whole SVG or PDF picture a link. With profiles, the other
output options are refused (the profile has them) and `--out` names an existing folder.

## PNG and PDF

PNG and PDF are drawn by the installed Edge, Chrome or Chromium, driven headless over the DevTools
protocol: nothing is downloaded and no window opens. The browser is found in its usual place, or
named by `MELTEMI_BROWSER` (and, in VS Code, the `meltemi.export.browser` setting). Each export
line names the browser and its version, such as `Wrote sheet.png (Edg/155.0.4283.45)`, because the
proposal fixes reproducibility within a pinned environment rather than across browsers.

- **PNG.** The SVG with embedded fonts is drawn once the fonts and images are loaded, at a pixel
  scale (2 by default, 1 to 8) or a fixed `size`, with the theme's background, another colour, or a
  transparent one (with an alpha channel). A side may not exceed 16384 pixels.
- **PDF.** One page of the picture's size (or `size`), printed as vectors: fonts embedded, text
  selectable and tagged, `url` links as link annotations, the background unless it is transparent.

## Video and GIF

`--format mp4`, `webm` and `gif` record a story (`--story`) or a diagram's effects frame by frame:
each frame `i` is drawn at `i × 1000 / fps` ms by the player's own functions in a page of the
output size, after its fonts and images load, then captured by the browser and piped to FFmpeg. The
speed of the machine never changes the times: a 7.4 s story at 30 fps is 222 frames and lasts
7.4 s. FFmpeg is the system's (on the path, or `MELTEMI_FFMPEG`; never bundled); each export line
names the browser, FFmpeg's version and the frame count.

| Format | Default             | Encoder (decision 0026)                                                         |
| ------ | ------------------- | ------------------------------------------------------------------------------- |
| MP4    | 1920 × 1080, 30 fps | H.264 (libx264), CRF 18, yuv420p, fast start; always opaque                     |
| WebM   | 1920 × 1080, 30 fps | VP9 (libvpx-vp9), CRF 32; with an alpha channel when `--background transparent` |
| GIF    | 960 × 540, 15 fps   | a palette made for the clip, Bayer dithering, looping                           |

`--size`, `--fps` (1 to 60) and `--background` change them. A story lasts its own duration; a
diagram's effects last until the last one ends, or `--duration` says how long when one repeats
forever (the default for effects). `--at`, `--motion animated` and `--link` do not apply.

## Profiles

```text
export slide for checkout {
  format png
  scale 2
  background transparent
  file "slides/checkout.png"
}

export frame for purchase {
  format pdf
  at 4.8s
  link "purchase.purchase.html"   // the frame leads to the story's player
}

export presentation for purchase {
  format mp4
  size (1920, 1080)
  fps 30
}
```

| Option                      | Formats                  | Values                                                                                                      |
| --------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `format`                    | all                      | `svg`, `png`, `pdf`, `html`, `mp4`, `webm`, `gif`; required                                                 |
| `size`                      | png, pdf, mp4, webm, gif | `(w, h)`, 16 to 16384; the picture is fitted and centred                                                    |
| `scale`                     | png                      | 1 to 8; 2 by default                                                                                        |
| `background`                | svg, png, pdf, webm, gif | `transparent`, a quoted colour or a colour token; MP4 has no transparency                                   |
| `at`                        | svg, png, pdf            | a time; without it the static view of a diagram or the end of a story                                       |
| `motion`                    | svg                      | `static` or `animated`; diagrams only                                                                       |
| `theme`                     | all                      | a theme name                                                                                                |
| `fonts`                     | svg, html                | `embedded` (default), `outlined`, `system`                                                                  |
| `scenario`                  | all                      | a scenario of the sequence diagram                                                                          |
| `link`                      | svg, pdf                 | an `https:`, `http:` or `mailto:` URL, or a relative one                                                    |
| `fps`                       | mp4, webm, gif           | 1 to 60; 30 by default                                                                                      |
| `duration`                  | mp4, webm, gif           | a time; required when the diagram's effects repeat forever                                                  |
| `file`                      | all                      | a path relative to the file, without `..`, ending in the format's extension; `<stem>.<id>.<ext>` by default |
| `autoplay`, `loop`, `embed` | html                     | player options ([player.md](../player.md))                                                                  |

The target is a diagram of the file, an imported diagram or a story of the file. Profile ids share
the file namespace.

| Code                      | When                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `export.unknown-target`   | the target is not a diagram or story of the file or an import                                                                                   |
| `export.missing-format`   | the profile has no `format`                                                                                                                     |
| `export.invalid-option`   | an option of another format; transparency in MP4; `motion` or `scenario` on a story; `at` past the story's end; a `file` with another extension |
| `export.missing-duration` | a video of a diagram whose effects repeat forever, or that has none, without `duration`                                                         |
| `prop.invalid-value`      | a malformed value, an unsafe link or a `file` outside the folder                                                                                |

## Links

Elements of every profile, groups and model entities take `url "https://…"` (also `http:`,
`mailto:` and relative URLs; any other scheme is refused). The SVG wraps the element's drawing in
`<a href>`; PDF keeps it as a link annotation and the HTML player as a link. In the HTML player a
click selects the element and its panel offers **Open link**; Ctrl or Cmd and a click follows it.
The canvas never follows them: a click there selects.

## In the editor

VS Code has **Export SVG**, **Export PNG**, **Export PDF**, **Export HTML Player** and **Run Export
Profile** (all profiles, or one); completion, hover and the outline know profiles and their options,
and the inspector edits `url` ([editor.md](../editor.md)).
