# Conformance

[Español](../es/language/conformance.md)

The conformance suite fixes what `.meltemi` files mean. Any tool that reads them, this one or
another, can run it and know whether it reads files as Meltemi Diagrams does. It is the corpus of
this repository, with the expected result of each case, and a runner that takes another
implementation as commands.

```bash
pnpm conformance
```

## Cases

| Cases                                         | An implementation conforms when                                                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `corpus/valid/**/*.meltemi` (model)           | the model JSON it prints equals `<name>.model.json`, compared as JSON                                                            |
| `corpus/invalid/*.meltemi` (file diagnostics) | it reports the language codes of `<name>.diagnostics.json`: every code other than `layout.*` (the drawing) and `asset.*` (files) |
| `corpus/projects/valid/*` (valid project)     | it reports no error for any file of the project                                                                                  |
| `corpus/projects/invalid/*` (invalid project) | it reports, file by file, the codes of `expected.json` other than `layout.*`                                                     |

Diagnostics are compared by code, so messages and their wording may differ between
implementations; ranges are part of the model JSON. Layout findings are checked by the layout's own
tests, because they depend on fonts and a layout engine, not on the language.

## Another implementation

Give the runner the commands of the other implementation, with `{file}` where the path goes:

```bash
pnpm conformance --command "my-tool to-json {file}" --diagnostics "my-tool check --json {file}"
```

- `--command` prints the model JSON of one `.meltemi` file on standard output, in the format
  [model JSON](model-json.md) describes, as `meltemi-diagrams convert <file> --to json --stdout`
  does.
- `--diagnostics` prints the diagnostics of a file or a project folder as
  `meltemi-diagrams validate <path> --json` does: `{ "files": [{ "path", "diagnostics": [{ "code", "severity" }] }] }`,
  with paths relative to the repository or absolute.

Either may be left out; the runner then uses this implementation for that part. Commands run from
the repository's root folder.

## Report

The runner prints each failing case with what differed, the first differing JSON path for models
(`differs at $.diagrams[0].relations[1].label`) or the expected and reported codes for diagnostics,
then the totals by kind. It exits 1 when a case fails.

```text
  ✗ model valid/checkout.meltemi: differs at $.diagrams[0].relations[0].label
23 of 24 model cases pass
66 of 66 file diagnostics cases pass
5 of 5 valid project cases pass
39 of 39 invalid project cases pass
```

## Adding cases

Every language change adds its cases ([policy](policy.md)): a valid file and its model JSON, an
invalid file named after the diagnostic it shows, or a project folder with `expected.json`. The
snapshots are written by the tests (`pnpm test -u`) and reviewed like code ([corpus](../../corpus/README.md)).
