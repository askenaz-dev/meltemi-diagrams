## Context

See `proposal.md` for the motivation and `specs/` for the behaviour.

**The sea is not drawn here.** `@meltemi/ocean`, specified by Meltemi Web's changes
`site-in-motion` and `fleet-and-wind` (capability `ocean-package`), offers the drawing:
- `createSea(canvas, { state, reducedMotion, progress, wind, fleet }, environment?)`, which returns
  a handle with `start`, `stop`, `setProgress`, `restyle`, `resize`, `destroy`, and what it drew
  (`renderer`, `frames`, `figures`). `fleet` is the page's elements of the Meltemi mark, the lead
  first: the package writes their CSS `transform` and nothing else. `environment` replaces the
  browser's `requestFrame`/`cancelFrame` among others;
- `restProgress(state)` and `fleetSize(state)`: the `diagrams` state rests at progress 1 and sails
  five boats;
- `stillPicture(state, { scheme })`, one SVG per scheme, in the brand's colours unless told others;
- the mark's shape, `MARK_M`, `MARK_HULL`, `MARK_GRADIENT`, `MARK_STROKE`, `MARK_BOX`.

It reads its colours from `--sea-point`, `--sea-crest` and `--sea-wind` on the canvas (`--sea-bg` is
read for completeness; the canvas stays transparent). It makes no request, uses no storage and has
no dependency.

**The page today.**
- **Policy.** Its Content-Security-Policy (`packages/playground/policy.mjs`) already allows
  `script-src 'self'`. The agent setup pages have their own policy, with no script.
- **Loading.** `index.html` starts in `#playground.loading` with a boot line. When the page starts,
  the shell removes the class and replaces what `#playground` holds (`shell.ts`, `build()`).
- **The empty canvas.** The studio sends the canvas an `empty` message with `studio.noFiles`,
  `studio.manifest` or `studio.openSource` when there is nothing to draw (`Studio.analyzeNow`). The
  canvas shows it in `.empty`, on its `.stage`.
- **Theme.** The page follows the system scheme, and has a switch that it remembers
  (`data-theme` on the root).
- **Reduced motion.** `web-playground` requires no animation of the page's own when reduced
  motion is asked.
- **Toolchain.** The build is `build.mjs` with esbuild 0.28.2, and the browser suite uses
  `playwright-core` 1.63.0 with the installed Edge or Chrome.

## Goals / Non-Goals

**Goals:**
- The family's sea, with its fleet of Meltemi marks, where the page is waiting: while it loads, and
  while the canvas has nothing to draw.
- Zero cost to the editor: no wait on start, nothing of the sea in the bundle it starts with, and
  nothing loaded or drawn while a diagram is on the canvas.
- Motion that ends on its own within 5 seconds, so the page needs no pause control.

**Non-Goals:**
- No sea behind a drawn diagram, in the player, in exports or in the VS Code extension's webview.
- No change to the page's Content-Security-Policy, nor to the agent setup pages' policy.
- The page-wide wind of meltemi.dev (`createWind`): a work tool's screens stay calm, and the
  wind's part here is the links it draws into the flow.

## Decisions

### D1. The load screen is a separate, asynchronous module

**Choice.** `build.mjs` builds `src/boot-sea.ts` as a second entry, `boot-sea.js`, in the same
esbuild run as `playground.js`, so the package's code is one chunk both share. `index.html` loads it
with `<script type="module" async src="boot-sea.js">` beside `playground.js`. When it arrives and
the page is still loading, the module:
- puts a layer, `.boot-sea` (`aria-hidden`), over the page, and in it the sea's canvas and its
  fleet: the lead holds the mark once, and the four other boats use it (`<use href>`);
- plays the `diagrams` sea once and comes to rest (D3);
- watches `#playground` with a `MutationObserver`. When `loading` goes, the layer holds the load
  screen once more, its background and its line, and dissolves over the editor in 200 ms; then the
  handle is destroyed and the layer removed. The 200 ms count from the dissolve's first frame
  (`animationend`), which waits for the editor's first drawing; a timer removes the layer when a
  page in the background plays no animation. Under reduced motion, it is removed at once.

