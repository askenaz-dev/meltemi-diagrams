## 1. Model and editor

- [x] 1.1 `diffDocuments` and `describeChange` with rename detection; tests.
- [x] 1.2 `reviewProjects` in `@meltemi/diagrams-editor/node`: file pairing, renamed files, marked pictures.
- [x] 1.3 Catalog page live-reload option; `buildCatalog` passes it.

## 2. Command line

- [x] 2.1 `init` with templates (`flow`, `c4`, `sequence`, `free`, `purchase`), `--list`, `--name`; tests that every template validates and builds its catalog.
- [x] 2.2 CI templates (`--ci github|gitlab`); tests.
- [x] 2.3 `preview` server with live reload, loopback only; tests.
- [x] 2.4 `review` with Git revisions and paths, `--json`, `--exit-code`, `--out`; tests.
- [x] 2.5 `export` and `import` of folders; tests.
- [x] 2.6 Sequence queue heads widened by their cap (found by the reference example).

## 3. Docs

- [x] 3.1 `docs/cli.md`, decision 0028, README, skill reference; `pnpm skills:sync`.

## 4. Verification

- [x] 4.1 typecheck, lint, test, browser suites, VS Code, package, licences; review the templates and the review page.
