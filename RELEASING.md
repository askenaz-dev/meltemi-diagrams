# Releasing

Meltemi Diagrams is released as one version: nineteen npm packages under `@meltemi/`, the VS Code
extension (`meltemi.meltemi-diagrams`) for the Visual Studio Marketplace and Open VSX, and the
hosted service at `https://diagrams.meltemi.dev`. Every package carries the same version
([decision 0033](docs/decisions/0033-release-and-versioning.md)).

Nothing is published from a machine ([decision 0046](docs/decisions/0046-delivery.md)). Pushing a
tag `v<x.y.z>` starts `.github/workflows/release.yml`, which publishes the packages and the
extension and creates the GitHub release. The hosted service is not released by a tag: every push
to `main` deploys it (`.github/workflows/deploy.yml`).

## 1. Prepare

1. Make sure every change of the release is archived (`openspec list` shows none in progress).
2. Add the release to [CHANGELOG.md](CHANGELOG.md) under `## <version> (<date>)`: what was added,
   changed, fixed and removed, and anything a user must do. The release's notes on GitHub are that
   section.
3. Set the version everywhere it is written:

   ```bash
   pnpm release:version 1.9.0
   ```

   It rewrites every `package.json` (the extension included) and the CLI's version constant. The
   language version (`language "0.2"`), the model JSON and the renderer API have their own versions
   and rules ([language policy](docs/language/policy.md)); change them only through a language
   change.

## 2. Verify

On the reference machine ([decision 0032](docs/decisions/0032-reference-machine-and-quality-gates.md)),
with Edge, Chrome, Firefox and FFmpeg installed:

```bash
pnpm install --frozen-lockfile
```

```bash
pnpm typecheck && pnpm lint && pnpm test
```

```bash
pnpm acceptance
```

```bash
pnpm conformance
```

```bash
pnpm release:check
```

- `pnpm acceptance` runs every acceptance criterion and rewrites `docs/quality/results.md`,
  `docs/performance.md` and `docs/verification/browsers.md`; all must pass.
- `pnpm release:check` builds every package from clean, packs the npm packages into `release/`,
  checks each tarball, installs the CLI from the tarballs into an empty folder without network,
  runs it through `init`, `validate`, the exports, `build catalog` and `import`, packages the
  extension as `release/meltemi-diagrams-<version>.vsix`, and writes `release/manifest.json` with
  every file's size and SHA-256. The release workflow runs it again on Linux before publishing.
- The editor suite `pnpm vscode:test`, which runs the extension inside VS Code, passes; CI runs the
  browser suites (`pnpm vscode:test-webview`, `pnpm player:test-browser`,
  `pnpm catalog:test-browser`, `pnpm playground:test-browser`, `pnpm cloud:test-browser`) on every
  push.
- When the release changes exports, the slide applications are checked with
  `pnpm verification:kit kit` and [the office applications' table](docs/verification/office-apps.md)
  is updated.
- Commit the version, the changelog and the documents the runs rewrote, and the gallery and demo if
  they changed (`pnpm gallery`, `pnpm demo`), and push them to `main`.

## 3. Tag and watch

```bash
git tag -a v1.9.0 -m "Meltemi Diagrams 1.9.0"
```

```bash
git push origin v1.9.0
```

The tag starts the release workflow. Its jobs run one after the other, each only if the one before
passed:

| Job         | What it does                                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check`     | Refuses a tag that is not `v` and the manifests' version, before anything else; runs `pnpm release:check` on Linux (Chrome, FFmpeg) and keeps `release/` as the run's artifact |
| `npm`       | Publishes every tarball of `release/` with `--access public --provenance`, skipping a name and version npm already has                                                         |
| `extension` | Publishes the checked `.vsix` to the Visual Studio Marketplace and to Open VSX, accepting a version either already has                                                         |
| `github`    | Creates the release `v<x.y.z>` with `release/manifest.json`, the `.vsix` and the changelog's section as its notes                                                              |

When it is green, check the result: `npm view @meltemi/diagrams-cli version` prints the version,
`npx @meltemi/diagrams-cli --version` in an empty folder prints it too, and the extension's pages
on both marketplaces show it.

## The tokens

The workflow reads three repository secrets, `NPM_TOKEN`, `VSCE_PAT` and `OVSX_PAT`. Nobody sets
them here: the family's Terraform (`packages/infra` in the Meltemi Web repository) places them from
the values of its `infrastructure` environment, and replaces them when those change.

- `NPM_TOKEN`: a granular token of the npm organisation `meltemi` that publishes its packages, with
  the bypass of two-factor authentication for automation and an expiry.
- `VSCE_PAT`: an Azure DevOps token with the Marketplace (manage) scope of the `meltemi` publisher,
  for "All accessible organizations". Azure DevOps retires global tokens on 2026-12-01; publishing
  then moves to Microsoft Entra ID (`vsce publish --azure-credential` with a workload identity).
- `OVSX_PAT`: the Open VSX token of the `meltemi` namespace.

Once every package exists on npm, trusted publishing replaces the npm token: on each package's
settings page, add the trusted publisher `askenaz-dev/meltemi-diagrams` with the workflow
`release.yml`; then remove the `NODE_AUTH_TOKEN` line of the `npm` job and the token from the
family's infrastructure. Provenance keeps working: it comes from the workflow, not from the token.

## Patch releases

A fix release follows the same steps with the next patch version (`pnpm release:version 1.9.1`).
A fix that changes what a valid file means is not a patch: it follows the
[language policy](docs/language/policy.md).

## If something fails

- **Before `npm`**: nothing was published. Fix, move the tag (`git tag -d`, `git push --delete
origin`, tag again) and push it.
- **During `npm` or later**: re-run the failed jobs. Every job skips what is already published, so
  the run finishes what is missing.
- **A published version is broken**: npm versions cannot be replaced. Deprecate it with
  `npm deprecate @meltemi/diagrams-<name>@<version> "<reason>"` for each package, fix, and release
  the next patch version. A Marketplace or Open VSX release is replaced by the next version.
