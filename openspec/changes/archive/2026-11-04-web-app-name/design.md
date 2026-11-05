# Design

## Context

The page's words live in catalogues read at draw time: `packages/playground/src/messages/en.ts`
and `es.ts` (`catalog(en, es)` of `@meltemi/diagrams-i18n`, `messages/index.ts`), with the
explorer's, the share dialog's and the account panel's words in files beside them. The static
shell `packages/playground/index.html` carries the title and the meta description the browser
shows before the script runs, and `build.mjs` writes the first line of `NOTICES.md`. The Worker's
own pages (the approval page, the error pages) take their words from
`packages/cloud/src/messages/common.ts` and `cli-auth.ts`. The same word is also an identifier:
the private package, `pnpm playground:*`, `playground.js`, `playground.css`,
`PLAYGROUND_IDENTITY`, `__PLAYGROUND_VERSION__`, CSS classes, the capability ids and test names,
and `.claude/worktrees` holds open branches over the same files (`gantt-diagrams`, 0 of 52
tasks). The docs link checker, `packages/acceptance/test/docs.test.ts`, reads every Markdown file
outside the archive and fails on a relative link that does not resolve, and
`localized-documentation` requires the Spanish guides to keep in step. See proposal.md for the
motivation.

## Goals / Non-Goals

**Goals:**

- Every word a person reads, on the page, on the Worker's pages, in the docs and on the family
  site, calls the page Meltemi Diagrams, the app or the browser.
- A test keeps it so, in both languages.
- One decision note records the name and why identifiers keep the old word.

**Non-Goals:**

- Identifiers, bundles, scripts, environment variables, capability ids and the history.
- The documentation portal and any new page.
- Rewriting About beyond the sentence about the account.

## Decisions

1. **Words, not identifiers.** Only what a person reads changes. The alternative, renaming the
   package to `@meltemi/diagrams-web`, the scripts to `web:*` and the bundle to `app.js`, would
   touch the CI workflows, the release artefact names, the cloud Worker's assets binding and 644
   occurrences in open worktrees, for nothing anyone sees; the project's own rule that renames
   leave no traces outside decision records is met by the decision note, which says the word is
   now a private name.

2. **The noun.** The name is **Meltemi Diagrams**; a sentence that needs a short noun says "the
   app" ("la app"), the family site's own word; a sentence that must tell the host from VS Code
   and the command line says "Meltemi Diagrams in the browser" ("Meltemi Diagrams en el
   navegador") or "the web app" ("la app web"), which is also the guide's title. Alternatives:
   "Studio" (the working name decision 0009 retired; beside "IDE" it reads as another product),
   "Live editor" (Mermaid's word for a try-out page, and "live" names the live sessions),
   "Meltemi Diagrams Web" as a name (a qualifier the product does not have: the extension is not
   "Meltemi Diagrams VS Code").

3. **The header.** The tag beside the lockup reads **Web** in both languages, telling the host as
   the VS Code extension's own chrome tells its, and the actions landmark is named "Meltemi
   Diagrams" ("Meltemi Diagrams"). The alternative, no tag, changes the header's row that
   `web-playground` specifies on a narrow screen for a question that is not this change's.

4. **About tells the truth.** The dialog's title is "About Meltemi Diagrams" ("Acerca de Meltemi
   Diagrams") and its first paragraph says: Meltemi Diagrams runs in your browser; without an
   account nothing you write is sent anywhere and your work stays in this browser until you
   download it; with one, your projects can be kept in the cloud and shared. The current text
   ("There is no account") has been untrue since decision 0041.

5. **The guide's file name.** `docs/playground.md` becomes `docs/web-app.md` and
   `docs/es/playground.md` becomes `docs/es/web-app.md`, with `git mv` so history follows, and
   every link follows (`grep -rn "playground\.md"` outside `docs/decisions` and the archive
   finds them; the docs test proves none is broken). Keeping the file name was considered, for
   links from outside the repository; rejected because the documentation portal will show file
   names as addresses, and the family site links the folder, not the file.

6. **The specs.** `web-playground` gains "The page's name" as an ADDED requirement with the
   guard test as its failure scenario. The two requirements that say "the Studio" are renamed
   and given their full new text, so that the archive leaves no trace of the working name; the
   capability ids stay, since OpenSpec deltas cannot move a capability and the open branches
   write deltas against them.

7. **The guard test.** `packages/playground/test/messages-name.test.ts` walks every catalogue of
   the page (`en`, `es`, the explorer's, the share dialog's and the account panel's), says each
   entry as `account-messages.test.ts` does (strings as they are, functions filled with markers)
   and asserts that none contains "playground" in any case, naming the path and the language
   when one does. `packages/cloud/test` gets the same assertion over the Worker's catalogues. An
   ESLint rule was considered and rejected: tests, comments and identifiers keep the word on
   purpose.

8. **The family site.** The two cards' sentence becomes "The same canvas runs in the VS Code
   extension and in the app, Meltemi Diagrams in the browser." ("El mismo lienzo funciona en la
   extensión de VS Code y en la app, Meltemi Diagrams en el navegador."), edited in
   `meltemi-web` in its own pull request; Web's own tests and deploy carry it.

9. **The decision note.** `docs/decisions/0069-the-app-is-meltemi-diagrams.md` records the
   name, the noun, the header, the guide's file and the identifiers that keep the word, and
   0031's status line gains "Amended by 0069".

## Risks / Trade-offs

- [An open branch links `docs/playground.md`] → the docs test fails on that branch's merge and
  names the link; the fix is the link. The decision note says so.
- [Links to `docs/playground.md` from outside the repository] → GitHub answers 404 for the old
  path; the family site links the docs folder, and the portal is coming. Accepted.
- [The word comes back in a new message] → the catalogue tests.
- [Thirty guides edited in two languages drift] → the docs test checks the language links; the
  task counts the remaining occurrences per language with one `grep` and they must match in kind.
- [`docs/media/editing-demo.gif` shows the old header] → the demo is recorded by `pnpm demo`
  (`packages/acceptance/src/demo.ts`); if its frames show the tag "Playground", the task records
  it again, with the browser and FFmpeg the machine already has.
