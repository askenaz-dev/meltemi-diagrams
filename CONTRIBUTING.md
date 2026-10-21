# Contributing

## Ground rules

- The text document is the source of truth. Compiling never modifies a file, and visual edits
  become minimal text changes.
- No data loss. A defect that loses positions, references or comments is a release blocker and
  needs a regression test in `corpus/edits/` or in the package tests.
- Every user-facing problem is a diagnostic with a stable code. Parsing and compiling never throw
  on user input. New codes are documented in `docs/language/diagnostics.md`.

## Workflow

1. Changes are planned with OpenSpec: proposal, design, specs and tasks under
   `openspec/changes/<name>/`.
2. Implement the tasks in order and tick each checkbox when its test passes.
3. Run `pnpm typecheck`, `pnpm lint` and `pnpm test` before asking for review.
4. After editing `skills/`, run `pnpm skills:sync`; a test fails when the agent copies drift.
5. Changes to the editor or the canvas (`packages/editor`, `packages/canvas`) also run
   `pnpm vscode:test-webview` (the canvas in a headless Edge or Chrome), `pnpm vscode:test` (the
   extension inside VS Code, downloaded into `packages/vscode/.vscode-test`),
   `pnpm vscode:package` (the `.vsix` and its contents check) and `pnpm playground:test-browser`.
6. Changes to the player (`packages/player`, or motion and the renderer it bundles) also run
   `pnpm player:test-browser`, the player's pages in a headless Edge or Chrome; changes to the
   catalog run `pnpm catalog:test-browser`.
7. Changes to the playground (`packages/playground`) run `pnpm playground:test-browser`: it builds
   the site, serves it on `127.0.0.1` and checks every feature in a headless Edge or Chrome, with
   FFmpeg's `ffprobe` reading the videos when it is installed.
8. Changes to the layout, the renderer, motion or the exports run `pnpm acceptance:visual` and look
   at every diff image before recording new references with `--update`; changes to exports also
   run `pnpm verification:browsers --only <browser>` for the browsers they could affect.
9. Before a release, `pnpm acceptance` runs every acceptance criterion on the reference machine
   and rewrites `docs/quality/results.md`, `docs/performance.md` and
   `docs/verification/browsers.md` ([quality](docs/quality.md)).

## What CI runs

The repository is [askenaz-dev/meltemi-diagrams](https://github.com/askenaz-dev/meltemi-diagrams).
`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

- `check`, on Node 22 and 24, on Linux and Windows: install with the lockfile, `pnpm typecheck`,
  `pnpm lint`, `pnpm licenses:inventory --check`, `pnpm test`, `pnpm build`, the corpus's
  validations and an export;
- `browser`, on Linux with Chrome and FFmpeg: `pnpm playground:test-browser`,
  `pnpm player:test-browser`, `pnpm catalog:test-browser` and `pnpm vscode:test-webview`;
- `cloud`, on Linux: `pnpm cloud:test-browser`, the Worker under `wrangler dev`.

`pnpm vscode:test`, which downloads VS Code, stays a local step of [releasing](RELEASING.md). A
push to `main` deploys the hosted service (`deploy.yml`) and a tag `v<x.y.z>` releases the packages
and the extension (`release.yml`); the infrastructure they run on is the family's Terraform, in the
Meltemi Web repository ([decision 0046](docs/decisions/0046-delivery.md)).

## Changing the language

Language changes follow the [language change policy](docs/language/policy.md): what a version
promises, what needs a new version, deprecations and explicit migrations. Each adds conformance
cases to the corpus; `pnpm conformance` runs the suite ([conformance](docs/language/conformance.md)).

## English and Spanish

The product speaks English and Spanish ([decision 0037](docs/decisions/0037-languages.md)):

- Words for people live in each package's `src/messages/en.ts` and `es.ts`; the Spanish object has
  the English one's type, so a missing word does not compile. Look words up when text is made,
  never at module load, and give both languages in the same change. Follow the style and glossary
  of [`@meltemi/diagrams-i18n`](packages/i18n/README.md); each catalog's test runs `untranslated`.
- Never compare words: tools read flags, codes and a diagnostic's `data`.
- The documentation a person reads to use the product has a Spanish version under `docs/es/` (and
  `README.es.md`). Change both in the same change: the docs test checks that each page has its
  Spanish version, a language line under the title, the same headings and the same code (comments
  aside). Decision notes, the roadmap, quality results, launch and pilot material, `RELEASING.md`
  and this file stay in English. `pnpm import:docs` and `pnpm bench --write` write both languages.

## Releasing

Releases follow [RELEASING.md](RELEASING.md): `pnpm release:version`, `pnpm acceptance`,
`pnpm conformance` and `pnpm release:check`, then the owner publishes the checked files.

## The VS Code extension

`packages/vscode` holds the extension; everything that can be tested without VS Code lives in
`@meltemi/diagrams-editor`. Press F5 with **Run Meltemi Diagrams** (`.vscode/launch.json`) to start
an Extension Development Host on `examples/`. `node packages/vscode/scripts/render-icon.mjs`
renders the extension icon from `brand/`.

## Decision notes

Choices with alternatives get a short note in `docs/decisions/NNNN-title.md` with four sections:
context, decision, alternatives considered, and consequences. Keep notes short and link them from
the design document that motivated them.

## Corpus rules

- `corpus/valid/` files compile without errors. Each has a model snapshot.
- `corpus/invalid/` holds one file per diagnostic code, named after the code.
- `corpus/edits/` holds edit fixtures: `before.meltemi`, `operation.json`, and either `after.meltemi`
  or `rejection.json`.
- Corpus files are byte-exact inputs. `.gitattributes` disables line-ending conversion for them;
  do not reformat them.
- `corpus/acceptance/` holds the acceptance corpus: five sheets per profile with their SVG
  snapshots, `errors/`, `edits/` scenarios and the pixel references in `visual/`
  ([quality](docs/quality.md#the-acceptance-corpus)).
- Regenerate snapshots with `pnpm test -u` and review every changed snapshot.

## Code style

TypeScript strict mode, ES modules, prettier formatting. Identifiers, code comments and commit
messages are in English.
