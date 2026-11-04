# @meltemi/diagrams-assist

Optional AI assistance for `.meltemi` sources: adapters for Anthropic and OpenAI-compatible
endpoints (local ones included), proposals of whole blocks checked against the project and
reconciled with later edits, accepted in part, and redaction of secrets. Nothing is sent unless a
person asks.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-assist
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

Assistance is used through the command line and the editor:

```bash
meltemi-diagrams assist generate diagrams/new.meltemi --prompt "The checkout of a web shop"
```

The adapters, the prompt guide and the proposal format are this package's exports.

## Documentation

- [AI assistance](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/assist.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
