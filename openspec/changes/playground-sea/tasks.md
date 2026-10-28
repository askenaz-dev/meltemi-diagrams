## 1. The dependency and a first sea on the load screen

- [ ] 1.1 Check that `@meltemi/ocean@0.1.0` is published with provenance (`npm view @meltemi/ocean@0.1.0` and `npm audit signatures`). Add it, pinned, to `packages/playground`. Verify `pnpm install --frozen-lockfile` and `pnpm typecheck` pass.
- [ ] 1.2 Write `src/boot-sea.ts` and its `build.mjs` entry: the canvas inside `#playground.loading` in `index.html`, the `async` module, 4.5 seconds of progress to rest, and the fade and destroy when `loading` goes (design D1). Verify `pnpm playground:build` writes `boot-sea.js`, and `pnpm preview` shows the sea behind "Loading the playground…" on a throttled load.

## 2. The empty canvas, rest and colours

- [ ] 2.1 Write `src/empty-sea.ts` (`showEmptySea`, design D2) and wire it into the studio where `noFiles`, `manifest` and `openSource` show, disposing it before a diagram is drawn. Verify the unit test of which studio states show the sea, and that opening a diagram calls the disposer.
- [ ] 2.2 Bring both moments to rest within 5 seconds, and under reduced motion draw one frame at progress 1 with no animation frame (design D3). Verify unit tests with injected `requestAnimationFrame` and `matchMedia` stubs.
- [ ] 2.3 Add the `--sea-*` properties from `--pg-*` in `playground.css` for both schemes, and call `restyle()` on live handles from the code that applies the scheme switch (design D4). Verify the test that fails on a `--sea-*` rule with a literal colour.

## 3. The setup pages, the notices and the weight

- [ ] 3.1 Have `build.mjs` write `dist/sea-diagrams.svg` from `stillPicture("diagrams")`, and place it in both agent setup pages with `alt=""` and its style in `agent-setup.css` (design D5). Verify the build test finds the SVG well-formed and placed in both pages, finds no `<script>`, and finds the policy unchanged.
- [ ] 3.2 Add `@meltemi/ocean` under Apache-2.0 to the license inventory, `NOTICES.md` and the About dialog. Verify `pnpm licenses:inventory --check` passes, and that the "Notices" scenario reads all three licences.
- [ ] 3.3 Add a build test from esbuild's metafile: the chunks that carry the sea total at most 25 KB gzipped, and none of it is in the bundle the editor starts with. Verify it passes, and that a fixture over budget fails naming the chunk.
- [ ] 3.4 Add one paragraph to `docs/playground.md` and `docs/es/playground.md` on the sea, its rest within 5 seconds, and reduced motion. Verify the docs test with the Spanish twin passes.

## 4. The browser suite and the gates

- [ ] 4.1 Extend `pnpm playground:test-browser` with:
  - the load screen's sea and its removal after the start;
  - the sea on an empty project and its removal when a diagram opens;
  - no frame after 5 seconds;
  - one frame under reduced motion;
  - the scheme switch recolouring the sea;
  - an equal start time with and without the sea;
  - no request outside the origin.

  Verify the suite passes and prints its count.
- [ ] 4.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm playground:test-browser` and `openspec validate playground-sea --strict`, and record the results here. Then the owner looks at the load screen, the empty canvas and a setup page in both schemes, and signs off.
