# Validation

Run on 4 November 2026 in the worktree of branch `stories-player-and-stills`, from `origin/main`
at `c291eda`, on Windows 11 with the installed Edge and FFmpeg.

## Gates

| Check                                                    | Result                                                  |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm typecheck`                                         | green                                                   |
| `pnpm lint`                                              | green                                                   |
| `pnpm test`                                              | 336 files, 9976 passed, 1 skipped; a second run, see below |
| `pnpm player:test-browser`                               | 33 passed, 0 failed (6 new scenarios), run twice        |
| `pnpm playground:test-browser`                           | 106 passed, 0 failed (5 new scenarios), run twice       |
| `pnpm vscode:test-webview`                               | 271 passed, 0 failed (1 new scenario, 2 extended), run twice |
| `pnpm catalog:test-browser`                              | 14 passed, 0 failed                                     |
| `pnpm vscode:test`                                       | 24 passed, 0 failed (2 new); a first run failed 1, see below |
| `pnpm vscode:package`                                    | 416 files, contents as expected                         |
| `pnpm acceptance:visual`                                 | 36 passed, 0 failed (Edg/156.0.4314.58)                 |
| `pnpm licenses:inventory --check`                        | current (40 packages)                                   |
| `pnpm conformance`                                       | the implementation conforms (every case passes)         |
| `pnpm verification:browsers --only Edge`                 | 19 checks passed (Edge 156.0.4314.58)                   |
| `openspec validate "stories-player-and-stills" --strict` | valid                                                   |

The CLI's browser tests (`packages/cli/test/story.test.ts`, `export.test.ts`,
`packages/capture/test/capture.test.ts`) ran with the installed Edge inside `pnpm test`: none was
skipped. The known timing-flaky scenarios did not fail (`explorer: hides to a rail` passed in the
playground suite; the cloud reconnect scenario belongs to `pnpm cloud:test-browser`, which this
change does not touch and which was not run).

- `pnpm vscode:test`: the first run failed the new "Export HTML Player offers every story…" on its
  second half: the test called the command on a file it had written but not opened, and the
  command finds its document among the open ones. The test now opens it; the second run passed 24
  of 24. It ran on the VS Code the main checkout had downloaded, through a junction at
  `packages/vscode/.vscode-test` (ignored by Git); nothing was downloaded.
- `pnpm test`, run again after the last changes: 335 files and 9975 tests passed, 1 skipped, and
  one failure, `automatic-release.test.ts` "a higher declaration opens a new base…", a timeout at
  30 s under the load of the whole suite (it runs Git in a fixture repository; this change touches
  no release code). Run alone it passed, 24 of 24; the first full run had passed it.
- The player, webview and web app suites ran again after the last changes to the runtime's frame
  name and the timeline's narrow layout.

## Evidence by task

- 1.1: `player.test.ts` "reads a version 2 document as one story of one, and refuses version 1":
  a version 2 object with `timeline` reads as the version 3 document with one story; version 1, a
  version 2 story without `timeline`, an empty `stories`, version 4 and another format are refused
  by `isPlayerDocument` and `readPlayerDocument`.
- 1.2: "builds several stories into one document over the views they share" (purchase and refund,
  `checkout` once, the same JSON twice, `frameSvg` per story equal to `storyFrame`'s) and "leaves out
  a story whose view cannot be drawn" (`outage`, over a diagram with an error, named in `left`;
  alone, no document).
- 1.3: `motion/test/story.test.ts` lists the purchase stills (1800 − 0.01 ms, 7400 ms);
  `player.test.ts` asserts `sceneEnd` equals them.
- 1.4: the player suite's new scenarios: picking `refund` while `purchase` plays at 300+ ms shows
  its frame at 0 ms paused with the viewport kept, its scenes, "Story: Refund" and the frame's
  name "Refund. Scene 1 of 2: request. Interactive drawing"; the summary's two headings with
  `aria-current` on the shown one and the static view of `refund`; the `story` attribute (and an
  unknown id, and a document of one story); `+` and Space inside the picker leave the zoom and the
  playback; a version 2 page plays with no picker; the Spanish words.
- 1.5: the docs test and the player's unit tests are green; `framesPage` draws the first story.
- 2.1: `editor/test/story-exports.test.ts`: the two-story page, the order asked, the fragment, the
  story left out with one notice and `checkout` laid out once, HTML only.
- 2.2: `cli/test/export.test.ts` "meltemi-diagrams export --stories": the page, the same bytes
  twice, HTML by default, `--stories refund,purchase --embed`, a list after the flag and
  `--stories=`, the story left out and its diagnostic printed once, and every usage error with
  exit 2 (another format, `--story`, `--diagram`, `--at`, a bad list, a folder, an unknown id, a
  profile, a file without stories).
- 2.3, 4.5, 4.6 (web app): the playground suite's scenarios "stories: …": the page of every story
  and its status line, HTML only, the story left out, no target for one story; the zip of SVGs
  equal byte for byte to `meltemi-diagrams export --story purchase --scenes`, the Instant hidden,
  the box unchecked at the next opening, no box for GIF or a diagram, the print frame with two
  `section`s and a `@page` rule, the zip of PNGs; cancelling while six large PNGs are drawn
  downloads nothing and says so; **New story** and the timeline's **Export scenes** opening the
  dialog with the box checked; the Spanish words.
- 2.4, 4.6 (VS Code): `test/vscode/suite.cjs` "Export HTML Player offers every story…" (the quick
  pick lists `purchase`, `refund`, **Every story**, `checkout`; the page holds both stories; a file
  of one story offers no such entry) and "Export scenes asks the format…" (SVG and PNG per scene
  beside the file; dismissed, nothing written).
- 3.1: `edit/test/stories.test.ts` "createStory": the text written, `story.empty-scene` the only
  new diagnostic, `story3` past a story and a profile, the title, the scene id, a comment kept on
  its line, CRLF, a file without a final newline, a sequence diagram, and the refusals (an
  imported diagram, an id that is not one or is taken, a bad scene id).
- 3.2: `editor/test/stories.test.ts`: `createStory` on `checkout` gives a `story` message with
  `story1` playing and one scene; the status line once; in story mode the next story is for the
  playing story's diagram; undone, story mode ends; `exportScenes`; no diagram to tell.
- 3.3: the webview suite's "New story writes a story of the diagram shown…" (the post, the order
  beside the picker, the tooltip, story mode on `story1` with one scene, the status line, `story2`
  while one plays) and the read-only scenario (no **New story**, **Export scenes** posts).
- 4.1: `story-exports.test.ts` "a picture per scene": two SVGs equal to the frames at the stills'
  instants, PNG jobs per scene, one PDF job of two pages of 640 × 400 for a story over a 480 × 300
  and a 640 × 400 view, and the refusals.
- 4.2: `capture/test/capture.test.ts` prints a two-page PDF (two `/Type /Page` objects of the job's
  size) and checks the multi-page `capturePage`; `cli/test/story.test.ts` reads two pages from
  `purchase.purchase.pdf`.
- 4.3: `cli/test/story.test.ts` "export --scenes": the names, each SVG equal to `--at` at the
  scene's instant, the PNGs and the PDF, `--out` naming a new directory or the PDF, every usage
  error with exit 2 and nothing written, and a story that cannot be drawn (exit 1, nothing
  written).
- 4.4: `model/test/export.test.ts` covers `scenes` on a story, `scenes false`, the PDF `file`, and
  the diagnostics on `at`, on a diagram, on HTML and with `file` on PNG; `cli/test/export.test.ts`
  writes `purchase.slides.overview.png` and `purchase.slides.processing.png` from a profile.
- 2.5, 3.4, 4.7, 5.1: the guides in both languages, the changelog and decision 0070; the docs
  test (same headings and code in both languages, every link) is green.

## Deviations from the design

Recorded in design.md and the deltas:

- HTML is the format of `--stories` when none is given; `--stories` also refuses `--diagram`,
  `--scenario` and `--scenes`.
- `--scenes --out <dir>` makes a directory named without an extension when it does not exist.
- Picking a story in the static view shows its first scene's final state (the static view's time).
- The model JSON's export profiles gain `scenes` within version `0.1` (the proposal had said the
  model JSON was unchanged); the purchase corpus snapshot gains `"scenes": false`.
- The outputs of every scene are `SceneOutput` records `{ scene, name, out, output }`, named after
  the request's `out`; a PDF of scenes is a `CaptureJob` with `pages: [{ svg, background }]` of the
  job's size.
- Decision 0024 is amended too; the element dispatches `meltemi-story`; the timeline's words give
  way to its glyphs on a narrow canvas.

## Found on the way

- VS Code's **Export HTML Player** drew nothing for a story picked from its quick pick: it built
  the request from the command's `story` argument, absent when the person picks, instead of the
  story picked, and said the story could not be drawn. It now uses the story picked; the new
  VS Code test picks `purchase` from the quick pick and gets `single.purchase.html`.
