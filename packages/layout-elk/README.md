# @meltemi/diagrams-layout-elk

The adapter of the [Eclipse Layout Kernel](https://eclipse.dev/elk/) (elkjs, EPL-2.0) for
`@meltemi/diagrams-layout`: automatic arrangement with ports, groups and label space, run
synchronously so that layouts are deterministic.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-layout-elk
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";

const text = `language "0.2"

diagram shop: flow {
  web["Web shop"]
  api["Orders API"]
  db[("Orders")]
  web -> api: "HTTPS" as call
  api -> db: "SQL" as store
}
`;

const compilation = compile(text);
const { scene } = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
  engine: createElkEngine(),
});
console.log(scene!.width > 0 && scene!.height > 0); // true
```

## Documentation

- [Layout](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/layout.md)
- [Decision 0015](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/decisions/0015-layout-engine.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
