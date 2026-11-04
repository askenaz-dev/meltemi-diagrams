# 0030. Extensibility and safety: declared types, data plugins, limits

Status: accepted (extensibility-and-safety change, 11 October 2026)

## Context

The proposal asks new diagram types to register their schema, validation, layout, editing tools
and conversion to primitives; diagrams never run code by being opened; executable plugins are
explicitly installed extensions with permissions and identifiable versions; plugins and resource
packs keep provenance and version; extensions declare compatibility with the versions of the
intermediate model and the renderer. Imported SVG is sanitised, paths are confined to the project,
network references are off by default, there are size and complexity limits for images, fonts,
imports and renders, and errors never leak secrets — protecting both the local editor and
automated jobs that process external repositories.

## Decision

- **A plugin is data.** A folder with `meltemi-plugin.json` declares diagram types and an icon pack.
  Nothing a project installs is executed; fields that would name code are ignored with a warning.
  Executable extension is the business of applications that embed the libraries: they register
  types with the same format (`readDiagramType`, `compile(text, { types })`) and decide what code
  they import themselves.
- **Explicit installation.** `project.json` `plugins` names each plugin's folder (inside the
  project), exact version and the permissions granted (`diagram-types`, `icons`; `network` does
  not exist). A plugin contributes what it asks for and is granted, nothing else. The lock records
  version, folder and the manifest's SHA-256; changes are reported until the lock is written.
- **Declared compatibility.** Manifests declare semver ranges for the model API (1.0.0) and the
  renderer API (1.0.0); others are refused.
- **Declared types on the free profile.** A type's kinds compile as boxes carrying `typeKind` and
  `data`, with the kind's style applied first (before rules, classes and styles), rules by kind,
  required properties and allowed relations checked, its layout defaults (mode, `layered` or `tree`
  algorithm, direction), and its palette in the canvas. Every free feature keeps working, so stories,
  exports, catalogs, reviews and assistance need nothing new.
- **Limits.** Sources (2 Mi characters), diagrams (5,000 elements, 10,000 relations or events),
  projects (2,000 sources), manifests (1 Mi characters), on top of the asset limits of decision
  0014, as `limit.*` diagnostics.
- **Errors without secrets.** The command line redacts secret-looking environment values from
  unexpected errors and prints no stack unless asked; assistance redacts keys (decision 0029).
- **One page states it.** `docs/security.md` lists every guarantee and limit.

## Alternatives considered

- **Executable plugins in a sandbox.** Node's permission model limits files and processes but not
  the network in the supported versions, and in-process sandboxes are not security boundaries;
  executing project-provided code would break "diagrams never run code".
- **A type per profile in code.** Each new type would need a release; declared types cover the
  common cases (kinds, shapes, properties, rules, layouts) as data.
- **Silent caps.** Truncating without a diagnostic hides data; every limit is reported.

## Consequences

- Types beyond kinds-and-relations (new layouts, new primitives) need a change to the product.
- The model JSON gains `typeKind`, `data` and `declaredType`.
- Untrusted repositories can be validated and exported in CI without running anything from them.
