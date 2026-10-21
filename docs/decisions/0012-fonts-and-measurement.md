# 0012. Bundled fonts, real measurement and font policies

Status: accepted (text-measurement-and-fonts change, 10 October 2026)

## Context

Text widths were estimated from character classes, so labels could overflow the boxes the layout
sized, and exported SVGs depended on the fonts installed on each viewer's machine. The proposal asks
the engine to measure text before layout, keep the result across formats, and ship fonts only with
distribution and embedding permissions.

## Decision

- Bundle Inter, IBM Plex Sans and Cascadia Mono (OFL-1.1), read with `fontkit` (MIT).
- Measure and outline with the complete fonts where a package provides them: `inter-ui` and
  `@ibm/plex-sans` carry every glyph, including arrows. Fontsource's Google-style subsets drop
  arrows.
- Embed the small Fontsource script subsets, limited with `unicode-range`. fontkit cannot write the
  `cmap` table browsers need, so glyph-level subsets are not an option.
- Characters a family lacks fall back to the other bundled families, as in browsers.
- The layout depends on a `TextMeasurer` interface and the renderer on a `FontProvider`. Both stay
  host-neutral; `@meltemi/diagrams-fonts` implements them.
- Boxes without `size` grow to fit their text (16 px each side). An explicit `size` with less than
  6 px of margin is `layout.text-overflow`. Text is never scaled down.
- Three SVG font policies: `embedded` (CLI default), `outlined` and `system` (`renderSvg` default).
- A license inventory is generated from the production dependencies, and CI checks that it is
  current.

## Alternatives considered

- Precomputed width tables: no outlines or embedding, and large kerning tables.
- `opentype.js`: no WOFF2 support.
- Glyph-level TrueType subsets: rejected by browsers without `cmap`, `name`, `OS/2` and `post` tables.
- Always outlining: exact everywhere, but text is no longer selectable and files are larger.
- A 16 px overflow threshold: flagged tight designs (such as the Konfío conversion) whose text
  clearly fits.

## Consequences

- Corpus and example snapshots are rendered with the bundled fonts and the `system` policy, so they
  show real geometry and stay readable.
- The VS Code extension and the playground must ship or load the font files (roadmap changes 8 and
  22).
- Raster and PDF exports reuse the same policies (roadmap change 16).
