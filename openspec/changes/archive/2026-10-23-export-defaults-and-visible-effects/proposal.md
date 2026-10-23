## Why

Exporting a diagram with effects as a GIF, WebM or MP4 stops at a question the tool could answer
itself: every effect repeats forever unless `repeat` says otherwise, so the motion plan has no
end, and `produceExport` refuses with "The effects of `x` repeat forever; give the video a
duration" (`packages/editor/src/exports.ts`); a diagram without moving effects is refused the same
way, with the opposite reason. VS Code asks in an input box, the command line and the playground
refuse, and an export profile without `duration` is `export.missing-duration`. The same shape of
refusal blocks a transparent MP4 ("MP4 has no transparency; choose a colour, or WebM") and a
picture or video larger than the capture limit. The owner's rule, stated on 2026-10-22 after
hitting the GIF question: never block an action for the sake of it; pick a sensible default and
say so. And once the GIF is made, its motion can hardly be seen: a flow particle is a dot of three
scene units in the relation's own grey stroke, and a pulse halo takes the element's border colour,
`#DCE5ED` on a near-white background in `technical.light`, so a 960 × 540 GIF looks still. This
change gives every refusal of that kind a default, and makes particles and halos visible wherever
effects play. Post-1.0 change, outside the roadmap; it builds on `motion-effects`, `video-export`,
`raster-and-print`, `export-profiles` and `playground-exports`.

## What Changes

- **A video takes a default duration.** `defaultMotionDuration(plan)` in
  `@meltemi/diagrams-motion` gives the least common multiple of the effects' cycles (each
  duration, after the longest delay), capped at 10 s, so the loop is seamless; above the cap, the
  longest cycle; with the engine's defaults (flow 1200 ms, dash and pulse 1000 ms, trace 1500 ms)
  that is 6 s. A diagram without moving effects takes 1 s. `produceExport` uses it when no
  duration is given: the command line without `--duration`, VS Code without asking, the playground
  with the default greyed in its Duration field, and export profiles without `duration`, whose
  `export.missing-duration` goes. A given duration always wins. The refusals `endless` and `still`
  go, and VS Code's duration prompt with them.
- **A transparent MP4 takes the theme's background.** Instead of refusing, the export uses the
  theme's background and the status line, the command line and the dialog say so.
- **A picture or video over the capture limit is clamped.** A PNG or PDF whose side would exceed
  16 384 pixels is captured at the largest scale that fits, and a video at the largest size that
  keeps its proportions, with a notice naming the size used. Values typed out of the option
  ranges (`--scale` 1 to 8, `--size` from 16 to the limit, a bad duration string) stay usage
  errors: that is input validation, not a block.
- **Particles and halos take the accent.** The default colour of flow particles and pulse halos
  becomes the effective theme's `accent`, as trace already does; `color` still overrides it. The
  particle radius grows to `max(4, 1.5 × width)` scene units. The CSS profile and the frame
  profile draw the same geometry, so the canvas, the animated SVG, the players and the videos agree;
  sequence participants, whose heads are stroked with the pale `line` token, get a visible pulse
  by the same rule.
- **Documentation.** `docs/language/export.md` and `docs/language/motion.md` in English and
  Spanish, `docs/cli.md`, `docs/playground.md`, the changelog's 1.10.0 section, decision 0055.

## Non-goals

- The Effects title row and the play-by-default of the canvas belong to `canvas-feel-and-naming`;
  the sequence head bounds the pulse halo follows too.
- Entities and routes of C4 views belong to `c4-entities-and-routes`; project icons to
  `custom-icons`.
- The delivery change owns the pipelines and the release of what this change ships.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `video-export`: a duration default for endless and still effects instead of a usage error, a
  transparent MP4 drawn over the theme's background, a video over the limit clamped.
- `motion-effects`: flow particles and pulse halos default to the theme's accent; the particle
  radius.
- `raster-and-print`: a PNG or PDF over the limit captured at the largest scale that fits, with a
  notice.
- `export-profiles`: a video profile without `duration` takes the default; `export.missing-duration`
  is no longer reported.
- `playground-exports`: the Duration field shows the default greyed, MP4 with a transparent
  background takes the theme's background with a notice, sizes are clamped.

## Impact

- `packages/motion`: `plan.ts` (`defaultMotionDuration`, the colour rule of `planMotion`),
  `geometry.ts` (`particleRadius`), `css.ts` and `frames.ts` (the same radius in both profiles);
  `test/motion.test.ts`.
- `packages/model`: `export.ts` (no `export.missing-duration`), messages `en`/`es`;
  `test/export.test.ts`.
- `packages/editor`: `exports.ts` (`produceExport`: default duration, background fallback,
  clamping, the notices in `ExportOutput`), messages `en`/`es`; `test/exports.test.ts`.
- `packages/cli`: `export-command.ts` prints the notices; `test/export.test.ts`.
- `packages/vscode`: `extension/commands.ts` (`exportVideo` without the prompt), messages
  `en`/`es`; `test/unit`.
- `packages/playground`: `exports/dialog.ts` (the Duration placeholder, no `mp4Transparent`
  refusal, the notices), messages `en`/`es`; `test/browser/run.ts`.
- Snapshots: `corpus/valid/**/*.svg` with effects, `corpus/acceptance/visual`, `gallery/`,
  `examples/purchase/exports`.
- `docs/language/export.md`, `docs/language/motion.md`, `docs/cli.md`, `docs/playground.md` and
  their `docs/es` copies, `CHANGELOG.md`, `docs/decisions/0055-*.md`.
