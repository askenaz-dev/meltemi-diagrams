# @meltemi/diagrams-render

Renders a vector scene to portable SVG: one file with its fonts embedded, outlined or named,
accessible titles and descriptions, links, and nothing that needs a network.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-render
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { createNodeFontLibrary } from "@meltemi/diagrams-fonts/node";
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

const fonts = createNodeFontLibrary();
const compilation = compile(text);
const { scene } = layoutDiagram(compilation, compilation.document.diagrams[0]!, {
  measurer: fonts,
  engine: createElkEngine(),
});
const svg = renderSvg(scene!, { fonts: "embedded", provider: fonts });
console.log(svg.includes("@font-face")); // true: the picture carries its fonts
```

## Documentation

- [SVG export](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/svg-export.md)
- [Fonts](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/fonts.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
