# Office applications

Exports end up in slides and documents more often than in browsers. Office applications cannot be
driven by a test, so their checks are done by hand with a kit of files, and the results are kept
here. The browsers are checked automatically: see [browsers.md](browsers.md).

## Making the kit

```bash
pnpm verification:kit kit
```

The command exports the purchase reference example into `kit/` (any folder name works):

| File                  | What it is                                                                    |
| --------------------- | ----------------------------------------------------------------------------- |
| `purchase-slide.svg`  | The executive slide (1280 × 720) with embedded fonts, linked to the kit's URL |
| `purchase-slide.png`  | The same slide at twice the pixels (2560 × 1440), on a transparent background |
| `purchase-slide.pdf`  | The same slide as a vector page with embedded fonts and the link              |
| `purchase-story.html` | The animated story in the HTML player, one file that works offline            |
| `purchase-story.mp4`  | The story as H.264 video, 1920 × 1080 at 30 frames per second                 |
| `purchase-story.webm` | The story as VP9 video, 1920 × 1080 at 30 frames per second                   |
| `purchase-story.gif`  | The story as an animated GIF, 960 × 540 at 15 frames per second               |
| `checklist.md`        | The checklist below, with the date and the browser that captured the files    |

The videos need FFmpeg; without it the kit has the first four files and says so. The link of the
SVG and the PDF is `https://example.com/meltemi/purchase`.

## Checklist

Go through each check for each file in each application, and write the result in the results table:
**pass**, **fail** with what went wrong, or **n/a** when the application does not take the format.

1. **Insert.** The file goes in by the application's own insert command (Insert › Pictures, Insert ›
   Video, drag and drop) without an error or a conversion prompt.
2. **Size.** Inserted at 100 %, the picture keeps its proportions (16:9 for the slide and the story)
   and fills a 16:9 slide edge to edge when stretched to the slide's width.
3. **Scale.** Scaled up to four times, SVG and PDF stay sharp (vector); PNG stays sharp up to twice.
   Scaled down to a thumbnail, the text stays readable down to the size the application shows.
4. **Fonts.** The title "From click to confirmed order" shows in Inter as in the export, not in a
   substitute font, also on a computer where Inter is not installed: SVG and PDF carry the font,
   PNG and the videos carry pixels.
5. **Transparency.** On a coloured slide background, the PNG shows the background around the
   drawing; SVG and PDF draw the canvas they were exported with.
6. **Links.** In the slide show (or the PDF reader), clicking the SVG or PDF picture opens the kit's
   URL, where the application supports links on pictures.
7. **Playback.** In the slide show, MP4 and WebM play from start to end without a black frame;
   the GIF animates and loops; the HTML player plays, pauses and answers the keyboard where the
   application can show web content (otherwise **n/a**).
8. **Saving.** After saving, closing and opening the presentation again, every inserted file is
   still there, and still passes checks 2 to 7.

## Results

The owner fills in a row per application, version and format; one cell per check, in the
checklist's order. A failure points at what went wrong.

| Application   | Version | Format | 1. Insert | 2. Size | 3. Scale | 4. Fonts | 5. Transparency | 6. Links | 7. Playback | 8. Saving | Date | Notes |
| ------------- | ------- | ------ | --------- | ------- | -------- | -------- | --------------- | -------- | ----------- | --------- | ---- | ----- |
| PowerPoint    |         | SVG    |           |         |          |          |                 |          | n/a         |           |      |       |
| PowerPoint    |         | PNG    |           |         |          |          |                 | n/a      | n/a         |           |      |       |
| PowerPoint    |         | PDF    |           |         |          |          |                 |          | n/a         |           |      |       |
| PowerPoint    |         | MP4    |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| PowerPoint    |         | WebM   |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| PowerPoint    |         | GIF    |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| PowerPoint    |         | HTML   |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| Keynote       |         | SVG    |           |         |          |          |                 |          | n/a         |           |      |       |
| Keynote       |         | PNG    |           |         |          |          |                 | n/a      | n/a         |           |      |       |
| Keynote       |         | PDF    |           |         |          |          |                 |          | n/a         |           |      |       |
| Keynote       |         | MP4    |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| Keynote       |         | WebM   |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| Keynote       |         | GIF    |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| Keynote       |         | HTML   |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| Google Slides |         | SVG    |           |         |          |          |                 |          | n/a         |           |      |       |
| Google Slides |         | PNG    |           |         |          |          |                 | n/a      | n/a         |           |      |       |
| Google Slides |         | PDF    |           |         |          |          |                 |          | n/a         |           |      |       |
| Google Slides |         | MP4    |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| Google Slides |         | WebM   |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| Google Slides |         | GIF    |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |
| Google Slides |         | HTML   |           |         | n/a      |          | n/a             | n/a      |             |           |      |       |

## What to expect

These expectations come from the formats; the table above confirms or corrects them on real
versions of the applications.

- Slide applications insert pictures and videos from files; whether a format goes in at all (SVG,
  PDF, WebM) depends on the application and its version, which is why each has a row.
- Google Slides takes video only from Google Drive or YouTube: MP4 and WebM are uploaded to Drive
  first, and the result is recorded against that path.
- No slide application runs the HTML player inside a slide: it is shared as a file or a link, or
  pasted into a page with `--embed` ([player](../player.md)), so its row records opening the file
  from the application.
