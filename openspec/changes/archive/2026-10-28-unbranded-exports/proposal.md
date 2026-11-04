## Why

The owner asked on 2026-10-27 to offer a list of selected accounts of the hosted service, his own
administrator account among them, a way to export certain diagrams without the Meltemi branding. The
branding is the strip at the foot of the screenshot's sheet: the Meltemi mark, the wordmark
"Meltemi Diagrams" and the diagram's title, drawn by `brandFrame()` as the scene group `frame`
(`packages/layout/src/frame.ts:46-85`) whenever the resolved theme's `frame` token is not `none`
(`packages/layout/src/layout.ts:1996-2006`, `2162-2165`; the sequence layout at
`packages/layout/src/sequence.ts:542-548`, `592-595`). It is three theme tokens, `frame`, `brand`
and `mark` (`packages/layout/src/theme.ts:94-96`; validated at `packages/model/src/schema.ts:395-397`),
and the default theme `technical.light` carries `frame "footer"`, `brand "Meltemi Diagrams"`,
`mark "meltemi"` (`theme.ts:169-171`, `121`; `schema.ts:315`), as do `sketch.*` (`theme.ts:216-220`),
while `stage.*` frames with a header (`209`) and `editorial.*` with nothing (`185`). Every export of
the page goes through `produceExport` with an `ExportRequest` whose only field about the theme is
`theme: string | null` (`packages/editor/src/exports.ts:50-78`, laid out at `267-274`, `350-358`,
the stories at `239-243`, `343-348`), so SVG, PNG, PDF, the HTML player, GIF, WebM and MP4, the
file's profiles (`436-471`) and the cloud thumbnails
(`packages/playground/src/cloud/thumbnail-render.ts:21-42`, `71`) all carry the strip when the
theme frames; the pictures of a catalog come from the same `layoutIn`
(`packages/editor/src/catalog.ts:99-103`).

What the owner may not know is that the strip is already optional, for anyone, in text: decision
0007 made branding a theme of the language and says so in its consequences (neutral exports need
`theme "editorial.light"` or a two-line theme with `frame none`,
`docs/decisions/0007-branding-as-theme.md:38-39`); the docs teach `mark none`, `brand ""` and
`frame none` (`docs/language/svg-export.md:206-215`, `docs/es/language/svg-export.md:221-230`); the
agent skill teaches `--theme editorial.light` for "a neutral sheet without the brand frame"
(`skills/meltemi-diagrams/SKILL.md:50`) and `theme bare { extends "technical.light"; frame none }`
(`skills/meltemi-diagrams/reference/themes.md:68-72`); the CLI's `--theme` overrides the diagram's
(`openspec/specs/cli-export/spec.md:12`); and the theme panel edits the `frame` group of a project
theme (`packages/editor/src/themes.ts:112`; `openspec/specs/theme-editing/spec.md:27-34`). The engine
is MIT and runs locally, so no gate can withhold that; this change is about the convenience the
hosted page offers, and who it offers it to (whether the page's own controls should go on offering
the free path to everyone is the owner's call, asked in the design's Open Questions). Today the page
offers nothing: the inspector's theme row has Theme, a light/dark button and New/Edit theme
(`packages/canvas/src/inspector.ts:1407-1447`); the export dialog has Theme and the rows scenario,
fonts, motion, at, scale, size, background, link, embed, autoplay, loop, fps and duration
(`packages/playground/src/exports/dialog.ts:305-308`, `354-367`) and never reads who is signed in,
although `PlaygroundOptions.session` holds it (`packages/playground/src/shell.ts:92-100`, `209`);
`editorial.*` as the way out also changes the font, the arrowheads and the sizes (`theme.ts:175-186`).
And there is no entitlement anywhere to select accounts with, nor a way to list them: the user row
is `sub, name, picture, email, email_verified, created_at` plus `handle`
(`packages/cloud/migrations/0001_accounts.sql:13-20`, `0003_sharing.sql:19-21`;
`packages/cloud/src/store/types.ts:11-23`), the store finds a person by `sub` alone (`user(sub)`,
`types.ts:250`; the one statement on handles is the uniqueness check, `src/store/d1.ts:498`),
`GET /api/session` answers `user: { sub, name, picture, handle }` (`packages/cloud/src/routes/session.ts:50-54`,
`58-66`), the page keeps a `SessionUser` of that shape (`packages/playground/src/cloud/session.ts:14-21`)
and shows the person's `sub` nowhere (Profile, `packages/playground/src/cloud/account-panel.ts:256-321`);
the identity contract carries no role or entitlement claim; administrators exist as the `sub`s of
`ADMIN_SUBS` (`packages/cloud/src/config.ts:18-19`, `72-79`, `92`) with one power, the takedown
(`packages/cloud/src/routes/admin.ts:33-52`; decision 0042). This change adds the entitlement, the
routes that grant, revoke and list it, the session answer that carries it, the dialog's switch and
the request field every format shares. Post-1.0 change, outside the roadmap (`docs/roadmap-1.0.md`);
it builds on `brand-themes`, `web-playground`, `cloud-accounts`, `sharing-and-permissions`,
`account-panel` and `export-defaults-and-visible-effects`.

