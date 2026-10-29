# 0007. Branding is a theme of the language

Status: accepted (brand-themes change, October 2026); theme names and tokens updated by 0013. A
hand-drawn look is a theme token too, `sketch`, by
[decision 0058](0058-lines-sketch-and-text-alignment.md).

## Context

The diagrams tool belongs to the Meltemi family (the agentic IDE with the sails-and-hull mark and
the Aegean palette). Exports had a neutral look and the only way to brand a sheet was to
write colours into every file. The proposal reserves `theme <id> { }` blocks for exactly this and
places themes first in the precedence chain, before project rules and explicit styles.

## Decision

- A theme is a first-class construct: `theme <id> { }` compiles into tokens (colours, fonts, frame,
  wordmark, mark), inherits through `extends`, and is referenced by `theme "<id>"` on diagrams or by
  `meltemi-diagrams export --theme`. Validation matches styles: unknown tokens, duplicates, bad values,
  unknown bases and cycles are diagnostics with ranges.
- Built-in themes carry the family identity: `technical.light` is the default and `technical.dark` its
  counterpart; `editorial.light` and `editorial.dark` are the neutral, frameless look, and
  `stage.light` and `stage.dark` frame presentations with a header (decision 0013).
- Branding is drawn as a frame (footer or header strip) with the Meltemi mark, the `brand`
  wordmark and the diagram title. Nothing changes inside the sheet: content colours set by authors
  are theirs.
- The sub-brand is "Meltemi Diagrams" (decision 0009): the Meltemi lockup plus a `DIAGRAMS` pill, the same element the
  tool draws for tags. The name lives in one token, so it can change without touching code.

## Alternatives considered

- Hard-coding the brand in the renderer: fastest, but every tenant or customer would need a fork.
- A `brand` property on diagrams: too narrow; the frame, palette and fonts belong together.
- Watermarks over the sheet: hurt legibility and conflict with the proposal's composition rules.
- Naming the product "Meltemi Flow": collides with the `flow` profile that every file names.

## Consequences

- Files without `theme` now export with the frame; neutral exports need `theme "editorial.light"` or a
  two-line file theme with `frame none`.
- The scene model gained linear gradients and group transforms; the SVG contract allows one
  `<defs>` block for them.
- Themes are shared through imports (decision 0010) and the project's default theme (decision 0013).
- `brand/` holds assets derived from the Meltemi identity, under that project's licence.
- [Decision 0061](0061-unbranded-exports.md) lets an export leave the frame out by request,
  whatever the theme says, for the accounts an administrator entitles in the hosted page.
