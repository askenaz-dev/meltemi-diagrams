# @meltemi/diagrams-layout

Layout of every profile into a vector scene: measured boxes, ports, constraints, connector
routing, label placement, composition checks and the label audit. Automatic arrangement comes from
an engine such as `@meltemi/diagrams-layout-elk`.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-layout
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { layoutDiagram } from "@meltemi/diagrams-layout";
import { createElkEngine } from "@meltemi/diagrams-layout-elk";
import { compile } from "@meltemi/diagrams-model";
import { renderSvg } from "@meltemi/diagrams-render";

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
const result = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
  engine: createElkEngine(),
});
console.log(result.diagnostics.map((d) => d.code)); // composition and label findings
console.log(renderSvg(result.scene!).slice(0, 4)); // <svg
```

## Documentation

- [Layout](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/layout.md)
- [Styles and themes](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/styles.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
