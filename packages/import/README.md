# @meltemi/diagrams-import

Imports Mermaid (`flowchart`, `sequenceDiagram`, `C4*`, `architecture-beta`, `block-beta`) and
PlantUML (component, deployment, use case, sequence and C4-PlantUML, with the preprocessor) into
`.meltemi` sheets, with a report that says what was mapped, approximated or dropped, and merges a
re-import into a sheet that was adjusted since.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-import
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { importText } from "@meltemi/diagrams-import";

const result = importText("flowchart LR\n  shop[Web shop] --> orders[(Orders)]\n");
console.log(result.status, result.format); // the outcome and "mermaid"
console.log(result.text); // the .meltemi sheet
for (const finding of result.findings) console.log(finding);
```

## Documentation

- [Mermaid coverage](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/import/mermaid.md)
- [PlantUML coverage](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/import/plantuml.md)
- [From Mermaid](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/tracks/from-mermaid.md)
- [From PlantUML](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/tracks/from-plantuml.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