The layer lies over the page, not in `#playground`, because the shell replaces what `#playground`
holds as it starts: in it, the sea could not leave gently. It takes no pointer, so the editor is
usable from its first moment.

**Why.** An `async` module runs as soon as it arrives and never blocks `playground.js`. If it
arrives after the start, it sees no `loading` class and does nothing. `boot-sea.ts` imports nothing
the editor imports, so the editor's bundle is what it was.

**Alternatives.**
- **Put the sea in `playground.js`.** The editor's bundle would grow, and the sea would draw only
  after the bundle that the load screen is waiting for.
- **A canvas in `index.html`.** It would sit empty until the script came, and the shell would wipe it
  at the start, with no fade.
- **A CSS-only animation of the boot line.** Light, but it is not the family's sea.

### D2. The empty canvas asks for the sea lazily

**Choice.** The studio says when the canvas comes to have nothing to draw, and when it has
something again: `StudioListener.nothingToDraw(on)`, said only when it changes, and before the
canvas's messages, from `Studio.analyzeNow`. The rule is the exported `nothingToDraw(path)`: no
file open, `project.json`, or another file that is not a `.meltemi` source. A `.meltemi` file
always has something of its own on the canvas, even with no diagram yet: the buttons that create
one, which are the start of the person's work.

A new module, `src/empty-sea.ts`, in the editor's bundle and a few hundred bytes, exports:

```ts
showEmptySea(host: HTMLElement, options: { reducedMotion: boolean }): () => void
```

It dynamically imports `./sea.js`, which holds the drawing and `@meltemi/ocean`, so esbuild serves
it from the chunk `boot-sea.js` shares. It puts the sea as the first child of the canvas's
`.stage`, behind its message and everything the canvas draws, and plays it to rest. The function
returns a disposer; disposed before the chunk arrives, the sea never shows. `EmptySea` follows the
studio's word: the shell gives it `showEmptySea` on its stage, it shows the sea once and calls the
disposer when the studio says there is something to draw, which is before the diagram is sent.

Unit tests pin the rule (which states show the sea and which do not) and the order: opening a
diagram calls the disposer first, then the diagram's messages follow.

**Alternative.** Keep the sea mounted and only hide it. That holds a WebGL context for the whole
session, for a moment that may never come back.

### D3. Coming to rest instead of a pause button

**Choice.** Every moment plays once and stops at rest within 5 seconds, so no motion lasts long
enough to need a pause, stop or hide control under WCAG 2.2.2. The page drives the package's own
frame loop through the `environment` it gives `createSea` (`playOnce` in `src/sea.ts`): before each
of the sea's frames, it sets the progress, which forms the flow over 3.6 seconds, and it slows the
sea's own clock from the third second to a stop at 4.5 seconds, so the waves and the fleet settle
instead of freezing. Then it stops the sea, whose last frame stays. One loop, the package's: the page
requests no frame of its own. Under reduced motion, both moments draw one frame with progress at
rest (1), the finished flow, and request no animation frame.

**Alternative.** A looping sea with a pause button, as on meltemi.dev. The page is a work tool,
though, and a button for a decoration would compete with its toolbar.

### D4. Colours from the page's tokens and its switch

**Choice.** `playground.css` defines the four `--sea-*` properties from `--pg-*` tokens:
- `--sea-bg` from `--pg-bg`;
- `--sea-point` from `--pg-muted`;
- `--sea-crest` from `--pg-accent`;
- `--sea-wind` from `--pg-accent`, in both schemes. The proposal had `--pg-accent-soft` in light; on
  the white canvas the flow's links were then nearly invisible.

They sit in the same three selectors that already switch the theme. A live sea re-reads them
(`restyle()`) when the page's switch changes `data-theme`, watched with a `MutationObserver`, and
when the system's scheme changes, which the page follows until the switch chooses. A test reads
`playground.css` and fails on a `--sea-*` rule that names anything but a `--pg-*` token, naming the
rule. The sea's layout values are the page's own (`--pg-sea-height`, `--pg-sea-mark`), so the
`--sea-*` names stay the package's colours.

### D5. The agent setup pages show the still picture

**Choice.** `build.mjs` writes `dist/sea-diagrams.svg` and `dist/sea-diagrams-dark.svg` from
`stillPicture("diagrams", { scheme })`, in the brand's colours (`seaStills` in `sea.mjs`). Both setup
pages place them above their heading, between the header and the page's text, as a picture of the
system's scheme:

