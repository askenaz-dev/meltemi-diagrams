## Context

`produceExport` in `packages/editor/src/exports.ts` is the one export path of the command line,
VS Code and the playground. For a video of a diagram it builds the effects document
(`effectsDocument` in `packages/player/src/document.ts`), whose root view's `durationMs` comes from
`motionDuration(plan)` (`packages/motion/src/plan.ts`): `null` when any effect has
`repeat forever`, which is the default of every `animate` block, and `0` when the plan has no
effect. Without `request.durationMs` the function answers `{ problem }` with `endless` or `still`
(`messages/en.ts` `exports`), and the hosts show it: the command line as an error, the playground
in the dialog's problem line, VS Code after asking for a duration in an input box
(`extension/commands.ts` `exportVideo`). Export profiles report `export.missing-duration` at
compile time (`packages/model/src/export.ts`). The same function refuses `transparentMp4` when the
format is MP4 and the background `transparent`, and `tooLarge` or `videoSide` when a side would
exceed `MAX_PIXELS` (16 384); the playground's dialog repeats the MP4 refusal before sending
(`exports/dialog.ts`). Decision 0026 chose those refusals.

The motion plan (`planMotion`) colours each effect with `strokeOf(group)`, the first stroked item of
the target's group, and only a trace falls back to the accent; `particleRadius(width)` in
`geometry.ts` is `max(3, width + 1.5)`, used by both the CSS profile (`css.ts`) and the frame
profile (`frames.ts`); the pulse halo is a path 2 units wide at `HALO.width`, scaled by 15 % and
faded over the cycle. A headless export on 2026-10-22 showed the GIF pipeline sound (45 distinct
frames, the `NETSCAPE2.0` loop, played by Edge) and the motion nearly invisible: a 5 px grey dot on
a 1 px grey line, a halo in `#DCE5ED` on `#F7FBFF`.

## Goals / Non-Goals

**Goals:**

- No export of this product refuses because a value it can pick is missing: duration, background,
  scale and size take defaults, and the person is told which.
- The default duration gives a seamless loop and the same video from every host.
- Flow particles and pulse halos are visible on every theme, in the canvas, the animated SVG, the
  players and the videos, with the same geometry in the CSS and frame profiles.

**Non-Goals:**

- Changing the `animate` language or its defaults for `repeat`, `delay` and the durations.
- Sizing effects in output pixels: the canvas at 60 fps and a 960 × 540 GIF would then draw
  different pictures of one diagram.
- New export formats or options.

## Decisions

### The default duration is the least common multiple of the cycles, capped

`defaultMotionDuration(plan): number` in `packages/motion/src/plan.ts`, beside `motionDuration`:
for the effects of the plan, the cycle lengths are their `durationMs`; the default is their least
common multiple plus the longest `delayMs`, rounded to whole milliseconds, capped at `10_000`;
when the multiple exceeds the cap, the longest cycle plus the longest delay; a plan without effects
gives `1000`. With the engine's defaults, flow and pulse give lcm(1200, 1000) = 6000 ms; flow,
dash and trace give lcm(1200, 1000, 1500) = 6000 ms; a `duration 700ms` with a `1000ms` gives
7000 ms; 1100 and 1300 ms exceed the cap and give 1300 ms. A finite plan (every effect with a
numeric `repeat`) keeps `motionDuration`. Alternatives: (a) a fixed 5 s, which cuts most cycles
mid-way and makes the GIF jump at the loop point; (b) one cycle of the longest effect, which cuts
the others; (c) the cap alone. The multiple is what makes a looping GIF look continuous, and the
cap keeps a 1100 × 1300 pathological pair from a 1.4-minute video. Recommendation: the multiple
with the cap.

### A still diagram gets one second, not a refusal

A diagram without moving effects exported as a video takes 1 s of identical frames (15 frames of
GIF, 30 of MP4). Alternatives: (a) refuse as today, which blocks a format the person chose on
purpose; (b) a single-frame GIF and a one-frame MP4, which some players refuse to open and which
differs per format. Recommendation: one second, the same in every format, with the notice "`x`
has no moving effects; the video lasts 1 s".

### Every host takes the default from `produceExport`

