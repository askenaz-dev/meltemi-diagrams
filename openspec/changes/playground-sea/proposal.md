## Why

On 2026-10-28 the owner asked for the family's web to stop being still, "la web de meltemi, igual
con IDE y con Diagrams". The picture is the ocean and the Etesian wind moving the boat that is
Meltemi's mark, drawn as something digital, with the brand prevailing. The owner put
diagrams.meltemi.dev in that scope.

Meltemi Web's change `site-in-motion` (askenaz-dev/meltemi-web) draws that sea on meltemi.dev. It
puts the drawing in a dependency-free package, `@meltemi/ocean`, published with provenance so this
product can wear the same sea. On the family site, the Diagrams page gets the state "the wind
draws": points of the sea lift and link into a small flow diagram, the reference footage's
plexus given a meaning.

The playground has no place like a hero. It opens straight into the editor. Two moments show only
a line of muted text:
- **Loading.** `#playground.loading` holds `<p class="boot">Loading the playground…</p>`
  (`packages/playground/index.html`), swapped for the user's language
  (`packages/playground/src/main.ts:48-49`) and removed when the page starts (`:142`).
- **Nothing to draw.** The canvas shows `studio.noFiles`, `studio.manifest` or `studio.openSource`
  (`packages/playground/src/messages/en.ts:463-465`).

The static agent setup pages (`packages/playground/agent-setup/`, decision 0063) carry no script
and no picture. These are the moments where the brand can show without touching anyone's work.

This is a post-1.0 change outside `docs/roadmap-1.0.md`, in the hosted service's area (the page
diagrams.meltemi.dev serves). It covers no stage of the proposal.

## What Changes

- **Loading.** While the playground loads, the `diagrams` sea state of `@meltemi/ocean` draws
  behind the boot line: the sea, the wind and points linking into a flow. It fades out as the page
  starts and never delays the start.
- **Nothing to draw.** When the canvas has nothing to draw (no files, `project.json` open, or a
  file with no diagram), the same sea sits behind the canvas's message. It never appears while a
  diagram is drawn, edited, played or exported.
- **Motion settles.** Every animated moment comes to rest within 5 seconds, so nothing on the
  page moves for longer than that. With `prefers-reduced-motion` the page draws one still frame,
  as `web-playground` already asks of everything the page animates.
- **The agent setup pages** (`/agent-setup/`, `/es/agent-setup/`) show the `diagrams` still
  picture, an SVG with no script. Their policy, which has no script, stays as it is.
- **The sea follows the page's own scheme switch**, light or dark, through the four `--sea-*`
  properties defined from the page's `--pg-*` tokens.
- **No change to the page's Content-Security-Policy.** It already allows `script-src 'self'`.
  `@meltemi/ocean` is bundled into the page and makes no request.
- **`NOTICES.md` and the licence inventory** name `@meltemi/ocean` under Apache-2.0. The About
  dialog lists it.
- **New dependency:** `@meltemi/ocean` (Apache-2.0), from npm, published by Meltemi Web with
  provenance. It is pinned to the first published version, `0.1.0`, and has no dependency of its
  own. The owner approved it in the request of 2026-10-28.

## Capabilities

### New Capabilities

- `playground-sea`: where and how the playground shows the family's sea. That covers:
  - the load screen;
  - the canvas when there is nothing to draw;
  - the still picture of the agent setup pages;
  - settling within 5 seconds, reduced motion, the page's scheme;
  - never behind work in progress;
  - its weight.

### Modified Capabilities

- `web-playground`: the requirement "Notices and versions" also names `@meltemi/ocean` under
  Apache-2.0.

## Impact

- **`packages/playground`**
  - `index.html`: the canvas behind the boot line.
  - `src/main.ts`: starts the sea before `start()` and fades it when the page starts.
  - The studio's empty-canvas states.
  - `playground.css`: `--sea-*` from `--pg-*`, the load screen and the empty canvas.
  - `build.mjs`: writes `sea-diagrams.svg` for the agent setup pages.
  - `agent-setup/*.html`: the still picture.
  - `package.json`: the new dependency.
- **Docs and notices**
  - `NOTICES.md` generation and `pnpm licenses:inventory`.
  - `docs/playground.md` and its Spanish twin get one paragraph about the sea and reduced motion.
- **Tests**
  - Unit tests for the empty-state rule (which states get a sea).
  - The playground's browser suite gains these checks:
    - the sea on load and on the empty canvas;
    - none while a diagram is drawn;
    - rest within 5 seconds;
    - one frame under reduced motion;
    - no request outside the origin, as before.

## Non-goals

- **The sea itself.** `@meltemi/ocean`, its states, renderers and still pictures, and the
  family's site belong to Meltemi Web's change `site-in-motion`. This change consumes the
  published package.
- **Publishing `@meltemi/ocean` to npm**, and the token or trusted publisher that publishes it:
  Meltemi Web's `site-in-motion` and its `delivery` change.