```html
<picture class="setup-sea">
  <source srcset="../sea-diagrams-dark.svg" media="(prefers-color-scheme: dark)" />
  <img src="../sea-diagrams.svg" alt="" width="1600" height="640" />
</picture>
```

(`../../` from the Spanish page). `agent-setup.css` crops it to the sea, the fleet and the flow, a
band at most 80rem wide whose edges fade into the page, and shows the middle of it larger on a
narrow screen. Their policy already allows `img-src 'self'`, so nothing changes in it, and they stay
pages with no script (decision 0063).

### D6. The dependency, pinned to the published version

**Choice.** `@meltemi/ocean@0.1.20` from npm (Apache-2.0), exactly pinned, published by Meltemi
Web's release workflow with provenance, as `packages/cloud` already consumes `@meltemi/identity`.
Checked on 2026-11-05 before adding it: `npm view` lists 0.1.20 as latest with a SLSA provenance
attestation, and `npm audit signatures` verifies its registry signature and its attestation, built
by `askenaz-dev/meltemi-web`'s `.github/workflows/release.yml` on `refs/heads/main` at `5ce8461`.

The license inventory and `NOTICES.md` gain it (the modified "Notices and versions"). The family's
packages from npm were skipped by both until now: the inventory listed no `@meltemi/*` package and
the notices skipped every one. Now only the workspace's own packages are skipped, so the inventory
also lists `@meltemi/identity`, the hosted service's sign-in verifier, under Apache-2.0.

**Alternative.** Vendoring the package's source into this repository. That would copy someone
else's code and lose provenance.

### D7. Checks

- **The build** (`build.mjs`, with `sea.mjs`) fails when the chunks that carry the sea (the package,
  `src/sea.ts`, `src/boot-sea.ts`) weigh more than 25 KB gzipped, or when one of them is in the
  bundle the editor starts with (`src/main.ts` and what it imports statically), read from esbuild's
  metafile, naming the chunk. It prints the weight: 9.3 KB in two chunks.
- **Unit tests** (vitest, Node):
  - the studio's empty-state rule and the order of its word and the canvas's messages;
  - `EmptySea` and `showEmptySea` with a chunk that arrives late, or never;
  - a moment's play with injected animation frames: progress, the slowing clock, rest before 5
    seconds, nothing pending; one frame and no request under reduced motion; `matchMedia`;
  - the `--sea-*` rule check on `playground.css`, and on a fixture with literal colours;
  - the stills well-formed (the cloud service's `isSvgText`), with no script, style or other file,
    at most 30 KB, placed in both setup pages with `alt=""`, and the pages' policy unchanged;
  - the weight check on fixture metafiles: within budget, over budget naming the chunk, in the
    editor's bundle naming the chunk.
- **The browser suite** (`pnpm playground:test-browser`) gains these checks:
  - the sea on the load screen, drawing behind the boot line, gone after the start;
  - the start with and without the sea, and with its script four seconds late, three times each;
    the dissolve begins and ends after the start;
  - the sea on an empty project, as the stage's first child, gone with no frame more when a
    diagram opens, and back for `project.json`; it requests nothing but its chunk;
  - no frame after 5 seconds;
  - one frame and no animation frame under reduced motion, on both moments;
  - the tokens in both schemes, and recolouring on the scheme switch;
  - the setup pages' picture in both schemes; the notices name `@meltemi/ocean` under Apache-2.0;
  - as before, no request outside the origin.

All of it runs locally, against the static build, with no network.

## Risks / Trade-offs

- **A WebGL context on a busy GPU during load.** The sea draws for at most 4.5 seconds at the
  device's ratio capped by the package, and only while nothing else is on the screen. The suite's
  starts were 1424 ms without the sea and 1501 ms with it (best of three, templates held back
  1.2 s): the sea's frames share the main thread with the start.
- **The published package lags behind the site's.** The pin is explicit, and updating it is an
  ordinary dependency bump that runs the same suite.
- **A first visit that loads fast.** The load screen may never show the sea, and that is correct:
  the sea never waits for itself.
