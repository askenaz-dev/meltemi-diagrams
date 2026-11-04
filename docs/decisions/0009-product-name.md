# 0009. Product name: Meltemi Diagrams

Status: accepted (meltemi-diagrams-name change, 10 October 2026).

## Context

The proposal used "Architecture Studio" as a working name. The product belongs to the Meltemi
family (decision 0007), and the VS Code extension, the export footer, the lockups and the agent skill
all carry the product name, so it has to be decided and used consistently everywhere.

## Decision

- The product is **Meltemi Diagrams**, chosen by the product owner on 10 October 2026.
- The framed built-in themes (`technical.*`, `stage.*`) draw `Meltemi Diagrams` in the export frame (`BRAND_NAME` in
  `packages/layout/src/theme.ts`).
- The lockups carry a `DIAGRAMS` pill. Brand files are named `brand/meltemi-diagrams-*.svg`.
- The agent skill is `skills/meltemi-diagrams`. `pnpm skills:sync` tracks the skills it manages in
  a `.skills-sync.json` manifest per agent folder, so it removes skills it copied before without
  touching skills it does not manage (the OpenSpec skills).
- Unchanged: the `.meltemi` file extension and the tagline _The wind that draws_.
- The command `meltemi-diagrams` (alias `mdg`) and the `@meltemi/diagrams-*` packages follow from
  the name (decision 0002).

## Alternatives considered

- Meltemi Charts: the nautical-chart reading is apt, but "charts" suggests data charts.
- Meltemi Draft: reads as "borrador" (draft copy) in Spanish.
- Meltemi Rumbo: only works in Spanish.
- Meltemi Flow: collides with the `flow` profile that every file names.

## Consequences

- The name lives in one token (`BRAND_NAME`), the brand file names, the skill folder and the docs.
- Before publication, the owner runs a trademark search for "Meltemi Diagrams" and registers the
  `@meltemi` npm organisation and the Marketplace publisher id (roadmap change 24).
