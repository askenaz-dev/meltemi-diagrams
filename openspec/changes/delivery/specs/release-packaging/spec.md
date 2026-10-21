## MODIFIED Requirements

### Requirement: Publishable manifests
Every public package SHALL have `publishConfig` with `access: "public"` and an `exports` map equal
to its `exports` without the `@meltemi/diagrams-source` condition, `repository` with
`url: "git+https://github.com/askenaz-dev/meltemi-diagrams.git"` and its `directory`,
`homepage` under `https://github.com/askenaz-dev/meltemi-diagrams/tree/main/packages/<folder>#readme`,
`bugs` at `https://github.com/askenaz-dev/meltemi-diagrams/issues`, `engines.node` and a
`README.md` that names the package, how to install it, a minimal use and the documentation, with
no link to any other repository address. `packages/vscode/package.json` SHALL name the same
repository. Packed tarballs SHALL contain the licence and no `workspace:` range.

#### Scenario: Packed exports
- **WHEN** `@meltemi/diagrams-model` is packed
- **THEN** its packed `package.json` exports name only files under `dist/` that the tarball contains

#### Scenario: The real address everywhere
- **WHEN** the release test reads the nineteen public manifests, the extension's manifest and the package READMEs
- **THEN** every `repository`, `homepage` and `bugs` names `askenaz-dev/meltemi-diagrams`, and no file names `github.com/meltemi/meltemi-diagrams`

#### Scenario: A manifest left behind
- **WHEN** one manifest's `homepage` names another address
- **THEN** the release test fails naming the package and the field

### Requirement: Release check
`pnpm release:check` SHALL build every package from clean, pack every public package into
`release/`, check every tarball (version, ranges, README, licence, every exported, `bin` and
`types` path present, no sources or tests), install the CLI from the tarballs into an empty folder
(internal packages mapped to their tarballs, never the registry's; third-party packages from the
local store when it has them, else from the registry, so that a fresh machine, a CI runner
included, can run it), run the installed command through `--version`, `init --template purchase`, `validate`,
`export` to SVG, PNG, PDF and (with FFmpeg) MP4, `build catalog` and `import` of a Mermaid file,
package the VS Code extension, and write `release/manifest.json` with each file's name, version,
size and SHA-256. It SHALL exit 1 naming each failed step. It SHALL run on the reference machine
and on `ubuntu-latest` in the release workflow, where Chrome and FFmpeg are installed.

#### Scenario: Installed from tarballs
- **WHEN** `pnpm release:check` runs on the reference machine or in the release workflow
- **THEN** the CLI installed from the tarballs validates and exports the purchase project, and the
  manifest lists 19 npm tarballs and the `.vsix`

#### Scenario: A step that fails
- **WHEN** the installed CLI cannot export MP4 because FFmpeg is missing
- **THEN** the check exits 1 naming the export step and the manifest is not written

### Requirement: Release process
`RELEASING.md` SHALL describe the release as the owner runs it: the changelog entry,
`pnpm release:version`, the verification on the reference machine (`pnpm acceptance`,
`pnpm conformance`, `pnpm release:check`, the browser and editor suites), the tag `v<x.y.z>`
pushed to `main`'s repository, and the release workflow that publishes to npm with provenance, to
the Visual Studio Marketplace and to Open VSX and creates the GitHub release; the one-time setup
of `NPM_TOKEN`, `VSCE_PAT` and `OVSX_PAT`; trusted publishing on npm as the follow-up once every
package exists; and what to do when a run fails after publishing (deprecate the version, fix,
release the next patch). `CHANGELOG.md` SHALL have an entry per released version with its date,
1.8.0 included.

#### Scenario: Owner releases
- **WHEN** the owner follows `RELEASING.md` after a passing verification
- **THEN** the only publishing command they run is the push of the tag, and the document names the workflow to watch and the artefacts it produces

#### Scenario: A failed run after publishing
- **WHEN** the release workflow fails after the npm job
- **THEN** `RELEASING.md` says to re-run the workflow, which skips what is published, and how to deprecate a broken version
