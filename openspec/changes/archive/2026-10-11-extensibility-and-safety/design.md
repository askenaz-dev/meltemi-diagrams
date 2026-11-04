## Context

- Four profiles are compiled by analysers in code; the free profile already draws boxes in six
  shapes, with groups, icons, images, layers, rules by kind and automatic layout.
- Assets are sanitised and bounded (decision 0014); imports and images are confined to the
  project; exported catalogs carry a content security policy (decision 0027).

## Goals / Non-Goals

**Goals:** new diagram types without a release, as data; explicit, versioned, permissioned,
compatibility-checked installation with provenance in the lock; bounds on everything a repository
can make the tool read or draw; no code, no network, no secrets in errors.

**Non-Goals:** executable plugins in projects (see D1); new layout algorithms or primitives beyond
the renderer's.

## Decisions

### D1. A plugin is data

Executing project-provided code would break "diagrams never run code by being opened", and the
supported Node versions cannot sandbox the network. Plugins therefore declare: diagram types and an
icon pack. Applications that embed the libraries register types with the same format
(`readDiagramType`, `compile(text, { types })`); what code they import is theirs to decide.

### D2. Declared types on the free profile

`declaredProfile(definition)` extends the free profile with the type's kinds (as element and rule
kinds), its relation properties and its layout defaults. A kind's statement compiles to a `box`
element with `typeKind` and `data` (its declared properties, booleans as booleans). After analysis,
required properties and allowed relations are checked. Layout applies the kind's style before
rules, classes and styles; rules match the kind; the arrange request carries `algorithm: "tree"`,
which ELK's layered algorithm realises with balanced node placement (parents centred over their
children). Everything else of the free profile keeps working.

### D3. Installation and checks

project.json `plugins.<name>`: `path` (inside the project), `version` (exact), `permissions`
(`diagram-types`, `icons`). The plugin's manifest must have the same name and version, declare
`compatibility` with the model API 1.0.0 and the renderer API 1.0.0, and may ask for permissions;
contributions need both the request and the grant. Problems are `plugin.*` diagnostics on
project.json or the manifest. Plugins reload when project.json or a plugin's files change.

### D4. Provenance

`assets.lock.json` gains `plugins` (version, folder, `sha256-` of the manifest); `assets lock`
writes it and validation reports differences as `asset.lock-mismatch`, like packs and fonts.

### D5. Limits

`compile` refuses sources over 2 Mi characters and marks diagrams with more than 5,000 elements or
10,000 relations or events as not drawable; `Workspace.sources()` compiles at most 2,000 files and
`limits()` reports the rest; manifests over 1 Mi characters are refused. Every limit is a
diagnostic, never a silent cut.

### D6. Errors

The command line catches unexpected errors at the top, removes the values of environment
variables whose names look secret, prints no stack unless `MELTEMI_DEBUG`, and exits 70.

## Risks / Trade-offs

- [Data-only plugins] → types needing new primitives or layouts need a product change; the common
  cases (kinds, shapes, properties, relations, trees) are covered.
- [Kinds as boxes] → tools that switch on `kind` see `box`; `typeKind` tells the declared kind.
