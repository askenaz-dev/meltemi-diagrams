# @meltemi/diagrams-mcp

The Model Context Protocol tools of Meltemi Diagrams, defined once: the catalogue of twenty-seven
tools (projects, files, versions, previews, sharing, live sessions and publishing), the wrapper
that answers every call with stable error codes, the stateless Streamable HTTP handler, and the
engine that checks a project and draws its previews. The hosted endpoint
(`https://diagrams.meltemi.dev/mcp`) and the command line's local server (`mdg mcp`) are both
built from it, so they list the same tools and draw the same pictures.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version. To give an agent these tools, run
`mdg mcp` from [`@meltemi/diagrams-cli`](https://www.npmjs.com/package/@meltemi/diagrams-cli)
rather than this package.

## Install

```bash
npm install @meltemi/diagrams-mcp
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { nodeRenderer } from "@meltemi/diagrams-mcp/node";

const renderer = nodeRenderer();
const outcome = await renderer.render({
  revision: 1,
  files: { "shop.meltemi": 'language "0.2"\n\ndiagram shop: flow {\n  web -> api\n}\n' },
  file: "shop.meltemi",
  format: "png",
});
console.log(outcome.ok && outcome.contentType, outcome.ok && outcome.report.elements); // image/png 2
```

- `@meltemi/diagrams-mcp`: `TOOLS` and `CATALOGUE`, `buildServer`, `statelessHandler`, `Refusal`
  and the shapes.
- `@meltemi/diagrams-mcp/preview`: `RendererCore`, `PreviewEngine`, the rasteriser and the bounds
  of a picture, with nothing of the platform.
- `@meltemi/diagrams-mcp/node`: the engine over the installed fonts, icons and resvg.

## Documentation

- [Agents](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/agents.md)
- [The command line](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/cli.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
`@resvg/resvg-wasm` (MPL-2.0) is a dependency, used unmodified.
