## Context

- `storyTimeline` and `storyFrame` (change 14) draw any instant of a story from plain data; the
  canvas webview already plays stories this way, rendering frames with `renderSvg(…, { fonts:
  "system" })` and the views' `@font-face` rules loaded once.
- `planMotion` and `sceneAt` (change 13) draw a diagram's effects at a time; `motionDuration` is
  null when an effect repeats forever.
- The CLI writes SVG only; HTML is the proposal's format for the catalog and interactive playback.

## Goals / Non-Goals

**Goals:** a player that runs from one self-contained file, offline, embeddable in pages and in
the catalog (change 18); every control of the proposal with keyboard and screen reader support;
the same frames as the CLI and the canvas.

**Non-Goals:** the catalog itself (18), video (17), PNG and PDF (16).

## Decisions

### D1. Package and runtime

`@meltemi/diagrams-player` holds:

- `document.ts`: the `PlayerDocument` type and builders `storyDocument(story, views, options)` and
  `effectsDocument(diagram, layout, options)`;
- `controller.ts`: `PlayerController`, the state machine without DOM (time, scenes, modes,
  stepping, keyboard commands), unit tested in Node;
- `runtime.ts`: the `<meltemi-player>` custom element and `mountPlayer`, DOM only, which draws
  frames with `storyFrame`/`sceneAt` and `renderSvg`;
- `html.ts`: `playerPage(document, script, options)` and `playerFragment(document, script)`;
- `node.ts`: `playerScript()`, the bundled runtime: `dist/player.js` when the package is built, or
  bundled in memory with esbuild when running from sources.

The runtime is one IIFE script (motion, render and the player, no third-party code). The element
uses a shadow root for its controls and styles, so pages cannot break it; `@font-face` rules go to
the document once, keyed by a hash, because font faces declared in shadow roots are not used.

### D2. Document

```json
{
  "format": "meltemi-player",
  "version": 1,
  "kind": "story",
  "title": "A purchase",
  "description": null,
  "timeline": { "...": "storyTimeline" },
  "views": { "checkout": { "scene": {}, "plan": {}, "ends": {} } },
  "labels": { "checkout": { "db": "PostgreSQL" } },
  "accent": "#1F6FEB",
  "fontFaces": ["@font-face{…}"]
}
```

`kind: "effects"` documents carry one view and `durationMs` (null when an effect repeats
forever). Labels let the summary name elements as people read them. Data embedded in HTML escapes
`<`, so `</script>` never ends the script.

### D3. Controls and modes

| Control                 | Keys                       | Behaviour                                                                    |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| Play / Pause            | Space, K                   | plays from the current time; at the end restarts; pauses                     |
| Progress slider         | Left / Right (±1 s, Shift ±100 ms), Home, End | native range input, labelled with the time            |
| Previous / Next scene   | Page Up / Page Down, P / N | jumps to the start of a scene (its end in the static view)                   |
| Scene picker            |                            | a select of the scenes with their titles                                     |
| Static view             | S                          | each scene's final state, no animation; for effects, the drawing without them |

- **Reduced motion.** With `prefers-reduced-motion: reduce` the player starts in the static view
  and ignores `autoplay`; the user may still switch to the animated view.
- **Loop.** `loop` restarts at the end; otherwise playback stops at the end. Effects documents
  whose effects repeat forever play until paused and show no progress slider.
- **Announcements.** A polite live region says the scene's number, id and title when it changes;
  the frame has `role="img"` and an accessible name with the story's title and the scene.
- **Summary.** A `<details>` "Text summary" lists the scenes and their actions in words, with
  labels instead of ids ("Reveal Cliente, API Gateway, Pedidos and PostgreSQL over 0.8 s").

### D4. HTML

The page is a complete document (`<!doctype html>`, `lang`, title, viewport, a description meta)
with the element, the JSON data and the script inline; the fragment is the element, its data and
the script, safe to paste more than once (the element is defined once). Neither loads anything
from the network.

### D5. CLI and editor

`export --format html` writes `<stem>.<story>.html` with `--story`, otherwise one page per diagram
(named like SVG exports, `.html`). `--embed` writes the fragment. `--at`, `--motion animated` and
`--fonts outlined` are usage errors with `--format html`; `--fonts system` leaves fonts out. VS
Code adds **Meltemi Diagrams: Export HTML Player** (asks which story or diagram) and the timeline's
**Export HTML** button; the extension bundles `player.js` as an asset.

## Risks / Trade-offs

- [esbuild at run time from sources] → only when `dist/player.js` is absent (a source checkout);
  published packages ship the bundle.
- [Large pages for big stories] → views are sent once and frames drawn on demand; fonts are
  subset by the text they draw.
