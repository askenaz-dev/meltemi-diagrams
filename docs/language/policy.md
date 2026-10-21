# Language change policy

[Español](../es/language/policy.md)

`.meltemi` files are kept for years in repositories and read by tools of different ages. This page
says what a language version promises, how the language changes, and how the other contracts
around it are versioned. The [conformance suite](conformance.md) checks the promises; the
[release process](../../RELEASING.md) applies them.

## Versions

A file names its language version in its first statement:

```text
language "0.2"
```

The header is optional; a file without it is read as the version the tool implements. A tool
reports a version it does not implement as `language.unsupported-version` and does not guess.

There are three other contracts, each with its own version:

| Contract         | Where it is declared                                          | Version today | Rules                                             |
| ---------------- | ------------------------------------------------------------- | ------------- | ------------------------------------------------- |
| The product      | every package, the CLI and the extension                      | 1.8.0         | semantic versioning, all in step (decision 0033)  |
| The model JSON   | `"version"` in every model JSON file (`MODEL_JSON_VERSION`)   | 0.1           | a new version for any change of an existing field |
| The model API    | `MODEL_API_VERSION`; plugins declare the range they accept    | 1.0.0         | semantic versioning (decision 0030)               |
| The renderer API | `RENDERER_API_VERSION`; plugins declare the range they accept | 1.0.0         | semantic versioning (decision 0030)               |

A product release may leave the language, the model JSON and the APIs unchanged; the product
1.8.0 implements language 0.2.

## What a version promises

Within a language version, a valid file stays valid and keeps its meaning: the same model, the
same drawing for the same tool version and theme, and the same exports. Changes within a version
only add:

- new statements, properties, values, profiles or diagram types that no valid file could contain
  before;
- new warnings and information diagnostics, and errors for files that were already wrong but not
  reported;
- better layouts of elements the file leaves to the layout engine (`layout auto`, unplaced boxes in
  `layout assisted`). What a file places, sizes or routes does not move.

A change needs a new language version when it would:

- make a valid file invalid, or turn one of its warnings into an error;
- change the meaning of a valid file: what an element, relation, reference or statement denotes,
  how an id is resolved, a default value, or the order of messages;
- remove or rename a keyword, property or value.

Diagnostic codes are stable: a code is never reused for another problem, and its severity is only
raised within a version for files that were always wrong.

## Deprecation

Something the language will remove is deprecated first: a warning with its own stable code, a
message that says what replaces it, and a quick fix that rewrites the file. A deprecation stays for
at least one minor product release before a new language version removes it.

## Migrations

A new language version ships with an explicit command, `meltemi-diagrams migrate`, that:

- writes the migrated file next to the original, never in place, and leaves the original
  untouched;
- reports every change it made, with lines, and every construct it could not migrate;
- keeps comments, ids, placement and styles, as every edit does.

Tools keep reading the previous language version for at least one major product version after a
new one, so that a repository can migrate when its owners choose. Opening an older file never
rewrites it.

## How the language changes

Every change to the language is an OpenSpec change (`openspec/changes/`) with:

1. a decision note in `docs/decisions/` that names the problem, the alternatives and what existing
   files see;
2. the grammar update in [grammar-0.2.md](grammar-0.2.md) (or the next version's grammar) and the
   affected profile references;
3. new conformance cases: valid files with their model JSON and invalid files with their
   diagnostics in `corpus/`, and a project case when the change concerns projects;
4. the diagnostics in [diagnostics.md](diagnostics.md), with the quick fixes;
5. the importers' coverage tables when the change maps a Mermaid or PlantUML construct.

A change that needs a new language version also states the migration and its tests.

## Extensions

Plugins extend the language as data: diagram types with their kinds, properties and rules, and icon
packs ([plugins](../plugins.md)). They declare the model and renderer versions they accept, and a
tool refuses a plugin whose ranges it does not meet (`plugin.incompatible`). A plugin cannot change
the meaning of the built-in language.
