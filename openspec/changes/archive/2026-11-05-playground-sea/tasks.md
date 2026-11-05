## 1. The dependency and a first sea on the load screen

- [x] 1.1 Check that the current `@meltemi/ocean` is published with provenance (`npm view @meltemi/ocean` and `npm audit signatures`). Add it, pinned, to `packages/playground`. Verify `pnpm install --frozen-lockfile` and `pnpm typecheck` pass.
  - 2026-11-05: `npm view` lists `0.1.20` as latest (Apache-2.0, no dependency) with a SLSA provenance attestation; `npm audit signatures` in a scratch project: "1 package has a verified registry signature", "1 package has a verified attestation", built by `askenaz-dev/meltemi-web` `.github/workflows/release.yml` on `refs/heads/main` at `5ce8461`. Pinned as `"@meltemi/ocean": "0.1.20"`; `pnpm install --frozen-lockfile` and `pnpm typecheck` pass.
- [x] 1.2 Write `src/boot-sea.ts` and its `build.mjs` entry: the layer over `#playground.loading`, the `async` module, the play to rest, and the dissolve and destroy when `loading` goes (design D1). Verify `pnpm playground:build` writes `boot-sea.js`, and the built page shows the sea behind "Loading Meltemi Diagrams…" on a throttled load.
  - `boot-sea.js` (818 B) and the shared sea chunk are written; with `templates.json` held back, the load screen shows the sea, its fleet and the flow, and a recording of the start shows the dissolve over the editor in about four frames.

## 2. The empty canvas, rest and colours

- [x] 2.1 Write `src/empty-sea.ts` (`showEmptySea`, design D2) and wire it into the studio where `noFiles`, `manifest` and `openSource` show, disposing it before a diagram is drawn. Verify the unit test of which studio states show the sea, and that opening a diagram calls the disposer.
  - `Studio` says `nothingToDraw` (rule `nothingToDraw(path)`), `EmptySea` follows it in the shell. `test/sea.test.ts`: the rule's six cases, the word before the canvas's message, once per change, and the disposer first when a diagram opens.
- [x] 2.2 Bring both moments to rest within 5 seconds, and under reduced motion draw one frame at progress 1 with no animation frame (design D3). Verify unit tests with injected `requestAnimationFrame` and `matchMedia` stubs.
  - `playOnce` drives the package's own loop: rest at 4.5 s, the sea's clock slowing from 3 s; reduced: one frame, no request; `reducedMotion` reads `matchMedia`.
- [x] 2.3 Add the `--sea-*` properties from `--pg-*` in `playground.css` for both schemes, and re-read them on live seas when the scheme switch or the system's scheme changes (design D4). Verify the test that fails on a `--sea-*` rule with a literal colour.
  - The test checks the three selectors and fails on a fixture naming `:root { --sea-crest: #22d3ee }` and `.x { --sea-wind: rgb(1 2 3) }`.

## 3. The setup pages, the notices and the weight

- [x] 3.1 Have `build.mjs` write `dist/sea-diagrams.svg` and `dist/sea-diagrams-dark.svg` from `stillPicture("diagrams", { scheme })`, and place them in both agent setup pages with `alt=""` and its style in `agent-setup.css` (design D5). Verify the build test finds the SVG well-formed and placed in both pages, finds no `<script>`, and finds the policy unchanged.
  - `test/sea-build.test.ts`: both stills well-formed (`isSvgText`), no script, style or other file, 27 KB each; both pages show them above the heading with `alt=""`; policy as decision 0063 set it.
- [x] 3.2 Add `@meltemi/ocean` under Apache-2.0 to the license inventory, `NOTICES.md` and the About dialog. Verify `pnpm licenses:inventory --check` passes, and that the "Notices" scenario reads all three licences.
  - Before regenerating, `--check` failed with "missing: @meltemi/identity, @meltemi/ocean" and the build failed with "Not in THIRD_PARTY_LICENSES.md: @meltemi/ocean". The notices and the inventory now skip only the workspace's own packages.
- [x] 3.3 Add a build test from esbuild's metafile: the chunks that carry the sea total at most 25 KB gzipped, and none of it is in the bundle the editor starts with. Verify it passes, and that a fixture over budget fails naming the chunk.
  - `seaWeight` (`sea.mjs`) runs in every build: "the sea in 2 (9.3 KB gzipped)". Fixtures: within budget, over budget naming `dist/chunks/chunk-C.js`, in the editor's bundle naming it.
- [x] 3.4 Add one paragraph to `docs/web-app.md` and `docs/es/web-app.md` on the sea, its rest within 5 seconds, and reduced motion. Verify the docs test with the Spanish twin passes.

## 4. The browser suite and the gates

- [x] 4.1 Extend `pnpm playground:test-browser` with:
  - the load screen's sea and its removal after the start;
  - the sea on an empty project and its removal when a diagram opens;
  - no frame after 5 seconds;
  - one frame under reduced motion;
  - the scheme switch recolouring the sea;
  - an equal start time with and without the sea;
  - no request outside the origin.

  Verify the suite passes and prints its count.
  - Six scenarios named `the sea: …`, and the notices and setup-page scenarios extended: "124 passed, 0 failed". Starts, best of three with the templates held back 1.2 s: 1436 ms without the sea, 1465 ms with it, 1343 ms with its script 4 s late; the dissolve begins and ends after the start.
- [x] 4.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm playground:test-browser` and `openspec validate playground-sea --strict`, and record the results here. Then the owner looks at the load screen, the empty canvas and a setup page in both schemes, and signs off.
  - 2026-11-05: `pnpm typecheck` pass; `pnpm lint` pass; `pnpm test` 357 files, 10437 passed, 1 skipped; `pnpm playground:test-browser` 124 passed, 0 failed; `openspec validate playground-sea --strict` valid. Screenshots of the load screen, the empty canvas, the motion, the dissolve, both setup pages and 375 px, in light and dark and with reduced motion, are in `screenshots/`.
  - 2026-11-05: merged as PR #11 and shipped in 1.11.17 (npm, Marketplace, Open VSX, GitHub; diagrams.meltemi.dev serves `boot-sea.js`). The owner signed off the same day.