## What Changes

- **A branding switch in every export request.** `ExportRequest` gains `branding?: "theme" |
  "none"` (`"theme"` when left out). `produceExport` passes it to every layout it makes, for the
  diagram, the views of a story, the drill-down views of the HTML player, the frames of a video,
  as a new layout option `frame: "none"` that `layoutDiagram` applies after the theme resolves, so
  the palette, the fonts, the sizes and the sketch stay and only the strip goes, in every profile
  (sequence included) and every format; `buildCatalog` takes the same option for the pictures of a
  catalog. A request without the field draws the theme's frame, so the CLI, the file's profiles,
  the thumbnails, the published catalogs and the branded snapshots of the corpus keep their output.
- **A checkbox for entitled accounts.** The export dialog shows **Export without the Meltemi
  branding**, with a hint saying what goes (the strip at the foot of the sheet: the mark, the
  wordmark and the title), under the Theme field, for every format and target, only when the
  page's session is a cookie session whose answer says the person is entitled; the box starts
  unchecked each time the dialog opens; checked, the request carries `branding: "none"`, the
  catalog button of the same dialog builds its pictures without the strip (the catalog's "Built
  with Meltemi Diagrams" footer stays), and the status line after the download adds "Without the
  Meltemi branding.". The file's profiles are text and the CLI's build, and the checkbox does not
  touch them. On a static server, or for anyone not entitled, the dialog has no such control, not
  a hidden one.
- **An entitlement per account, set, revoked and listed by administrators.** The `users` table
  gains `unbranded_exports` (0 or 1), `unbranded_exports_by` and `unbranded_exports_at`
  (migration 0005), `User` gains the three, the store gains `setUnbrandedExports`,
  `entitledUsers` and `userByHandle`. `GET /api/session` answers `user.entitlements:
  { "unbranded": boolean }` for a cookie and for a token principal: the row's flag, or true for a
  `sub` in `ADMIN_SUBS`, so the owner is entitled with no data change. Three routes under the
  takedown route's rules (a cookie of a listed `sub` on the page's origin, `404 not-found` to
  everybody else, the `Origin` rule first): `GET /api/admin/entitlements` lists the entitled
  accounts (`sub`, `handle`, `name`, who granted and when), `GET` and `PUT
  /api/admin/accounts/<account>/entitlements` (`{ "unbranded": boolean }`) read and set one
  account's flag, `<account>` being a `sub` or `@<handle>`; `404` for an account with no row,
  `400 request.invalid` for another body. The owner calls them from the browser's console on the
  page with a `fetch` the docs show, as the docs will show for the takedown. Deleting the account
  removes the row and the flag with it.
- **The entitlement in the page.** `SessionUser` gains `entitlements.unbranded`, read as `true`
  only when the answer says exactly that. The account panel's Profile shows every signed-in person
  their **Account id** (the `sub`) with a Copy button, so that a person can hand it to an
  administrator, and shows an entitled person one heading and sentence: the account may export
  without the Meltemi branding and the export dialog offers it; nothing of that for anyone else.
- **Documentation.** `docs/playground.md` (the export dialog, the Profile row), `docs/cloud.md`
  (the session answer, the routes table, an "Entitlements" section beside Takedown with the
  console snippets, the users section), `docs/security.md` (what administrators can do) and
  `docs/language/svg-export.md` (one sentence: the editor and the hosted page can leave the strip
  out by request) with their Spanish copies; the changelog's 1.10.0 section; decision 0061.

