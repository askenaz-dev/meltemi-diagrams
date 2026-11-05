# Tasks

## 1. The page's words

- [x] 1.1 Write `packages/playground/test/messages-name.test.ts`: every entry of `en`, `es` and
      the explorer's, the share dialog's and the account panel's catalogues, said as
      `account-messages.test.ts` says them, contains no "playground" in any case, and a failure
      names the entry's path and language. Verify it fails on the current catalogues.
- [x] 1.2 Change the catalogues (`messages/en.ts`, `es.ts`, `explorer-{en,es}.ts`,
      `cloud-share-{en,es}.ts`): the title "Meltemi Diagrams", the description, the loading and
      failure lines, the header's tag "Web", the actions landmark "Meltemi Diagrams", "About
      Meltemi Diagrams" / "Acerca de Meltemi Diagrams", and the hints saying "the app" / "la
      app". Verify 1.1 passes and `pnpm --filter @meltemi/diagrams-playground typecheck` is green.
- [x] 1.3 Rewrite About's first paragraph in both languages as design decision 4 says (no
      account: nothing is sent; an account: projects kept in the cloud and shared). Verify the
      About scenarios of the browser suite pass with the new title, and add the assertion on the
      first paragraph.
- [x] 1.4 Change `packages/playground/index.html` (title and meta description), the first line of
      `NOTICES.md` in `build.mjs` and the description in `package.json`. Verify with
      `pnpm playground:build` that `dist/index.html`'s title and description and
      `dist/NOTICES.md`'s first line carry no "playground".
- [x] 1.5 Update the browser scenarios that assert the old title, tag or About names, and record
      the demo if `docs/media/editing-demo.gif` shows the tag "Playground" (`pnpm demo`). Verify
      `pnpm playground:test-browser` is green.

## 2. The Worker's pages

- [x] 2.1 Change `packages/cloud/src/messages/common.ts` ("Back to Meltemi Diagrams" / "Volver a
      Meltemi Diagrams") and `cli-auth.ts` (tokens are revoked from the account panel), and add
      the same catalogue assertion to `packages/cloud/test`. Verify
      `pnpm --filter @meltemi/diagrams-cloud test` is green, the new test included.

## 3. The documentation

- [x] 3.1 `git mv docs/playground.md docs/web-app.md` and `docs/es/playground.md docs/es/web-app.md`,
      titled "The web app" / "La app web", and update every link to them outside
      `docs/decisions` and the archive. Verify `pnpm --filter @meltemi/diagrams-acceptance test`
      (the docs link test) is green and `grep -rn "playground\.md" docs README*.md CONTRIBUTING.md`
      finds only decisions.
- [x] 3.2 Rewrite the English guides and README that call the page "the playground"
      (`README.md`, `CONTRIBUTING.md`, `docs/cloud.md`, `docs/editor.md`, `docs/compatibility.md`,
      `docs/verification/browsers.md`, `docs/web-app.md`, `docs/getting-started.md`,
      `docs/features.md`, `docs/agents.md`, `docs/security.md`, `docs/quality.md`,
      `docs/language/{assets,projects}.md`, `docs/launch/*.md`, `docs/README.md`), leaving commands
      and package names as they are. Verify `grep -rniw playground docs/*.md docs/language
      docs/launch docs/verification README.md CONTRIBUTING.md` shows only commands, package
      names and decisions.
- [x] 3.3 The same for the Spanish guides (`README.es.md`, `docs/es/**`). Verify the same `grep`
      over `docs/es` and `README.es.md`, and that the docs test's language links are green.
- [x] 3.4 Add the entry to the changelog's open section and write
      `docs/decisions/0069-the-app-is-meltemi-diagrams.md` (the name, the noun, the header, the
      guide's file, the identifiers that keep the word, the open branches' links), adding "Amended
      by 0069" to 0031's status line. Verify the decision links resolve in the docs test.

## 4. The family site

- [x] 4.1 In `C:\meltemi\web`, edit the two cards of `packages/site/public/diagrams/index.html`
      and `public/es/diagrams/index.html` as design decision 8 says, run the site's tests and open
      a pull request. Verify the pull request's CI is green and the sentence reads as decided.

## 5. Gates

- [x] 5.1 Run `pnpm typecheck`, `pnpm lint` and `pnpm test` at the root and
      `openspec validate "web-app-name" --strict`. Verify all green and record the results
      in the change's `validation.md`.

## Workflow follow-up

- Archive the change after review; the archive renames "A cloud project bound to the Studio" in
  `playground-cloud` and syncs the three deltas.
- When an open branch that links `docs/playground.md` merges, the docs test names the link to fix.
