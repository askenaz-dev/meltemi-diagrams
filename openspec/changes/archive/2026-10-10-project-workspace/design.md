## Context

- `compile(text)` is pure and works on one file. Top-level ids (diagrams, themes, models, stories, exports) share one namespace per file.
- Themes are found by `theme "<name>"` on a diagram and by `extends "<name>"` in a theme. Names are strings, and built-in names contain a dot (`meltemi.light`).
- The layout resolves themes with `resolveTheme(name, definitions)`, where `definitions` are the file's themes.
- The CLI reads files with `node:fs`; the editor (roadmap change 8) will need the same compilation with unsaved buffers.
- The proposal fixes the rules: projects are normal folders with a manifest; imports are relative with explicit namespaces; cycles between modules are rejected; caches are regenerable; manual decisions stay in the source.

## Goals / Non-Goals

**Goals:**
- One module system for every kind of top-level block, with diagnostics that point at the import statement.
- `compile(text)` stays single-file and pure. Cross-file resolution lives in a host-neutral package that the CLI, the editor and the playground share.
- Incremental: changing one file recompiles that file and the files that import it, nothing else.

**Non-Goals:**
- Project default theme and assets (roadmap 6), models (roadmap 11), `init` (roadmap 19).

## Decisions

### D1. Two import forms, both explicit

```text
import "../themes/company.meltemi" as company      // namespace: company.corporate
import corporate as corp, base from "../themes/company.meltemi"   // members: corp, base
```

- **Namespace import.** It binds one name, and every top-level id of the module is reached as `<namespace>.<id>`.
- **Member import.** It binds each listed id, optionally renamed with `as`.
- **Shared namespace.** Bound names join the file's top-level namespace, so a binding that equals a diagram, theme or other binding is `ref.duplicate-id`.
- **Built-in prefixes.** A binding equal to the first segment of a built-in theme name (`meltemi`, `studio`) is `module.reserved-name`, because `"meltemi.light"` must keep meaning the built-in theme.

| Alternative | Why not |
|---|---|
| Only namespace imports | A one-diagram file would be referred to as `checkout.checkout` |
| Only member imports | Large model files would need long import lists, and the proposal asks for namespaces |
| Implicit project-wide visibility of every top-level id | Breaks "explicit namespaces", hides dependencies from review, and makes renames ambiguous |

Recommendation: both forms. Recorded in `docs/decisions/0010-module-system.md`.

### D2. Path rules

A path must satisfy all of the following:

- it is a string starting with `./` or `../`;
- it uses `/` as the separator;
- it ends in `.meltemi`;
- it contains no empty segment;
- it is not absolute and not a URL. Otherwise it is `module.invalid-path`, because network references are disabled.

Resolution is relative to the importing file and normalised. A result outside the project root is `module.outside-project`. A missing file is `module.not-found`, with the resolved path in the message.

Paths are case-sensitive. When a file exists with a different case, the message names it, so a project behaves the same on Windows, macOS and Linux.

### D3. Position, duplicates and unused imports

- Imports come after the optional header and before the first block. A later import is `module.import-position` (warning) and still works.
- Importing the same resolved file twice in one file is `module.duplicate-import` (warning), reported on the second import.
- A binding that no reference uses is `module.unused-import`, with severity `info` so editors can fade it.
- A member import of an id the module does not define is `module.unknown-member` (error), listing the ids the module offers.

### D4. Cycles

The import graph of the files being compiled is checked with a depth-first search. Each import that closes a cycle is `module.cycle` (error), with the chain `a.meltemi → b.meltemi → a.meltemi` in the message. The cycle is cut at that edge: the imported module's names stay unresolved in the importing file, so compilation never loops and the other diagnostics still appear. Relations that loop inside a diagram are unaffected, as the proposal asks.

### D5. Project root and manifest

- **Root discovery.** The root is the nearest ancestor folder of the file that contains `project.json`. Without one, the root is the file's own folder, so a loose file can still import siblings and subfolders.
- **Manifest version 1:**

| Field | Type | Rule |
|---|---|---|
| `$schema` | string | ignored, for editors |
| `name` | string, required | non-empty; used later by the catalog |
| `language` | string, required | must equal the supported language version, otherwise `project.invalid-value` |
| `tools` | object | `{ "meltemi-diagrams": "<range>" }`; a range the running tool does not satisfy is `project.tool-version` (error) |
| `sources` | array of strings | relative folders or files to compile, default `["."]` |
| `exclude` | array of strings | relative paths skipped; `node_modules` and hidden folders (`.git`, `.meltemi`, …) are always skipped |

- **Field errors.** Unknown fields are `project.unknown-field` (warning), missing required fields are `project.missing-field`, and invalid JSON is `project.invalid-json`. All of them carry ranges inside `project.json`, using a small position-aware JSON reader written for this package.
- **Version ranges.** These forms are supported: exact (`0.3.0`), caret (`^0.3.0`), tilde (`~0.3.0`), comparators (`>=0.3.0 <1.0.0`) and `*`. Anything else is `project.invalid-value`.
- **Language mismatch.** A file whose `language` header differs from the manifest's `language` is `project.language-mismatch` on the header.
- **Schema.** `schemas/project.schema.json` describes the same fields for editor validation and completion.

