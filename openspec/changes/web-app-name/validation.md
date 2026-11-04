# Validation

Run on 4 November 2026 in the worktree of branch `web-app-name`, from `origin/main` at `8949b7b`.

## Gates

| Check                                         | Result                                  |
| --------------------------------------------- | --------------------------------------- |
| `pnpm typecheck`                              | green                                   |
| `pnpm lint`                                   | green                                   |
| `pnpm test`                                   | 335 files, 9942 passed, 1 skipped       |
| `pnpm playground:test-browser`                | 101 passed, 0 failed                    |
| `pnpm --filter @meltemi/diagrams-playground typecheck`, `pnpm --filter @meltemi/diagrams-cloud typecheck` | green |
| `pnpm vitest run packages/acceptance/test/docs.test.ts` | 86 passed                     |
| `openspec validate "web-app-name" --strict`   | valid                                   |
| Meltemi Web, site unit tests                  | 97 passed, 1 skipped                    |
| Meltemi Web, pull request #19 CI              | six checks green, the site in Chrome included |

## Evidence by task

- 1.1: before the catalogues changed, `messages-name.test.ts` failed naming 13 entries in each
  language (`page.title`, `page.description`, `page.loading`, `page.failed`, `header.tag`,
  `header.actions`, `header.about`, `project.noneOpenable`, `share.otherVersion`, `about.title`,
  `about.text`, `explorer.actions.editable`, `cloud.sharing.linkHint`); after, it passes. It walks
  every entry of `en` and `es`, the explorer's, the share dialog's and the account panel's
  catalogues included, saying each sentence with strings, lists, counts and counted kinds.
- 1.4: `pnpm playground:build` writes `<title>Meltemi Diagrams</title>`, the description
  "Meltemi Diagrams: write diagrams as code, …" and `NOTICES.md` opening "Meltemi Diagrams 1.11.0 in
  the browser."; the only "playground" left in `dist/index.html` is `playground.js`,
  `playground.css` and the container's id.
- 1.5: the browser suite asserts the title, the tag Web, the About button and dialog in English
  and Spanish and About's first paragraph. `docs/media/editing-demo.gif` showed the tag
  "Playground", so `pnpm demo` recorded it again (180 frames, 31.7 s); the demo's script now opens
  the inspector's Layout and Details tabs before the routing and label fields, which the tabbed
  inspector had hidden.
- 2.1: `packages/cloud/test/messages-name.test.ts` walks the Worker's catalogues in both languages.
- 3.1–3.3: `grep -rn "playground\.md" docs README*.md CONTRIBUTING.md` finds only the links to
  decision 0031's file. The words left in the guides of both languages are commands
  (`pnpm playground:*`), paths (`packages/playground`, `/playground.js`, the `/playground` project
  root), `PLAYGROUND_IDENTITY`, the capability id `web-playground` and that decision link. The
  generators' labels (`packages/acceptance/src/browsers.ts`, `first-export.ts`) say "Web app" and
  "web app", and the recorded tables of `docs/verification/browsers.md` and
  `docs/quality/results.md` carry the same label. Two more specs named the guide's file, so the
  change gained MODIFIED deltas for `localized-documentation` and `agent-skill`; the open changes
  `unbranded-by-donation`, `playground-sea` and `gantt-diagrams` now name `docs/web-app.md`.
- 3.4: the changelog's entry sits under 1.11.5, the version the next main commit takes if this one
  lands next; correct the heading at merge if another commit lands first.
- 4.1: https://github.com/askenaz-dev/meltemi-web/pull/19, CI green, not merged.