## Non-goals

- The spacing between a sequence diagram's participants and nested calls belong to
  `sequence-spacing-and-nested-calls`.
- The inspector's collapse and the tooltips of the toolbar's icons belong to
  `inspector-collapse-and-tooltips`.
- The agent setup prompt and the documentation of the skill on the web belong to
  `agent-setup-prompt`; the skill's neutral path (`--theme editorial.light`, `frame none`) stays
  correct and this change does not touch `skills/`.
- The `delivery` change owns the pipelines, which apply migration 0005 and deploy the Worker, and
  the release of what this change ships; the `ADMIN_SUBS` value is the one it already declares.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `flow-svg-export`: MODIFIED "Styles and themes" (the layout accepts `frame: "none"` as an
  override applied after the theme resolves, keeping every other token).
- `playground-exports`: MODIFIED "Same requests as the CLI" (the one field the dialog adds beyond
  the CLI's, `branding`, and only for an entitled person) and ADDED "Exports without the branding"
  (the checkbox and its hint, who sees it, what it sends, the notice, the catalog's pictures,
  nothing on a static server or for anyone else, profiles untouched).
- `cloud-accounts`: MODIFIED "Users and the session answer" (`entitlements` inside `user` in the
  two signed-in shapes) and ADDED "Entitlements of an account" (the three columns, administrators
  entitled implicitly, the listing route, the two routes of one account by `sub` or `@<handle>`,
  their refusals, deletion).
- `account-panel`: MODIFIED "Profile and the handle" (the account id with Copy for everyone, the
  entitlement shown to an entitled person, nothing of it to anyone else).

## Impact

- `packages/layout`: `src/layout.ts` (`LayoutOptions.frame`, applied after `resolveTheme`);
  `test/themes.test.ts`.
- `packages/editor`: `src/exports.ts` (`ExportRequest.branding`, `layoutOf`, `storyLayouts`,
  `drillViews`, `produceVideo`), `src/layouts.ts` (`layoutIn`'s frame parameter), `src/catalog.ts`
  (`CatalogOptions.frame`); `test/exports.test.ts`.
- `packages/cli`: `test/catalog.test.ts` (a catalog built with `frame: "none"`).
- `packages/cloud`: `migrations/0005_unbranded_exports.sql` (new), `src/store/types.ts`
  (`User.unbrandedExports`, `unbrandedExportsBy`, `unbrandedExportsAt`, `setUnbrandedExports`,
  `entitledUsers`, `userByHandle`), `src/store/d1.ts`, `src/store/memory.ts`,
  `src/routes/session.ts` (`entitlements`), `src/routes/admin.ts` (`entitlementsListRoute`,
  `entitlementsRoute`, `setEntitlementsRoute`), `src/handler.ts` (three routes);
  `test/store/conformance.ts`, `test/migration-unbranded.test.ts` (new),
  `test/migration-sharing.test.ts` (the exact list of files gains the fifth), `test/audit.test.ts`,
  `test/entitlements.test.ts` (new), `test/events.test.ts`, `test/browser/scenarios-unbranded.ts`
  (new) and `test/browser/run.ts`.
- `packages/playground`: `src/cloud/session.ts` (`SessionUser.entitlements`), `src/exports/dialog.ts`
  (the checkbox and its hint, the request, the notice, the catalog button), `src/exports/files.ts`
  (`projectCatalog` and `downloadCatalog` take the branding), `src/cloud/account-panel.ts` (the
  account id, the Profile block), `src/messages/en.ts`, `es.ts`, `account-panel-en.ts`,
  `account-panel-es.ts`; `test/session.test.ts`, `test/messages.test.ts`,
  `test/account-messages.test.ts`, `test/browser/run.ts`.
- `docs/playground.md`, `docs/es/playground.md`, `docs/cloud.md`, `docs/es/cloud.md`,
  `docs/security.md`, `docs/es/security.md`, `docs/language/svg-export.md`,
  `docs/es/language/svg-export.md`, `CHANGELOG.md`, `docs/decisions/0061-unbranded-exports.md`.