### D6. Package and host interface

| Package | Public surface |
|---|---|
| `@meltemi/diagrams-project` | `ProjectHost` (`readFile`, `fileExists`, `readDirectory`, `realCasePath?`); `findProjectRoot(host, path)`; `readManifest(host, root, { toolVersion })`; `listSources(host, root, manifest)`; `Workspace` (`new Workspace(host, root, options)`, `compileProject()`, `compileFile(path)`, `setOverlay(path, text \| null)`, `invalidate(path)`); `ProjectCompilation`, `FileCompilation`, `Binding`, `ResolvedReference`; `resolveReference(file, ref, kinds)`; `themeDefinitionsFor(file)`; `satisfiesRange(version, range)`; `parseJsonWithPositions(text)` |
| `@meltemi/diagrams-project/node` | `createNodeHost()` with `node:fs` |
| `@meltemi/diagrams-language` | `ImportStatement` CST node (`keyword`, `members`, `fromKeyword`, `path`, `asKeyword`, `namespace`); `import` in `TOP_LEVEL_KEYWORDS` |
| `@meltemi/diagrams-model` | `Document.imports: ImportDeclaration[]` (path, bindings with ranges, kind); `checkThemeBases` skips names whose first segment, or whole text, is an import binding |
| `@meltemi/diagrams-layout` | `LayoutOptions.themes?: readonly ThemeDefinition[]`, used instead of the file's themes when present |
| `@meltemi/diagrams-cli` | project mode in `validate` and `export`, using the Node host |

Paths inside the package are POSIX strings relative to the root (`diagrams/checkout.meltemi`). Hosts convert to and from native paths.

### D7. Theme scopes across files

Each theme in the compiled closure gets a key `<path>#<id>`. `themeDefinitionsFor(file)` returns:

- the file's own themes, with `extends` rewritten to keys when it names an imported theme;
- one alias definition per visible imported name (`corp`, `company.corporate`), with `extends: <key>` and no tokens;
- every theme reachable through imports, under its key, with its `extends` rewritten in the scope of its own file.

`resolveTheme` then works unchanged, because aliases add no tokens. The project reports `theme.unknown-base` on a name with an import prefix that resolves to nothing, in the file that wrote it. An inheritance loop across files cannot exist without an import cycle: each `extends` that crosses files needs an import. Such a loop is therefore reported once, as `module.cycle`. The cut import leaves its names unresolved, and they are not reported again.

### D8. Qualified references to top-level blocks

`resolveReference(file, ref, kinds)` resolves a `QualifiedRef` or a dotted string in this order:

1. a local top-level id;
2. a member binding;
3. `namespace.id`.

The result is `{ file, id, kind }` or a `ref.unknown-*` style failure naming the candidates. The C4 `using`, the story `for` and the export `for` targets use it in roadmap changes 11, 14 and 16. Here it is tested on diagrams and themes.

### D9. Incremental workspace

`Workspace` caches per path the text it compiled and the result. A file's text comes from the overlay when one is set, otherwise from the host.

- `invalidate(path)` and `setOverlay` drop that file's entry, plus the module-resolution results of every file that imports it, directly or transitively.
- `compileFile(path)` compiles the file and its import closure, reusing cached single-file compilations.

Single-file `compile()` results are immutable and shared. Cross-file results are rebuilt from them, which is cheap (map lookups). No cache is written to disk, so there is nothing to regenerate. If a future cache is needed, it lives under `.meltemi/cache/`, which is always excluded.

### D10. CLI project mode

**`validate <path>…`:**

- A folder is validated as a project: the root is the folder or its nearest manifest ancestor. Its manifest and every source file are compiled through one `Workspace`.
- A file is compiled with its imports. Diagnostics of imported files are printed only when they are also among the given paths.
- `project.json` diagnostics are printed with the file `project.json`. The summary counts `.meltemi` files plus the manifest when it has diagnostics.
- `--json` adds the manifest as a file entry.

**`export <file>`:** it compiles the file through the Workspace of its project. Imported themes therefore resolve, and module errors in the file make the exit code 1.

### D11. One version for all packages

All packages and `CLI_VERSION` share one version. This change sets it to `0.3.0`, and a test checks that they agree. The `tools` range check compares against `CLI_VERSION`.

## Risks / Trade-offs

- [Case-insensitive file systems hide a wrong-case import that breaks on Linux] → Hosts that can report the real case (`realCasePath`) make it a `module.not-found` that names the real file.
- [Alias definitions show the alias as the theme name in diagnostics] → Layout diagnostics use the name written in the source, which is the alias, and that is what the user wrote.
- [A large project recompiles every importer when a shared theme changes] → Single-file compilations are reused; only cross-file resolution reruns, and it is linear in the number of imports.
