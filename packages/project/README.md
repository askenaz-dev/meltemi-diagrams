# @meltemi/diagrams-project

Projects of `.meltemi` files: `project.json`, relative imports with namespaces, shared themes,
models and stories across files, assets, plugins and limits, compiled incrementally through a
host that can be the file system, a browser's memory or an editor's buffers.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-project
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```ts
import { Workspace, createMemoryHost } from "@meltemi/diagrams-project";

const text = `language "0.2"

diagram shop: flow {
  web["Web shop"]
  api["Orders API"]
  db[("Orders")]
  web -> api: "HTTPS" as call
  api -> db: "SQL" as store
}
`;

const host = createMemoryHost({
  "/shop/project.json": '{ "name": "shop", "language": "0.2" }',
  "/shop/diagrams/overview.meltemi": text,
});
const workspace = new Workspace(host, "/shop", { toolVersion: "1.0.0" });
const program = workspace.compileProject();
for (const [path, file] of program.files) {
  console.log(path, file.compilation.diagnostics.length); // /shop/diagrams/overview.meltemi 0
}
```

## Documentation

- [Projects](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/language/projects.md)
- [Plugins](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/plugins.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
