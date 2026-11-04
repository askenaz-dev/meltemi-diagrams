## Context

Meltemi's identity (V2, July 2026) is one continuous-line lowercase `m` whose two arches read as sails over a minimal hull, with the right end rising as prow and gust. Palette: Night `#07111F`, Ink `#0B1830`, Aegean `#2563EB`, Wind Cyan `#22D3EE`, Sea Mist `#F7FBFF`; neutrals `#526579`, `#88A0B9`, `#DCE5ED`, `#183149`. Typography: Inter (wordmark outlined), a mono stack for code. Rules: no mast, waves, compass, container, shadow or extra wind lines on the mark; on light surfaces use the darker gradient `#1D4ED8` to `#0891B2`.

The exporter has two hard-coded token tables. The parser already accepts `theme <id> { }` with keyword statements, and the compiler reports it as `block.unsupported`. The proposal's architecture puts themes in the language (`themes/company.meltemi`, token precedence: base theme, project, diagram rules, explicit style).

## Goals / Non-Goals

**Goals:**
- A theme is a language construct with the same validation quality as styles: unknown tokens, duplicates and bad values are diagnostics with ranges.
- Branded exports by default, neutral exports on request, custom palettes without touching the renderer.
- The brand mark in exports stays faithful to the Meltemi identity (gradient, proportions, clear space).
- A naming proposal the user can accept or swap by changing one token.

**Non-Goals:**
- Cross-file themes, font embedding, per-diagram typography, the layout engine.

## Decisions

### D1. Theme blocks are flat token lists

`theme <id> { <token> <value> ... }`. Tokens are a table in `@dac/model` (`THEME_TOKENS`): colours as quoted strings (`"none"` allowed where the renderer accepts it), fonts as quoted stacks, `frame` and `mark` as words, `extends` as a quoted theme name, `brand` as a quoted string. Flat tokens reuse the property reader and keep the generic statement grammar (decision 0003); nested `colors { }` blocks were rejected as syntax for no gain.

| Token | Meaning | Default (`meltemi.light`) |
|---|---|---|
| `extends` | base theme (built-in or same file) | `meltemi.light` when absent |
| `background`, `surface` | canvas and box fill | `#F7FBFF`, `#FFFFFF` |
| `ink`, `muted` | text colours | `#0B1830`, `#526579` |
| `line`, `connector` | outlines, connectors | `#DCE5ED`, `#526579` |
| `band`, `bandLine` | group fill and outline | `#EAF1F8`, `#C9D6E3` |
| `tag`, `tagText` | tag pill fill and text | `#2563EB`, `#FFFFFF` |
| `accent`, `accentEnd` | gradient of the mark | `#1D4ED8`, `#0891B2` |
| `font`, `mono` | font stacks | Inter stack, Cascadia Mono stack |
| `frame` | `none`, `footer`, `header` | `footer` |
| `brand` | wordmark text in the frame | `Meltemi Charts` |
| `mark` | `meltemi` or `none` | `meltemi` |

### D2. Resolution order and inheritance

`theme "<name>"` on a diagram, overridden by `studio export --theme <name>`, resolves first among the file's theme blocks, then among built-ins (`meltemi.light`, `meltemi.dark`, `studio.light`, `studio.dark`). A file theme inherits from its `extends` target or from `meltemi.light`. The compiler reports `theme.unknown-base` when the base is neither built in nor in the file, and `theme.cycle` when inheritance loops; the layout never loops because resolution tracks visited ids. Built-in names are declared in `@dac/model` (`BUILT_IN_THEMES`) and their tokens live in `@dac/layout`; a test keeps both lists equal.

### D3. The frame is part of the scene

`frame footer` adds a 44 px strip under the sheet: a hairline in `line`, the mark (24 px, drawn from the V2 paths with the gradient `accent` to `accentEnd`), the `brand` text (12 px semibold in `ink`) and the diagram title right-aligned (11 px in `muted`). `frame header` puts the same strip on top. The strip is a scene group with role `frame`, so editors can ignore it. No dates or counters are drawn: exports stay byte-identical.

### D4. Gradients and transforms in the scene

`Scene.gradients` lists linear gradients (`userSpaceOnUse` coordinates) and paths may reference them as `url(#id)`; `GroupItem.transform` carries an SVG transform so the 256-unit mark is placed by one translate and scale. The renderer emits `<defs>` only when gradients exist. Gradients are plain SVG 1.1, supported by browsers, Inkscape and office importers, so the portability contract allows them while still excluding markers, CSS and `dominant-baseline`.

### D5. Branded by default, neutral on request

The default theme becomes `meltemi.light`: files without `theme` get the brand frame. `studio.*` themes keep `frame none`, so the proposal's corpus examples stay neutral. A file that wants the Meltemi palette without a frame declares `theme bare { extends "meltemi.light"; frame none }`.

### D6. The sub-brand: name, lockup, glyph

Shortlist, all in the wind-and-sea universe of Meltemi: **Meltemi Charts** (nautical charts are both diagrams and the sailor's maps; clear in Spanish), Meltemi Draft (drafting, draught, draft of wind; reads as "borrador" in Spanish), Meltemi Rumbo (course; Spanish only), Meltemi Flow (the user's idea; collides with the `flow` profile name, so a Flow flow diagram would be confusing). Recommendation: Meltemi Charts. The lockup keeps the Meltemi mark and wordmark untouched and adds a `CHARTS` pill in Aegean with mono text, the same visual element the tool draws for tags, so each product of the family can be tagged the same way. The product glyph and file-type icon reuse the brand's gradient stroke as a connector between two boxes, rising north-east like the gust; they never alter the primary mark.

### D7. Brand assets live in `brand/`

Lockups (light, dark), glyph, file icon, presentation board and `brand/README.md` (in Spanish, like the Meltemi V2 guide). The wordmark outlines are copied from the Meltemi lockup; the `CHARTS` pill text is outlined from a locally available mono font and flagged for re-outlining in Inter or Cascadia when the brand is finalised in the design tool. The assets derive from the Meltemi identity and follow its licence, not the repository's MIT licence.

## Risks / Trade-offs

- [Default frame surprises users who wanted clean sheets] -> `frame none` in a two-line theme; documented beside the export reference.
- [Brand gradient reduces portability] -> SVG 1.1 gradients only, one `<defs>` block, `mark none` removes it entirely.
- [Name not accepted] -> `brand` token and one lockup file; renaming is a token change plus asset re-export.
- [Theme tokens grow without bounds] -> table-driven; new tokens are additive and documented.

## Migration Plan

Snapshots are regenerated once. Existing sources compile unchanged; `block.unsupported` for `theme` disappears from `corpus/invalid/block.unsupported.meltemi`, which keeps a `story` block as its example.

## Open Questions

- Per-element font sizes and stroke widths as style properties.
- Theme files shared through `project.json` (stage 5).
- Whether `frame` should also accept a free-text subtitle (version, date) when exports are not required to be reproducible.
