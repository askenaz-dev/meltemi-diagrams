# Konfío Agent Platform

The architecture sheet "Konfío Agent Platform · Propuesta para validar · 9 oct 2026" converted from
its HTML design to `.meltemi`. The original is kept as `source.html` for comparison; the conversion is
`konfio-agent-platform.meltemi` and the rendered result is `konfio-agent-platform.svg`, which the
test suite keeps in sync with the source.

```bash
pnpm mdg export examples/konfio-agent-platform/konfio-agent-platform.meltemi
```

## How the sheet maps to the language

| Original                                            | `.meltemi`                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Coloured bands (Auth0, Observabilidad, AgentCore Runtime, Context Layer) | `group` elements with explicit `place` and `size`; colours in `style` blocks |
| Boxes with a title and a subtitle                   | `node id "Title" { description "subtitle" }`                                            |
| Postgres, Redis, Milvus, Fuentes S3                 | `data` elements, drawn as cylinders (the original drew plain boxes)                     |
| Dashed outline, "propuesto o por validar"           | one shared `style a, b, c, ... { line dashed }`                                          |
| Numbered step circles beside arrows                 | relation labels `"1"` to `"8"` placed with `label r1 at 50% offset (16, 0)` and styled dark |
| Auth0 capability pills on box corners               | `tag` elements placed at the original coordinates                                       |
| Free text inside bands                              | `note` elements with `\n` line breaks                                                   |
| Arrows                                              | relations without `route`: the exporter joins facing sides at the centre of their overlap, which reproduces every straight arrow; the external-clients arrow has one waypoint |
| HTML legend under the diagram                       | a row of `tag` and dashed `tag` elements inside the sheet                               |
| "Cómo viaja una petición" and the undrawn steps     | comments next to the relations                                                          |

Every coordinate is the one of the original SVG (`place` is the centre of each box), so the export
can be compared with the original side by side.

## Intended differences

- Band titles are left-aligned; the original centred two of them.
- Data stores are cylinders, which is what `data` means in the language.
- The legend is part of the SVG, so the exported file is self-describing.
- Text uses Inter, embedded in the SVG, because the sheet uses the technical theme; the original
  loads IBM Plex from Google Fonts. `theme "editorial.light"` switches to IBM Plex.
- The sheet uses `theme "technical.light"`: Inter, the Aegean neutrals and a footer with the Meltemi
  mark, the `Meltemi Diagrams` wordmark and the title. `theme "editorial.light"` gives the neutral sheet
  of the first conversion; the explicit Auth0, KrakenD and Context Layer colours are kept in both.
