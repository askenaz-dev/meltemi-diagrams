# @meltemi/diagrams-edit

Structured edits of `.meltemi` sources: an operation (move, resize, route, relabel, rename,
reorder, add, remove and many more) becomes the smallest text change that does it, keeping
comments and formatting, or a refusal with its reason.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-edit
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { planEdit } from "@meltemi/diagrams-edit";
import { applyTextEdits } from "@meltemi/diagrams-language";
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

const result = planEdit(compile(text), {
  kind: "setRelationLabel",
  diagram: "shop",
  relation: "call",
  label: "HTTPS and JSON",
});
if (result.ok) console.log(applyTextEdits(text, result.plan.edits));
else console.log(result.rejection.reason);
```

Elements created without a label take `defaultLabel(kind)` in the interface language of
`@meltemi/diagrams-i18n` ("Node", or "Nodo" in Spanish), as if the person had typed it;
`DEFAULT_LABELS` keeps the English ones.

## Documentation

- [Editor guide](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/editor.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
