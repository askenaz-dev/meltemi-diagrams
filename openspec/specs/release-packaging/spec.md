# release-packaging Specification

## Purpose
One product version, publishable packages, and the release check that builds, packs, installs and runs the release before the owner publishes it.

## Requirements

### Requirement: One product version
Every package of the workspace, the VS Code extension and `CLI_VERSION` SHALL carry the same
version, 1.0.0 for this release. `pnpm release:version <version>` SHALL rewrite all of them and
refuse a version that is not `x.y.z`. The language version, `MODEL_API_VERSION` and
`RENDERER_API_VERSION` SHALL NOT change with it. A test SHALL fail when any version differs.

#### Scenario: Versions agree
- **WHEN** the tests run
- **THEN** every `package.json` version, the extension's version and `CLI_VERSION` are `1.0.0`

#### Scenario: New version
- **WHEN** `pnpm release:version 1.0.1` runs
- **THEN** every version above becomes `1.0.1` and `mdg --version` prints `1.0.1`

### Requirement: Publishable manifests
Every public package SHALL have `publishConfig` with `access: "public"` and an `exports` map equal
to its `exports` without the `@meltemi/diagrams-source` condition, `repository` with its
`directory`, `homepage`, `bugs`, `engines.node` and a `README.md` that names the package, how to
install it, a minimal use and the documentation. Packed tarballs SHALL contain the licence and no
`workspace:` range.

#### Scenario: Packed exports
- **WHEN** `@meltemi/diagrams-model` is packed
- **THEN** its packed `package.json` exports name only files under `dist/` that the tarball contains

### Requirement: Release check
`pnpm release:check` SHALL build every package from clean, pack every public package into
`release/`, check every tarball (version, ranges, README, licence, every exported, `bin` and
`types` path present, no sources or tests), install the CLI from the tarballs into an empty folder
(internal packages mapped to their tarballs, never the registry's; third-party packages from the
local store when it has them, else from the registry, so that a fresh machine, a CI runner
included, can run it), run the installed command through `--version`, `init --template purchase`, `validate`,
`export` to SVG, PNG, PDF and (with FFmpeg) MP4, `build catalog` and `import` of a Mermaid file,
package the VS Code extension, and write `release/manifest.json` with each file's name, version,
size and SHA-256. It SHALL exit 1 naming each failed step.

#### Scenario: Installed from tarballs
- **WHEN** `pnpm release:check` runs on the reference machine
- **THEN** the CLI installed from the tarballs validates and exports the purchase project, and the
  manifest lists 18 npm tarballs and the `.vsix`

### Requirement: Release process
`RELEASING.md` SHALL describe the release: the changelog entry, `pnpm release:version`, `pnpm
acceptance`, `pnpm release:check`, publishing to npm in dependency order, to the VS Code
Marketplace and to Open VSX with the checked `.vsix`, and the tag. `CHANGELOG.md` SHALL have the
1.0.0 entry.

#### Scenario: Owner publishes
- **WHEN** the owner follows `RELEASING.md` after a passing release check
- **THEN** every command they run is listed with the files it publishes

### Requirement: Packaged story inspection gate

The installed-CLI release check SHALL verify the complete canonical folder MCP tool catalogue
and call `inspect_story` on the generated purchase project before preview. It SHALL reject an
absent inspection tool, an invalid compiled timeline or a missing source revision.

#### Scenario: Installed story inspection succeeds

- **WHEN** the release check installs the CLI from the checked tarballs
- **THEN** its MCP server exposes the canonical folder tools and returns a compiled purchase
  story timeline with a source revision before the preview check runs

#### Scenario: Incomplete installed server fails the gate

- **WHEN** the installed server omits story inspection or returns an invalid timeline report
- **THEN** the release check fails before uploading a checked release artifact

### Requirement: Bounded release media setup

Release FFmpeg setup SHALL preserve the checked-artifact recovery condition, use the CI mirror
fallback, limit acquisition to two retries with thirty-second HTTP and HTTPS timeouts, and have
a ten-minute step timeout.

#### Scenario: Slow runner package mirror

- **WHEN** a fresh release runner installs FFmpeg
- **THEN** it replaces the degraded Azure Ubuntu mirror, uses bounded acquisitions, and cannot
  leave the installation step running beyond ten minutes
