# 0024. One offline HTML player drawing frames from data

Status: accepted (player change, 11 October 2026)

## Context

The proposal names HTML as the format of the catalog and interactive playback, and asks for a
player with pause, progress, scene selection, reduced motion and a static mode, keyboard
alternatives, visible focus, accessible labels and an exportable text summary. The editor, the
player and the exporters consume the same scene and the same state at an instant. Change 14 draws
any frame of a story from plain data (`storyTimeline`, `storyFrame`).

## Decision

- **A package of its own.** `@meltemi/diagrams-player` holds the document builders, a controller
  without DOM (the clock, scenes, static view, reduced motion and keys, unit tested), the runtime
  and the HTML writers. The runtime is bundled with motion and the renderer into one script with no
  third-party code; built packages ship `dist/player.js`, a source checkout bundles it with esbuild
  on first use.
- **Frames on the page.** The document carries the views' scenes and effects once; the page draws
  each frame with the same functions as the CLI, so the frame at a time is byte-identical to
  `export --story --at` with system fonts.
- **A custom element in a shadow root.** `<meltemi-player>` reads its JSON child, keeps its controls
  and styles in a shadow root, and puts the font faces in the page head once (faces declared in a
  shadow root are ignored). Fragments can be pasted more than once.
- **Accessibility first.** Reduced motion starts the static view and disables autoplay; scene
  changes go to a polite live region; the summary describes every action with labels; every
  control has a name, a key and a visible focus ring; colours come from system colours so pages in
  dark mode work.
- **Offline.** Data, fonts and code are inline, nothing is fetched, and data is escaped so it cannot
  end its script element.

## Alternatives considered

- **Animated SVG or video in the page.** Neither offers scene selection, a static view or a
  summary, and video would lose the vectors.
- **Frames rendered ahead of time.** Large and fixed to one frame rate; drawing on demand is exact
  at any instant.
- **An iframe-only player.** Harder to style and size; the element works inline and in an iframe.

## Consequences

- The catalog (change 18) embeds `<meltemi-player>` elements and the runtime once.
- Video and GIF exports (change 17) can drive the same controller and frames.
