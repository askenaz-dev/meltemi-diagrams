# @meltemi/diagrams-editor

Host-neutral editor services: diagnostics, completion, hover, definitions, references, rename,
formatting, quick fixes, symbols and semantic tokens; project sessions; the canvas session and its
protocol; exports and catalogs (`./node`). The VS Code extension and the playground are built on
it.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-editor
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```js
import { ProjectSessions } from "@meltemi/diagrams-editor/node";

const sessions = new ProjectSessions({ toolVersion: "1.0.0" });
const analysis = sessions.analyze("/work/shop/diagrams/overview.meltemi");
console.log(
  analysis.diagnostics,
  analysis.diagrams.map((d) => d.id),
);
```

## Documentation

- [Editor guide](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/editor.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
