# @meltemi/diagrams-catalog

The offline HTML catalog of a project: every diagram and story by folder in one file, with the
player, accent-insensitive search, links between diagrams and through the model's entities,
drill-down from a view to the views it opens, SVG downloads and a strict content security policy.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install @meltemi/diagrams-catalog
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

Catalogs are usually built by the command line:

```bash
meltemi-diagrams build catalog my-project
```

The page and its data come from this package; `buildCatalog` in `@meltemi/diagrams-editor/node`
assembles them for a project.

## Documentation

- [The catalog](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/catalog.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
