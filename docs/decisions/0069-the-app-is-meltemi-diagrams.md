# 0069. The app is Meltemi Diagrams

Status: accepted (web-app-name change, 4 November 2026). Amends
[0031](0031-web-playground.md).

## Context

Decision 0031 named the web page "the playground" on 11 October 2026, when the page was the entry
to the product: templates, visible code and a result before learning more, with no account. Since
then the page has become where people work: an optional account, projects kept in the cloud,
sharing, live sessions, publishing and administration (decisions 0041, 0042, 0048, 0050 and 0068).
On 4 November 2026 the owner asked that the page stop calling itself a playground, a word that says
a place to try things, and chose its name the same day: Meltemi Diagrams, the product itself, with
VS Code and the command line as its other hosts. The family site already said "the app, which the
documentation calls the playground". The word was also an identifier: the private package, the
`pnpm playground:*` scripts, the bundle, environment variables, CSS classes, test names, the
capability ids and the open branches over the same files.

## Decision

- **Words, not identifiers.** Everything a person reads calls the page Meltemi Diagrams: the tab's
  title, the description, the loading and failure lines, the header, About, the hints, the Worker's
  own pages, the guides in both languages, the READMEs and the family site. The word "playground"
  stays the private name of the code: `@meltemi/diagrams-playground`, `pnpm playground:*`,
  `playground.js`, `playground.css`, `PLAYGROUND_IDENTITY`, `__PLAYGROUND_VERSION__`, the storage
  keys, the CSS classes, the test names, the capability ids `web-playground`, `playground-cloud`
  and `playground-exports`, the decisions, the archive and the changelog's published entries.
- **The noun.** The name is Meltemi Diagrams. A sentence that needs a short noun says "the app"
  ("la app"); a sentence that must tell the browser from VS Code and the command line says
  "Meltemi Diagrams in the browser" ("Meltemi Diagrams en el navegador") or "the web app" ("la app
  web").
- **The header.** The tag beside the lockup reads **Web** in both languages, telling the host as
  the extension's chrome tells its; the actions landmark is named Meltemi Diagrams.
- **About tells the truth.** Its title is "About Meltemi Diagrams" ("Acerca de Meltemi Diagrams")
  and its first paragraph says that without an account nothing written is sent anywhere, and that
  with one, projects can be kept in the cloud and shared. "There is no account" had been untrue
  since decision 0041.
- **The guide's file.** `docs/playground.md` became `docs/web-app.md`, "The web app", and
  `docs/es/playground.md` became `docs/es/web-app.md`, "La app web", moved with Git so their history
  follows; every link in the repository follows.
- **A guard.** A test over every message catalogue of the page, and one over the Worker's, fail when
  an entry says "playground" in any case, naming the entry and its language.

## Alternatives

- Renaming the package, the scripts and the bundle too (`@meltemi/diagrams-web`, `web:*`,
  `app.js`): it touches the workflows, the release artefacts, the Worker's assets and the open
  branches for nothing anyone sees.
- "Studio": the working name decision 0009 retired; beside the IDE it reads as another product.
- "Live editor": a try-out page's word elsewhere, and "live" already names the live sessions.
- "Meltemi Diagrams Web" as the name: a qualifier the product does not have; the tag says the host.
- Keeping `docs/playground.md` as the file name for links from outside: the documentation portal
  shows file names as addresses, and the family site links the folder, not the file.

## Consequences

- An open branch that links `docs/playground.md` fails the documentation test when it merges, and
  the test names the link to change.
- Links to `docs/playground.md` from outside the repository answer 404 on GitHub.
- The capability ids keep the old word, since a spec delta cannot move a capability; their
  requirements no longer say "the Studio".
- `docs/media/editing-demo.gif` and `editing-demo.mp4` were recorded again, since they showed the
  old tag.
