## Why

The proposal lists HTML as the format for the catalog and interactive playback, and asks for a
player with pause, progress, scene selection, reduced motion and a static mode, as accessible as
the rest of the product (keyboard alternatives, visible focus, accessible labels, a static view and
an exportable text summary). The editor, the player and the exporters consume the same vector
scene and the same state at an instant. Change 14 compiles stories and draws any frame of them;
nothing plays a story outside the canvas yet. Roadmap change 15 asks for an HTML player embeddable
in pages and the catalog.

## What Changes

- **Package `@meltemi/diagrams-player`.** A browser runtime, `<meltemi-player>` (also
  `mountPlayer(element, document, options)`), that plays a player document with the frame
  functions of `@meltemi/diagrams-motion` and the renderer, offline and without a server; and the
  builders that turn a compiled story, or a diagram with effects, into a player document and an
  HTML page or fragment.
- **Player.** Play and pause, a progress slider with the time, previous and next scene and a scene
  picker, a static view (each scene's final state, or the drawing without effects), reduced motion
  (`prefers-reduced-motion` starts in the static view and never autoplays; a toggle switches),
  keyboard control (Space or K, arrows, Home and End, Page Up and Page Down, S), visible focus,
  accessible names and a live region that announces scenes, and a text summary of the story.
  Options: `autoplay`, `loop`, `static`, `controls`.
- **Documents.** A versioned JSON document (`meltemi-player` 1) with the timeline, the views'
  scenes and effects, labels for the summary, the accent and the font faces; fonts are embedded,
  so the page works offline.
- **CLI.** `meltemi-diagrams export <file> --format html [--story <id>] [--embed]` writes
  `<stem>.<story>.html` (or one page per diagram for effects), a complete page by default and a
  fragment to paste into a page with `--embed`.
- **Editor.** VS Code command **Meltemi Diagrams: Export HTML Player** (stories and diagrams of the file)
  and an **Export HTML** button in the canvas timeline.
- **Docs.** `docs/player.md`, export and story docs, README, skill reference, decision 0024.

## Capabilities

### New Capabilities

- `player-runtime`: the embeddable player, its controls, modes, keyboard and accessibility.
- `player-export`: player documents, HTML pages and fragments from the CLI and the editor.

### Modified Capabilities

None.

## Impact

- New package `packages/player` (runtime bundled with esbuild into one script; esbuild and
  playwright-core, both already approved and installed, as development dependencies).
- `meltemi-diagrams export` accepts `--format html` and `--embed`.
- The VS Code extension bundles the player script as an asset and adds one command.
- New browser test runner `pnpm player:test-browser`, added to the verification list.
