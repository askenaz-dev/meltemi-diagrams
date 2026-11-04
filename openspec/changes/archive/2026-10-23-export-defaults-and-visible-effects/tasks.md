## 1. The default duration (`packages/motion`, `packages/editor`)

- [x] 1.1 `packages/motion/src/plan.ts`: `defaultMotionDuration(plan)` (lcm of the cycles plus the longest delay, cap 10 s, longest cycle above the cap, 1 s without effects), exported from the package; tests in `test/motion.test.ts`: flow + pulse → 6000, flow + dash + trace → 6000, 700 + 1000 → 7000, 1100 + 1300 → 1300, a delay added, a finite plan untouched, no effects → 1000
- [x] 1.2 `packages/editor/src/exports.ts`: `produceExport` takes `request.durationMs ?? motionDuration ?? defaultMotionDuration` (0 as absent), `ExportOutput.notices` with `defaultDuration`/`stillDuration` from `messages/en.ts` and `es.ts` `exports.notices`; `endless` and `still` removed; tests in `test/exports.test.ts`: a GIF request without duration on a diagram with `animate pay { effect flow }` and `animate api { effect pulse }` gets `durationMs` 6000 and the notice, a diagram without effects gets 1000 and its notice, a given duration wins; `test/messages.test.ts` parity
- [x] 1.3 `packages/cli/src/export-command.ts`: the notices printed on stderr after `Wrote`; test in `packages/cli/test/capture.test.ts`: `export --format gif` without `--duration` on a flow and a pulse (the corpus `effects.meltemi` passes the cap: 2.3 s) writes the file, FFmpeg counts 90 frames, stderr holds the notice; a profile without `duration` takes it; a transparent MP4 is written with its notice; `--duration soon` and `--scale 12` stay usage errors with exit code 2

## 2. The hosts stop asking

- [x] 2.1 `packages/vscode/src/extension/commands.ts` `exportVideo`: no input box, the notices in the message after the export; `durationPrompt` and `durationInvalid` removed from `messages/en.ts` and `es.ts`; `writtenMessage` in `extension/written.ts` with a unit test in `packages/vscode/test/unit/written.test.ts` (the message names the duration), and a case of `packages/vscode/test/vscode/suite.cjs`: Export Video of a diagram without `durationMs` writes the GIF without asking
- [x] 2.2 `packages/playground/src/exports/dialog.ts`: the Duration field's placeholder shows the default computed with `defaultMotionDuration` from the dialog's document ("6s, one cycle of the effects"; the story's length for stories; "1s, no moving effects"), the notices shown under the success message; `messages/en.ts` and `es.ts`; a browser scenario in `packages/playground/test/browser/run.ts` next to "records GIF, WebM and MP4 from a story": a diagram with `animate pay { effect flow }` exported as GIF with Duration empty, the placeholder read, ffprobe counting 90 frames and the hashes of three decoded frames distinct
- [x] 2.3 `packages/model/src/export.ts`: `export.missing-duration` no longer reported, `messages` `en`/`es`, `docs/language/diagnostics` tables regenerated if they list it; `test/export.test.ts`: a video profile without duration compiles clean; the MP4 transparency diagnostic of profiles removed too; the invalid corpus entry for the code removed (conformance reads the corpus) and the file count of `packages/cli/test/cli.test.ts` updated

## 3. Background and size defaults

- [x] 3.1 `packages/editor/src/exports.ts`: MP4 with `background transparent` takes the theme's background with the `mp4Background` notice, `transparentMp4` removed; `packages/playground/src/exports/dialog.ts` no longer refuses it (`mp4Transparent` removed); tests in `test/exports.test.ts` and a browser scenario checking the message after an MP4 download with `transparent`
- [x] 3.2 `packages/editor/src/exports.ts`: PNG/PDF scale and size, and video size, clamped to `MAX_PIXELS` keeping proportions with the `clamped` notice, `tooLarge` and `videoSide` removed; the option ranges of the CLI and the dialog unchanged; tests: a 9000 × 2000 picture at scale 4 captured at 16 384 wide with scale 1.82, a video size 20000 × 10000 scaled to 16 384 × 8192, `--scale 12` still a usage error

## 4. Visible effects (`packages/motion`)

- [x] 4.1 `src/plan.ts`: flow and pulse without `color` take the accent (dash keeps the stroke); `src/geometry.ts` `particleRadius` = `max(4, 1.5 × width)`; `css.ts` and `frames.ts` checked to share it; tests in `test/motion.test.ts`: the plan's colours under `technical.light` for flow, pulse, dash and trace, `color danger` winning, the radius for widths 1, 1.3 and 4, the CSS and frame profiles drawing the same radius, particles under their relation's label in both profiles; a sequence participant's pulse coloured with the accent; `motionLoop` and the `longestDuration` notice for a loop past the cap
- [x] 4.2 Snapshots regenerated and looked at: `packages/render/test/corpus.test.ts` (`corpus/valid/**` with effects), `packages/render/test/examples.test.ts`, `packages/acceptance/test/corpus.test.ts`, `pnpm acceptance:visual --update`, `pnpm gallery`; the webview and playground screenshots that show effects compared before and after

## 5. Documentation and decision

- [x] 5.1 `docs/language/export.md` (durations, MP4 background, clamping, notices), `docs/language/motion.md` (particle size, accent default, under the label), `docs/playground.md` (the Duration placeholder, transparent videos), the Export Video row of `docs/editor.md`, `docs/language/diagnostics.md`, and their `docs/es` copies; `docs/cli.md` links to export.md and needs nothing; the skill's `reference/language.md` and `pnpm skills:sync`; `pnpm docs` checks pass
- [x] 5.2 `CHANGELOG.md` 1.10.0: an "Exports" entry for the defaults and a "Motion" entry for the visible effects, saying why the animated pictures changed
- [x] 5.3 `docs/decisions/0055-export-defaults-and-visible-effects.md` (context, decision, alternatives, consequences), linked from `0022-motion-effects.md` and `0026-video-export.md`

## 6. Gates

- [x] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`
- [x] 6.2 `pnpm playground:test-browser` with the new scenarios, and a look at a GIF it writes
