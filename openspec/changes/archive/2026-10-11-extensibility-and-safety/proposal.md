## Why

The proposal asks new diagram types to register their schema, validation, layout, editing tools
and conversion to primitives; diagrams never run code by being opened; executable plugins are
explicitly installed extensions with permissions and identifiable versions; plugins and resource
packs keep provenance and version; extensions declare compatibility with the versions of the
intermediate model and of the renderer. Imported SVG is sanitised, paths are confined to the
project, network references are off by default, there are size and complexity limits for images,
fonts, imports and renders, and exporters log useful errors without leaking secrets — protecting
the local editor and automated jobs that process external repositories. Roadmap change 21 asks for
all of it.

## What Changes

- **Diagram type registry.** `DiagramTypeDefinition` (model API 1.0.0): kinds with labels, shapes
  and styles (primitives), typed properties and required ones (schema and validation), allowed
  relations and relation properties, layout mode, algorithm (`layered` or `tree`) and direction,
  and palette tools. `readDiagramType` checks definitions; `compile(text, { types })` compiles
  declared types on the free profile: kinds become boxes with `typeKind` and `data`;
  `type.missing-property`, `type.relation-not-allowed`; rules by kind; the type's style first in
  the style cascade; the ELK engine's tree placement; JSON `declaredType`, `typeKind`, `data`.
- **Plugins are data.** `meltemi-plugin.json` declares diagram types and an icon pack, with
  name, version, licence, homepage, `compatibility` (model and renderer ranges) and requested
  permissions; fields that would name code are ignored. project.json `plugins` installs each
  explicitly (folder inside the project, exact version, granted permissions `diagram-types` and
  `icons`; no `network`). Diagnostics `plugin.*`; the lock records version, folder and integrity;
  `meltemi-diagrams plugins` lists them.
- **Editor.** Completion of declared kinds, their properties and enum values; hover on kinds and
  types; the canvas palette offers a declared type's tools; `createElement` writes declared kinds.
- **Limits.** Sources (2 Mi characters, `limit.too-large`), diagrams (5,000 elements, 10,000
  relations or events, `limit.too-complex`), projects (2,000 sources, `limit.too-many-files`),
  manifests (1 Mi characters); asset limits as before.
- **No network, no code.** Player pages gain a content security policy like the catalog's.
- **Errors without secrets.** The command line prints unexpected errors without secret-looking
  environment values or stacks (unless `MELTEMI_DEBUG`), exit 70.
- **Docs.** `docs/plugins.md`, `docs/security.md`, decision 0030, diagnostics, projects, CLI,
  editor, README, skill.

## Capabilities

### New Capabilities

- `diagram-type-registry`: declared diagram types.
- `project-plugins`: plugins installed by projects.
- `safety-limits`: limits, no code, no network, errors without secrets.

### Modified Capabilities

- `project-manifest`: the `plugins` field.

## Impact

- `Element` gains `typeKind` and `data`, `Relation` gains `data`, `FlowDiagram` gains
  `definition`; the style resolver, the arrange request (`algorithm`), the canvas render (`tools`)
  and `createElement` know declared types.
- `Workspace.plugins()` and `Workspace.limits()`; the asset discovery and lock take plugins.
- Corpus: `corpus/projects/valid/plugins` and one invalid project per `plugin.*` and `type.*`
  code.
