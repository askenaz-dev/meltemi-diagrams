# The app is Meltemi Diagrams

## Why

On 2026-11-04 the owner asked that the page at diagrams.meltemi.dev stop calling itself "the
playground": the word says a place to try things, and the page is where people work, with an
account, projects kept in the cloud, sharing, live sessions, publishing and administration
(decisions 0041, 0042, 0048, 0050, 0068). The name dates from decision 0031 (11 October), when the
page was the entry to the product, and the family site already says "the app, which the
documentation calls the playground" (`web/packages/site/public/diagrams/index.html:105-106`,
`es/diagrams/index.html:108-109`). Two specs call it "the Studio", the working name decision 0009
retired. The owner chose the name on 2026-11-04: the page is **Meltemi Diagrams**, the product
itself; VS Code and the command line are its other hosts.

This is a post-1.0 change outside `docs/roadmap-1.0.md`.

## What changes

- **The page is Meltemi Diagrams.** The tab's title, the description, the loading and failure
  lines, the header's tag and the name of its actions, About, and the hints of the explorer, the
  export dialog and the share dialog, in English and Spanish
  (`packages/playground/src/messages/{en,es}.ts`, `explorer-{en,es}.ts`,
  `cloud-share-{en,es}.ts`, `packages/playground/index.html`), and the first line of
  `NOTICES.md` (`packages/playground/build.mjs:291`). About tells the truth about the account:
  the page runs in the browser; without an account nothing written is sent anywhere; with one,
  projects can be kept in the cloud and shared. Where a sentence needs a short noun the words say
  "the app" ("la app"); where the host must be told from VS Code and the command line, "Meltemi
  Diagrams in the browser" ("en el navegador").
- **The Worker's pages say the same.** "Back to the playground" and the approval page's sentence
  about revoking API tokens (`packages/cloud/src/messages/common.ts`, `cli-auth.ts`).
- **The documentation.** `docs/playground.md` becomes `docs/web-app.md`, "The web app", and
  `docs/es/playground.md` becomes `docs/es/web-app.md`, "La app web"; the fifty links across the
  docs and the READMEs follow. README EN/ES, CONTRIBUTING, `docs/cloud.md`, `docs/editor.md`,
  `docs/compatibility.md`, `docs/verification/browsers.md` and the other guides, in both
  languages, stop calling the page "the playground". Commands and package names are quoted as
  they are. The changelog's open section records the name.
- **The family site.** The two cards of `meltemi-web` lose "which the documentation calls the
  playground", in a pull request of that repository.
- **The specs.** `web-playground` gains the requirement that the page names itself Meltemi
  Diagrams and that no visible word, of the page or of the Worker's pages, calls it a playground,
  guarded by a test over every message catalogue; `playground-cloud` and `live-sessions` stop
  saying "the Studio".
- **A decision note**, 0069, amending 0031.

Unchanged, on purpose: `@meltemi/diagrams-playground`, `pnpm playground:*`, `playground.js`,
`playground.css`, `PLAYGROUND_IDENTITY`, `__PLAYGROUND_VERSION__`, CSS classes, test names, the
capability ids `web-playground`, `playground-cloud` and `playground-exports`, the decisions, the
archive and the changelog's published entries. The word stays the internal name, as `mdg` and
`ROOMS` are names nobody reads on the page.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-playground`: added, the page's name and the guard on its visible words.
- `playground-cloud`: "A cloud project bound to the Studio" names the page, not the Studio.
- `live-sessions`: "The page as a guest" names the page, not the Studio.
- `localized-documentation`: "Spanish documentation" lists the guide as `web-app.md`.
- `agent-skill`: "Documentation for agents" names the guide `docs/web-app.md`.

## Impact

`packages/playground` (the catalogues in both languages, `index.html`, `build.mjs`, the
description in `package.json`, a new test over the catalogues), `packages/cloud` (two messages
and a test), the docs in both languages with the renamed guide, README EN/ES, CONTRIBUTING,
CHANGELOG, three spec deltas, one decision note; `meltemi-web`'s two Diagrams pages. No route,
storage, identifier, export or file format changes. The agent skill and the hosted prompt do not
name the playground and need nothing.

## Non-goals

Renaming packages, scripts, bundles, environment variables, capability ids or test names. The
documentation portal is a change of its own (`docs-portal`). The history (decisions, archived
changes, published changelog entries) keeps its words.