`produceExport` computes `duration = request.durationMs ?? motionDuration(plan) ??
defaultMotionDuration(plan)` (with `0` treated as absent) and reports the chosen default in a new
`ExportOutput.notices: readonly string[]` beside the existing fields, in the interface language;
`motionLoop(plan)` (the common multiple, or null past the cap) tells a seamless loop from the
longest-cycle fallback, which gets its own notice, so the text never claims a loop it is not.
The command line prints each notice on stderr after `Wrote`, as `<file>: <notice>`; VS Code
appends them to the message after the export (`writtenMessage` in `extension/written.ts`, a module
without `vscode` so a unit test reads it) and stops asking (`durationPrompt` and `durationInvalid`
go from its catalogue; `exportVideo(host, document, format, target, durationMs?)` keeps its
optional argument for profiles and callers); the playground's dialog shows the default as the
Duration field's greyed placeholder, computed by the same functions from the dialog's analysis
("6s, one loop of the effects", "2.3s, the longest cycle of the effects", "1s, no moving effects",
the story's length from `storyTimeline`), and appends the notices to its status message. Export profiles: `analyzeExport` in
`packages/model/src/export.ts` stops reporting `export.missing-duration`, and `effectsEnd` stays as
the profile's own duration when written. Alternatives: each host picking its own default (three
rules to keep equal); a default written into the profile by the editor (compiling never modifies
the file). Recommendation: one function, one notice.

### A transparent MP4 takes the theme's background

When `format` is `mp4` and `background` is `transparent`, `produceExport` uses the theme's
background (the `background` token of the layout's theme, as `decorate` resolves it) and adds the
notice "MP4 has no transparency: the theme's background was used". The command line's usage
refusal, the playground dialog's refusal and the profile diagnostic (`mp4Transparency` under
`export.invalid-option`) go with it, so a profile asking for it compiles and runs the same way.
The browser's WebCodecs encoders have no alpha either, so the playground draws a transparent WebM
over the theme's background too, with a notice that the command line keeps it transparent; the
command line's WebM stays transparent. Alternatives: switch the format to WebM, which changes
the file the person asked for; keep refusing. Recommendation: the theme's background, since it is
what the person sees on the canvas.

### Sizes over the limit are clamped, typed values are still validated

For PNG, when `width × scale` or `height × scale` would exceed `MAX_PIXELS`, the scale becomes
the exact largest value that fits (16384 / 9000 for a 9000-wide picture, so the long side is the
limit), and a notice names the pixel size used; a PDF, captured at scale 1, gets a page scaled down
keeping its proportions, into which the picture is fitted. For videos, a `size` whose
side exceeds the limit is scaled down the same way (MP4 keeps even sides). The option ranges stay:
`--scale` 1 to 8, `--size` from 16 to the limit, `--fps` 1 to 60, a duration up to 600 s; a value
outside them is a usage error, as a mistyped number is. Alternatives: refuse as today; silently
clamp. Recommendation: clamp and say so.

### Particles and halos default to the accent; the particle grows

In `planMotion` the colour of a `flow` or `pulse` effect without `color` becomes the accent
(`options.colors.accent`, else `#1f6feb`), as a trace's already is; `dash` keeps the line's own
stroke, since it animates the line itself. `particleRadius(width)` becomes
`Math.max(4, 1.5 * width)`, used by `css.ts` and `frames.ts` alike; the halo keeps `HALO`
(width 2, scale 0.15, opacity 0.7). A larger, saturated particle crossing its own label covered its
letters in the first pictures, so particles move from the overlay group into their relation's
group, before its label (`beforeLabel`, as traces already were), in both profiles; their class
takes `pointer-events: none` as the overlay group does. The `color` property, a token or a quoted colour, still
overrides. Alternatives: (a) a minimum size in output pixels, rejected as a non-goal; (b) a
contrast rule choosing between stroke and accent per theme, which would make one diagram's
particles change colour with its theme's palette; (c) keep the stroke and widen the particle only,
which stays grey on grey. Recommendation: the accent, as trace, with the larger particle. Every
corpus, gallery and acceptance picture with effects is regenerated.

### The notices are strings of the interface language

`ExportOutput.notices` carries sentences built from the editor's catalogue (`exports.notices`:
`defaultDuration(id, ms)`, `longestDuration(id, ms)`, `stillDuration(id, ms)`, `mp4Background`,
`clamped(width, height, limit)`), not codes; the playground's own `webmBackground` joins them: the hosts show them as they are. Alternative: a structured `{ code, data }` per notice
for the hosts to word; nothing needs to react to them. Recommendation: strings.

## Risks / Trade-offs

- [A 6 s default makes bigger files than a 2 s one] → the notice names the duration, the
  Duration field of the playground and the `--duration` option still take any value, and the cap
  bounds the worst case at 10 s.
- [The accent on particles changes every existing animated picture] → the snapshots of the
  corpus, the gallery and the acceptance references are regenerated in one task, and the
  change log says why the pictures moved.
- [A theme whose accent is close to its connector colour] → the particle is wider than the line
  and the halo is 2 units wide outside the box; the `color` property remains for a theme that
  wants another colour.
- [Clamping a size hides a typo] → the notice names the size that was used and the limit.
- [`export.missing-duration` was a diagnostic some corpus files expect] → the invalid corpus
  entries for it are removed with the diagnostic, and the conformance list is regenerated.
