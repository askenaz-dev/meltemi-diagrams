# 0033. Release and versioning

Status: accepted (release-1-0 change, 11 October 2026)

## Context

Meltemi Diagrams is eighteen npm packages, a VS Code extension and a static playground, built from
one workspace and always tested together. Three other contracts carry versions of their own: the
language (`language "0.2"`, the version the proposal defines), the model JSON
(`MODEL_API_VERSION`) and the renderer API that plugins declare (`RENDERER_API_VERSION`, decision
0030). Until now nothing had been packed, installed from its tarball or published, and the
packages' `exports` named a development condition pointing at sources the tarballs do not contain.

## Decision

- **One product version.** Every package, the CLI and the extension share one semantic version,
  1.0.0 for the first release, set by `pnpm release:version`; a test fails when any differs.
  Internal dependencies are exact versions in the published manifests (pnpm replaces
  `workspace:*`).
- **Separate contracts.** The language version changes only through the language policy; the model
  JSON and renderer API follow semantic versioning on their own. A product release can leave them
  unchanged, as 1.0.0 does.
- **Publish what was checked.** `pnpm release:check` builds from clean, packs, checks every tarball
  (version, ranges, README, licence, every exported file, no sources), installs the CLI from the
  tarballs without network and runs it, packages the extension and writes a manifest with
  SHA-256 digests. The owner publishes those files: `npm publish <tarball>` for each package,
  `vsce` and `ovsx` with the `.vsix`.
- **Published manifests carry no development condition.** `publishConfig.exports` repeats
  `exports` without `@meltemi/diagrams-source`; a test keeps them equal.
- **The repository address** used by the extension since its first version is used by every
  manifest; the launch checklist asks the owner to confirm it before publishing.

## Alternatives considered

- **Independent package versions (changesets).** Finer, but the packages are only ever tested
  together, and a user mixing versions would hit combinations nobody ran.
- **Publishing from the workspace with `pnpm publish -r`.** It repacks at publish time, so what
  reaches the registry is not the file that was installed and run by the check.
- **Bundling the CLI into one file.** One download, but it would hide the libraries other tools
  build on and duplicate the fonts and icon data.
- **A language version 1.0 for the product's 1.0.** The proposal defines the language as 0.2, and
  renaming a version promises nothing new; the policy says what 0.2 guarantees.

## Consequences

- A release is reproducible from the repository and the manifest of its files.
- Any package's patch release bumps them all; unchanged packages are republished with the same
  contents and a new version.
- Third-party packages come from the registry at install time; the check proves the install works
  from the local store, not that the registry has them, which it does for every dependency in the
  lockfile.
