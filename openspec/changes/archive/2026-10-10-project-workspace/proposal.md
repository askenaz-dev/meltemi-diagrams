## Why

The proposal defines Meltemi Diagrams projects as plain folders: a manifest, models, diagrams, stories, themes and assets in separate files, connected by relative imports with explicit namespaces. Today every `.meltemi` file stands alone: a theme cannot be shared between diagrams, a model cannot be reused by several views, and a story cannot live next to the diagram it explains. C4 views, stories, export profiles, the catalog and the editor's workspace all depend on files referring to each other. That is why the project and module system comes before them in the roadmap.

## What Changes

Roadmap change **3** (`docs/roadmap-1.0.md`), part of **Stage 5 (integration: repositories)**. It is built first because the later profiles, stories, exports and the editor need it.

- **Language: `import` statements.** Two top-level forms:
  - `import "<path>" as <namespace>` imports a whole module, and its top-level ids are used as `<namespace>.<id>`;
  - `import <id> [as <alias>], … from "<path>"` imports chosen ids.

  Paths are relative to the importing file (`./` or `../`), use forward slashes, end in `.meltemi` and must stay inside the project. Imports come after the `language` header and before the first block.
- **Project manifest.** A `project.json` file marks the project root and declares:
  - the project `name`;
  - the `language` version every file uses;
  - the required `tools` version range;
  - the `sources` and `exclude` folders.

  Without a manifest, the folder of the file being compiled is the root. A JSON schema for the manifest ships with the tool.
- **New `@meltemi/diagrams-project` package.** It is host-neutral, works through a file-system interface, and includes a Node host as a subpath. It provides:
  - manifest reading and validation;
  - discovery of the project root and of its sources;
  - import resolution: paths, bindings, members, reserved names, duplicates, unused imports;
  - module cycle rejection;
  - a resolver for qualified references to top-level blocks across modules;
  - theme scopes across files;
  - an incremental `Workspace` with unsaved-buffer overlays that recompiles only what changed and its dependents.
- **Themes across files.** `theme "<name>"` and `extends "<name>"` resolve imported themes, by member binding or by `namespace.id`. Unknown bases and inheritance cycles are reported across files.
- **CLI.**
  - `meltemi-diagrams validate` validates whole projects, including `project.json`, the imports and cross-file references.
  - `meltemi-diagrams export` resolves the file's imports inside its project.
- New diagnostic codes:
  - `module.invalid-path`, `module.outside-project`, `module.not-found`, `module.unknown-member`, `module.reserved-name`;
  - `module.cycle`, `module.duplicate-import`, `module.unused-import`, `module.import-position`;
  - `project.invalid-json`, `project.missing-field`, `project.unknown-field`, `project.invalid-value`;
  - `project.language-mismatch`, `project.tool-version`.
- Every package and the CLI share one version number, checked by a test.
- **Docs.**
  - `docs/language/projects.md`;
  - grammar and diagnostics references;
  - a README section;
  - the skill's language reference;
  - decision note 0010 (module system).

## Capabilities

### New Capabilities
- `module-imports`: import syntax, path rules, bindings, qualified references to imported blocks, and every `module.*` diagnostic.
- `project-manifest`: `project.json`, root discovery, sources and excludes, version pins, the schema, and every `project.*` diagnostic.
- `project-compilation`: compiling a project or a file with its imports, theme scopes across files, cross-file theme diagnostics, the qualified-reference resolver and the incremental workspace.

### Modified Capabilities
- `language-syntax`: the source file structure gains `import` statements.
- `theme-blocks`: `extends` and theme resolution accept imported themes.
- `cli-validation`: `validate` works on projects and reports `project.json` diagnostics.
- `cli-export`: `export` resolves imports through the file's project.

## Impact

- **New package:** `packages/project` (`@meltemi/diagrams-project`), with no runtime dependencies.
- **Changed packages:**
  - `@meltemi/diagrams-language`: `ImportStatement` in the CST, the `import` keyword;
  - `@meltemi/diagrams-model`: `Document.imports`, and `theme.unknown-base` deferred for imported names;
  - `@meltemi/diagrams-layout`: a `themes` option on `layoutDiagram`;
  - `@meltemi/diagrams-cli`: project mode for `validate` and `export`.
- New corpus folder `corpus/projects/` with valid and invalid projects.
- `schemas/project.schema.json` for editors.

## Non-goals

- The project default theme, asset folders and `assets.lock.json`. They belong to roadmap change 6 (`styles-themes-icons`), which also defines the style precedence that the project level takes part in.
- `model` blocks and qualified references inside models (`shop.api`), which come with roadmap change 11 (`c4-profile`). The resolver built here handles references to top-level blocks across modules.
- `meltemi-diagrams init` and project templates, which come with roadmap change 19 (`cli-complete`).
