# @meltemi/diagrams-cli

The command line of Meltemi Diagrams, `meltemi-diagrams` (alias `mdg`): start a project from a
template, preview its catalog with live reload, validate, format, lay out, import Mermaid and
PlantUML, export SVG, PNG, PDF, the HTML player, MP4, WebM and GIF, build the catalog, review what
changed since a Git revision or the cloud, use optional AI assistance, and keep a project in step
with the optional cloud service: sign in, push a folder, pull a project and publish the catalog.

It is part of [Meltemi Diagrams](https://github.com/askenaz-dev/meltemi-diagrams#readme), diagrams as code with a canvas, motion and
exports. Every package of the product has the same version.

## Install

```bash
npm install --global @meltemi/diagrams-cli
```

Node 22.12.0 or later. The package is an ES module with type declarations.

## Use

```bash
npm install --global @meltemi/diagrams-cli
meltemi-diagrams init shop --template purchase
meltemi-diagrams validate shop
meltemi-diagrams export shop --format png
meltemi-diagrams build catalog shop
```

PNG, PDF and video use the installed Edge or Chrome; video also uses the installed FFmpeg.

The cloud commands talk to the optional cloud service with an API token, and only when you run them:

```bash
meltemi-diagrams login
meltemi-diagrams push shop --create
meltemi-diagrams review shop --base cloud
meltemi-diagrams pull shop
meltemi-diagrams publish shop
```

`login` opens your browser and keeps a token in your configuration folder (`logout` revokes it,
`whoami` says who it is for, `projects` lists your cloud projects); `MELTEMI_TOKEN` in the
environment replaces it, for CI. A token goes only to the service you name (`--host`,
`MELTEMI_HOST`, else `https://diagrams.meltemi.dev`) and is never printed. `init --ci github --cloud`
adds a job that pushes on merge.

Messages are in English or Spanish: `--lang en|es`, else `MELTEMI_LANG` or the system's language.
Written files follow `--lang`, else the project's `"locale"`, else English, never the machine.

## Documentation

- [The command line](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/cli.md)
- [Getting started](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/getting-started.md)
- [All documentation](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/docs/README.md)

## Licence

MIT. Third-party components and their licences are listed in [THIRD_PARTY_LICENSES.md](https://github.com/askenaz-dev/meltemi-diagrams/blob/main/THIRD_PARTY_LICENSES.md).
