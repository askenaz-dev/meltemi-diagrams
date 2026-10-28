## Context

See `proposal.md` for the motivation and `specs/` for the behaviour.

**The sea is not drawn here.** `@meltemi/ocean`, specified by Meltemi Web's change
`site-in-motion` (capability `ocean-package`), offers the drawing:
- `createSea(canvas, { state, reducedMotion })`, which returns a handle with `start`, `stop`,
  `setProgress`, `restyle`, `resize` and `destroy`;
- `stillPicture(state)`.

It reads its colours from `--sea-bg`, `--sea-point`, `--sea-crest` and `--sea-wind` on the canvas.
It makes no request, uses no storage and has no dependency.

**The page today.**
- **Policy.** Its Content-Security-Policy (`packages/playground/policy.mjs`) already allows
  `script-src 'self'`. The agent setup pages have their own policy, with no script.
- **Loading.** `index.html` starts in `#playground.loading` with a boot line, and `main.ts`
  removes the class when the playground has started.
- **The empty canvas.** The studio shows `studio.noFiles`, `studio.manifest` or
  `studio.openSource` when there is nothing to draw.
- **Theme.** The page follows the system scheme, and has a switch that it remembers.
- **Reduced motion.** `web-playground` requires no animation of the page's own when reduced
  motion is asked.
- **Toolchain.** The build is `build.mjs` with esbuild 0.28.2, and the browser suite uses
  `playwright-core` 1.63.0 with the installed Edge or Chrome.

## Goals / Non-Goals

**Goals:**
- The family's sea where the playground is waiting: while it loads, and while the canvas has
  nothing to draw.
- Zero cost to the editor: no wait on start, and nothing loaded or drawn while a diagram is on
  the canvas.
- Motion that ends on its own within 5 seconds, so the page needs no pause control.

**Non-Goals:**
- No sea behind a drawn diagram, in the player, in exports or in the VS Code extension's webview.
- No change to the page's Content-Security-Policy, nor to the agent setup pages' policy.

## Decisions

### D1. The load screen is a separate, asynchronous module

**Choice.** `build.mjs` gains an entry, `src/boot-sea.ts`, built to `boot-sea.js`. `index.html`
places a `<canvas class="boot-sea" aria-hidden="true">` inside `#playground.loading`, before the
boot line, and loads the module with `<script type="module" async src="boot-sea.js">` beside
`playground.js`. The module then:
- creates the `diagrams` sea and plays its progress from 0 to 1 over 4.5 seconds;
- stops it at rest;
- watches `#playground` with a `MutationObserver`. When `loading` goes, it fades the canvas out
  over 200 ms, destroys the handle and removes the canvas.

**Why.** An `async` module runs as soon as it arrives and never blocks `playground.js`. If it
arrives after the start, it sees no `loading` class and does nothing.

**Alternatives.**
- **Put the sea in `playground.js`.** The editor's bundle would grow, and the sea would draw only
  after the bundle that the load screen is waiting for.
- **A CSS-only animation of the boot line.** Light, but it is not the family's sea.

### D2. The empty canvas asks for the sea lazily

**Choice.** A new module, `src/empty-sea.ts`, exports:

```ts
showEmptySea(host: HTMLElement, options: { reducedMotion: boolean }): () => void
```

It dynamically imports `@meltemi/ocean`, so esbuild splits it into its own chunk, which is shared
with `boot-sea.js` when the build allows. It then puts a canvas behind the host's message and
plays the same 4.5-second progress to rest. The function returns a disposer.

The studio calls it exactly where it shows `noFiles`, `manifest` or `openSource`, and calls the
disposer before it draws a diagram. A unit test pins that rule: which studio states show the sea
and which do not.

**Alternative.** Keep the sea mounted and only hide it. That holds a WebGL context for the whole
session, for a moment that may never come back.

### D3. Coming to rest instead of a pause button

**Choice.** Every moment plays its progress once and stops at rest within 5 seconds, so no motion
lasts long enough to need a pause, stop or hide control under WCAG 2.2.2. Under reduced motion,
both moments draw one frame with progress at 1, the finished flow, and request no animation frame.

**Alternative.** A looping sea with a pause button, as on meltemi.dev. The playground is a work
tool, though, and a button for a decoration would compete with its toolbar.

### D4. Colours from the page's tokens and its switch

**Choice.** `playground.css` defines the four `--sea-*` properties from `--pg-*` tokens:
- `--sea-bg` from `--pg-bg`;
- `--sea-point` from `--pg-muted`;
- `--sea-crest` from `--pg-accent`;
- `--sea-wind` from `--pg-accent-soft` in light and `--pg-accent` in dark.

They sit in the same selectors that already switch the theme. When the page's scheme switch
changes, the code that applies it calls `restyle()` on any live handle. A test reads
`playground.css` and fails on a `--sea-*` rule with a literal colour.

### D5. The agent setup pages show the still picture

**Choice.** `build.mjs` writes `dist/sea-diagrams.svg` from `stillPicture("diagrams")`. Both
setup pages place it as `<img src="/sea-diagrams.svg" alt="" class="setup-sea">` above their
heading, styled by `agent-setup.css`. Their policy already allows `img-src 'self'`, so nothing
changes in it, and they stay pages with no script (decision 0063).

### D6. The dependency, pinned to the published version

**Choice.** `@meltemi/ocean@0.1.0` from npm (Apache-2.0), published by Meltemi Web's release
workflow with provenance, exactly as `packages/cloud` already consumes `@meltemi/identity`. The
license inventory and `NOTICES.md` gain it (the modified "Notices and versions").

**Implementation waits for the tag** `ocean-v0.1.0` in askenaz-dev/meltemi-web, and the first task
checks that it exists.

**Alternative.** Vendoring the package's source into this repository. That would copy someone
else's code and lose provenance.

### D7. Checks

- **Unit tests** (vitest, Node):
  - the studio's empty-state rule;
  - the `--sea-*` rule check on `playground.css`;
  - the build test, which finds `sea-diagrams.svg` well-formed and placed in both setup pages,
    with no `<script>`;
  - the chunk weight: at most 25 KB gzipped for the chunks that carry the sea, and none of it in
    the bundle the editor starts with, read from esbuild's metafile.
- **The browser suite** (`pnpm playground:test-browser`) gains these checks:
  - the sea on the load screen, gone after the start;
  - the sea on an empty project, gone when a diagram opens;
  - no frame after 5 seconds;
  - one frame under reduced motion;
  - recolouring on the scheme switch;
  - the start time with and without the sea;
  - as before, no request outside the origin.

All of it runs locally, against the static build or `wrangler dev`, with no network.

## Risks / Trade-offs

- **A WebGL context on a busy GPU during load.** The sea draws for at most 4.5 seconds at the
  device's ratio capped by the package, and only while nothing else is on the screen.
- **The published package lags behind the site's.** The pin is explicit, and updating it is an
  ordinary dependency bump that runs the same suite.
- **A first visit that loads fast.** The load screen may never show the sea, and that is correct:
  the sea never waits for itself.
