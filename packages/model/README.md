# @meltemi/diagrams-model

The typed intermediate model of `.meltemi` documents: compilation of the flow, free, sequence
and C4 profiles, models, stories and export profiles, validation with stable diagnostics, and the
model JSON interchange format.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-model
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { compile, toJson } from "@meltemi/diagrams-model";

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
console.log(compilation.diagnostics); // []
const diagram = compilation.document.diagrams[0]!;
console.log(diagram.id, diagram.elements.length, diagram.relations.length); // shop 3 2
console.log(toJson(compilation).format); // the model JSON format name
```

## Documentation

- [Model JSON](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/model-json.md)
- [Grammar](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/grammar-0.2.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
