# Corpus

Reference `.meltemi` files and projects shared by every package test. They are also the
[conformance suite](../docs/language/conformance.md) of the language. Files are byte-exact inputs:
line endings, tabs and byte order marks are part of the test. `.gitattributes` turns off
line-ending conversion here and prettier ignores this folder.

| Folder        | Contents                                                                                                                                                      | Checked by                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `valid/`      | files of every profile that compile without errors: flow (with `edge/` cases and `layout/` modes), `free/`, `sequence/`, `c4/`, `motion/` and `stories/`      | model snapshot, round trip, CLI, conformance                     |
| `invalid/`    | one file per diagnostic code, named after the code                                                                                                            | diagnostics snapshot, round trip, conformance                    |
| `edits/`      | edit fixtures: `before.meltemi`, `operation.json`, and `after.meltemi` or `rejection.json`                                                                    | `@meltemi/diagrams-edit` fixture tests                           |
| `import/`     | Mermaid, PlantUML and Markdown inputs with the imported `<name>.meltemi` and `<name>.report.json`; `merge/<case>/` holds an adjusted sheet, a changed source and the merged result | `@meltemi/diagrams-import` corpus test |
| `projects/`   | `valid/` projects that compile cleanly, with an SVG of each diagram; `invalid/` projects, one per project, module, asset, plugin and type code, with `expected.json` | the CLI's project tests, conformance                         |
| `acceptance/` | the acceptance corpus: five sheets per profile (`cycles`, `long-labels`, `nested`, `parallel`, `thirty`) with SVG snapshots, `errors/`, `edits/` scenarios and the pixel references in `visual/` | `packages/acceptance` ([quality](../docs/quality.md)) |

## Snapshots

Next to each `.meltemi` file in `valid/` there is a `<name>.model.json` with the output of
`toJson(compile(text))`. Next to each file in `invalid/` there is a `<name>.diagnostics.json` with
its diagnostics. Both are written by vitest file snapshots, like the SVG snapshots of projects and
of the acceptance corpus.

Regenerate them after an intended change, then review every diff:

```bash
pnpm test -u
```

A new snapshot is written the first time a test runs locally. In CI (`CI=true`) a missing snapshot
fails the run. A change of a model or diagnostics snapshot is a change of the language's meaning:
it follows the [language change policy](../docs/language/policy.md).

## Adding a file

- Start valid and invalid files with `language "0.2"` unless the file tests the header itself.
- An invalid file must produce at least one diagnostic whose code is its file name, unless the code
  belongs to another layer (the layout or an export), which its diagnostics snapshot shows.
- Keep files small and focused; one problem per invalid file.
- Write CRLF, tab or byte order mark files with a tool that preserves bytes, such as `printf`.
