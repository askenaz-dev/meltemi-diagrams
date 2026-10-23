# 0055. Exports take a default instead of asking, and effects can be seen

Status: accepted (export-defaults-and-visible-effects change, 23 October 2026). Revises decisions
0022 and 0026.

## Context

Decision 0026 made a video of effects that repeat forever, which is every `animate` block without
`repeat`, a usage error until a duration was given; a diagram without moving effects was refused
the same way. The command line and the playground refused, VS Code asked in an input box, and an
export profile without `duration` was `export.missing-duration`. The same kind of refusal blocked
a transparent MP4, at the command line and in profiles (`export.invalid-option`), and a picture or
video over the capture limit of 16384 pixels a side. On 2026-10-22 the owner hit the GIF question
and stated the rule: never block an action for the sake of it; pick a sensible default and say so.

The same export showed a second problem. A headless run proved the GIF sound (distinct frames, the
loop block, played by the browser) but its motion nearly invisible: decision 0022 coloured flow
particles and pulse halos with the target's own stroke, so a particle was a 5 px grey dot on a grey
line and a halo took the pale `#DCE5ED` border of a box on a near-white background. A particle also
drew above every relation, over the letters of its own label.

## Decision

- **A video without a duration lasts one loop of its effects.** `defaultMotionDuration(plan)` in
  `@meltemi/diagrams-motion`: the least common multiple of the effects' cycles after the longest
  delay, so a looping GIF is seamless (`motionLoop`); when that would pass 10 s, the longest cycle
  after that delay; 1 s for a diagram without moving effects. With the engine's defaults (flow
  1.2 s, dash and pulse 1 s, trace 1.5 s) any mix lasts 6 s. A given duration and the end of finite
  effects win. `produceExport` applies it for every host and profile, and `export.missing-duration`
  is gone.
- **What an export chose is said, not hidden.** `ExportOutput.notices` carries sentences in the
  interface language (the default duration, the longest cycle, a still diagram, the MP4 background,
  a clamped size). The command line prints them on stderr after `Wrote`, as `<file>: <notice>`; VS
  Code adds them to the message after the export and no longer asks; the playground adds them to
  its status line and shows the length an empty Duration field gives as its placeholder.
- **A transparent MP4 takes the theme's background**, at the command line and in profiles, which
  compile without a diagnostic. In the browser, whose encoders have no alpha, a transparent WebM
  takes it too, and the notice says the command line keeps it.
- **Over the limit, the largest that fits.** A PNG is captured at the largest scale that keeps each
  side within 16384 pixels (the exact ratio, so the long side is the limit), a PDF page and a video
  size shrink keeping their proportions. Values outside an option's range (`--scale` 1 to 8,
  `--size` 16 to 16384, a duration that does not parse) stay usage errors: that is validation of
  what was typed, not a block.
- **Particles and halos take the accent.** Flow particles, pulse halos and traces default to the
  theme's `accent`; a moving dash keeps its line's colour, since it animates the line. A particle is
  a disc of `max(4, 1.5 × width)` and rides inside its relation's group under the label, in the
  frame and the CSS profiles alike; `color` still overrides.

## Alternatives considered

- **A fixed default length (5 s):** it cuts most cycles mid-way, so the GIF jumps at its loop.
- **One cycle of the longest effect:** it cuts the others.
- **A single-frame video for a still diagram:** some players refuse to open it, and it differs per
  format.
- **Switching a transparent MP4 to WebM:** it changes the file the person asked for.
- **Sizing particles in output pixels:** the canvas and a 960 × 540 GIF would draw different
  pictures of one diagram.
- **A contrast rule choosing stroke or accent per theme:** the particles of one diagram would change
  colour with its palette.
- **Structured notice codes for the hosts to word:** nothing reacts to them; strings are enough.

## Consequences

- No export of the product stops for a value it can pick; every chosen value is named.
- Animated pictures change: particles and halos are blue in the default theme. No stored snapshot
  draws an animated frame, and the canvas and player browser suites check the new geometry.
- A 6 s default makes larger files than a 2 s one; `--duration` and the Duration field take any
  length, and the cap bounds the default at 10 s.
- New public surface: `defaultMotionDuration`, `motionLoop`, `DEFAULT_DURATION_CAP_MS` and
  `STILL_DURATION_MS` in the motion package, `ExportOutput` and its `notices` in the editor package.
  The language stays 0.2; `export.missing-duration` and the editor's refusals `endless`, `still`,
  `transparentMp4`, `tooLarge` and `videoSide` are gone.
