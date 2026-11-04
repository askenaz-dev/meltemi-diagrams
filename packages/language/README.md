# @meltemi/diagrams-language

The language layer: a lexer, a lossless parser that keeps every byte (comments and spacing
included), diagnostics with stable codes, text edits and the source formatter. It knows the
grammar only; meaning lives in `@meltemi/diagrams-model`.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-language
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { formatSource, parse, toText } from "@meltemi/diagrams-language";

const text = `language "0.2"

diagram shop: flow {
  web["Web shop"]
  api["Orders API"]
  db[("Orders")]
  web -> api: "HTTPS" as call
  api -> db: "SQL" as store
}
`;

const parsed = parse(text);
console.log(parsed.diagnostics.length); // 0: no syntax error
console.log(toText(parsed.root) === text); // true: the tree keeps every byte
console.log(formatSource(text).text);
```

## Documentation

- [Grammar](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/grammar-0.2.md)
- [Diagnostics](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/diagnostics.md)
- [Formatting](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/formatting.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
