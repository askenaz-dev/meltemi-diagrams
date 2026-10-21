# 0010. Module system: relative imports with explicit names

Status: accepted (project-workspace change, 10 October 2026)

## Context

The proposal defines projects as plain folders whose files refer to each other through relative
imports with explicit namespaces, with module cycles rejected. Themes, models, stories and export
profiles must be shareable between files, and the editor, the CLI and the playground must compile
them the same way, including unsaved buffers.

## Decision

- Two import forms: namespace imports, `import "<path>" as <ns>`, and member imports,
  `import <id> [as <alias>], ... from "<path>"`. Every top-level block is importable; there is no
  export list.
- Paths are relative (`./`, `../`), use `/`, end in `.meltemi` and stay inside the project root.
  URLs and absolute paths are rejected, so compilation never touches the network.
- Bound names share the file's top-level namespace. The prefixes of the built-in theme names
  (`technical`, `editorial` and `stage` since decision 0013) are reserved.
- The project root is the nearest folder with `project.json`, or the file's folder without one. The
  manifest pins the language and tool versions and selects the sources.
- `compile(text)` stays single-file and pure. Cross-file resolution lives in the host-neutral
  `@meltemi/diagrams-project` package. Its `Workspace` caches single-file compilations by text and
  accepts overlays.
- Import cycles are `module.cycle`, and the closing import is cut. Theme inheritance across files can
  only loop through an import cycle, so such a loop is reported once, as `module.cycle`.

## Alternatives considered

- Only namespace imports: a one-diagram file would be referred to as `checkout.checkout`.
- Only member imports: long lists for model files, and the proposal asks for namespaces.
- Implicit project-wide visibility of every id: hides dependencies from review and makes renames
  ambiguous.
- Resolving imports inside `compile()`: it would need file access and would no longer be pure.

## Consequences

- C4 views, stories and export profiles (roadmap changes 11, 14 and 16) resolve their targets with
  `resolveReference`.
- The editor (roadmap change 8) gives open buffers to the Workspace as overlays and gets diagnostics
  for every file of the project.
- Paths are case-sensitive on every platform; a wrong-case import fails on Windows too.
