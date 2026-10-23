## 1. The default duration (`packages/motion`, `packages/editor`)

- [ ] 1.1 `packages/motion/src/plan.ts`: `defaultMotionDuration(plan)` (lcm of the cycles plus the longest delay, cap 10 s, longest cycle above the cap, 1 s without effects), exported from the package; tests in `test/motion.test.ts`: flow + pulse → 6000, flow + dash + trace → 6000, 700 + 1000 → 7000, 1100 + 1300 → 1300, a delay added, a finite plan untouched, no effects → 1000
- [ ] 1.2 `packages/editor/src/exports.ts`: `produceExport` takes `request.durationMs ?? motionDuration ?? defaultMotionDuration` (0 as absent), `ExportOutput.notices` with `defaultDuration`/`stillDuration` from `messages/en.ts` and `es.ts` `exports.notices`; `endless` and `still` removed; tests in `test/exports.test.ts`: a GIF request without duration on a diagram with `animate pay { effect flow }` and `animate api { effect pulse }` gets `durationMs` 6000 and the notice, a diagram without effects gets 1000 and its notice, a given duration wins; `test/messages.test.ts` parity
- [ ] 1.3 `packages/cli/src/export-command.ts`: the notices printed on stderr after `Wrote`; test in `packages/cli/test/export.test.ts`: `export --format gif` without `--duration` on `corpus/valid/motion/effects.meltemi` writes the file, FFmpeg counts 90 frames, stderr holds the notice; `--duration soon` stays a usage error with exit code 2

## 2. The hosts stop asking

- [ ] 2.1 `packages/vscode/src/extension/commands.ts` `exportVideo`: no input box, the notices in the message after the export; `durationPrompt` and `durationInvalid` removed from `messages/en.ts` and `es.ts`; unit test in `packages/vscode/test/unit` with a fake host: a diagram export never calls `showInputBox` and the message names the duration
- [ ] 2.2 `packages/playground/src/exports/dialog.ts`: the Duration field's placeholder shows the default computed with `defaultMotionDuration` from the dialog's document ("6s, one cycle of the effects"; the story's length for stories; "1s, no moving effects"), the notices shown under the success message; `messages/en.ts` and `es.ts`; a browser scenario in `packages/playground/test/browser/run.ts` next to "records GIF, WebM and MP4 from a story": a diagram with `animate pay { effect flow }` exported as GIF with Duration empty, the placeholder read, ffprobe counting 90 frames and the hashes of three decoded frames distinct
- [ ] 2.3 `packages/model/src/export.ts`: `export.missing-duration` no longer reported, `messages` `en`/`es`, `docs/language/diagnostics` tables regenerated if they list it; `test/export.test.ts`: a video profile without duration compiles clean; the invalid corpus entry for the code removed and `pnpm conformance` regenerated

## 3. Background and size defaults

- [ ] 3.1 `packages/editor/src/exports.ts`: MP4 with `background transparent` takes the theme's background with the `mp4Background` notice, `transparentMp4` removed; `packages/playground/src/exports/dialog.ts` no longer refuses it (`mp4Transparent` removed); tests in `test/exports.test.ts` and a browser scenario checking the message after an MP4 download with `transparent`
- [ ] 3.2 `packages/editor/src/exports.ts`: PNG/PDF scale and size, and video size, clamped to `MAX_PIXELS` keeping proportions with the `clamped` notice, `tooLarge` and `videoSide` removed; the option ranges of the CLI and the dialog unchanged; tests: a 9000 × 2000 picture at scale 4 captured at 16 384 wide with scale 1.82, a video size 20000 × 10000 scaled to 16 384 × 8192, `--scale 12` still a usage error

## 4. Visible effects (`packages/motion`)

- [ ] 4.1 `src/plan.ts`: flow and pulse without `color` take the accent (dash keeps the stroke); `src/geometry.ts` `particleRadius` = `max(4, 1.5 × width)`; `css.ts` and `frames.ts` checked to share it; tests in `test/motion.test.ts`: the plan's colours under `technical.light` for flow, pulse, dash and trace, `color danger` winning, the radius for widths 1, 1.3 and 4, the CSS and frame profiles drawing the same radius; a sequence participant's pulse coloured with the accent
- [ ] 4.2 Snapshots regenerated and looked at: `packages/render/test/corpus.test.ts` (`corpus/valid/**` with effects), `packages/render/test/examples.test.ts`, `packages/acceptance/test/corpus.test.ts`, `pnpm acceptance:visual --update`, `pnpm gallery`; the webview and playground screenshots that show effects compared before and after

## 5. Documentation and decision

- [ ] 5.1 `docs/language/export.md` (durations, MP4 background, clamping, notices), `docs/language/motion.md` (particle size, accent default), `docs/cli.md`, `docs/playground.md` (the Duration placeholder), and their `docs/es` copies; `pnpm docs` checks pass
- [ ] 5.2 `CHANGELOG.md` 1.10.0: an "Exports" entry for the defaults and a "Motion" entry for the visible effects, saying why the animated pictures changed
- [ ] 5.3 `docs/decisions/0055-export-defaults-and-visible-effects.md` (context, decision, alternatives, consequences), linked from `0022-motion-effects.md` and `0026-video-export.md`

## 6. Gates

- [ ] 6.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`
- [ ] 6.2 `pnpm playground:test-browser` with the new scenarios, and a look at a GIF it writes
