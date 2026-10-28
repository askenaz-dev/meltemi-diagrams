## Context

**The strip.** `Theme` has `frame: "none" | "footer" | "header"`, `brand: string` and `mark:
"meltemi" | "none"` (`packages/layout/src/theme.ts:17-18`, `94-96`); the wordmark is the one
constant `BRAND_NAME = "Meltemi Diagrams"` (`121`); `TECHNICAL` carries `frame "footer"`, `brand
BRAND_NAME`, `mark "meltemi"` (`169-171`), `EDITORIAL` spreads it with `frame "none"` (`175-186`),
`STAGE` with `frame "header"` (`189-210`), `SKETCH` keeps the footer (`216-220`). `resolveTheme(name,
definitions)` resolves a name through the file's theme blocks and their `extends` chains, else the
built-ins, else the default with `known: false` (`392-413`). `layoutDiagram(compilation, diagram,
options)` reads `options.theme ?? diagram.properties.theme`, resolves it with `options.themes ??
compilation.document.themes` and `options.defaultTheme`, and keeps the resolved `theme` for the
whole layout (`packages/layout/src/layout.ts:999-1003`); a sequence diagram is handed that same
`theme` (`1021-1022`; `packages/layout/src/sequence.ts:95-98`). The frame is emitted when
`theme.frame !== "none"`: the canvas grows by `scale.frameHeight` and to `frameMinWidth` (`layout.ts:
1996-2006`, `2902-2913`), the mark's gradient is declared when `theme.mark === "meltemi"` (`2165`),
and `emitter.frame()` appends `brandFrame(theme, scale, metrics, width, stripTop, title)` as the
last item (`2162-2164`, `4970-4971`; the sequence layout at `sequence.ts:542-548`, `592-595`):
a hairline, the mark (`packages/layout/src/frame.ts:70-73`), the wordmark when `theme.brand.trim()
!== ""` (`74-78`) and the title right-aligned (`79-83`), in the group `{ id: "frame", role:
"frame" }` (`84`). `LayoutOptions` has `theme`, `defaultTheme` and `themes` among its options
(`layout.ts:130-139`). The tests pin the default frame (`packages/layout/test/themes.test.ts:40-54`),
the frameless editorial (`56-60`) and a header without the mark (`226-236`).

**The requests.** `ExportRequest` (`packages/editor/src/exports.ts:50-78`) is built by the export
dialog's `baseRequest` (`packages/playground/src/exports/dialog.ts:207-228`, the theme set at
`438-443`), by the CLI's `base` (`packages/cli/src/export-command.ts:387-388`), by `profileRequest`
for the file's `export` blocks (`exports.ts:436-471`, `theme: profile.theme` at `455`) and by the
cloud thumbnail's `svgRequest` (`packages/playground/src/cloud/thumbnail-render.ts:21-42`). Every
field but `locale` is required (`77`). `produceExport` lays out through `layoutOf(context, owner,
diagram, theme, scenario, locale)` (`112-137`), which calls `layoutIn(workspace, projects, owner,
diagram, theme, scenario, locale)` (`packages/editor/src/layouts.ts:17-40`, the one place
`layoutDiagram`'s options are assembled for exports and the catalog); `storyLayouts` (`140-149`) and
`drillViews` (`177-193`) lay out through the same `layoutOf` with `request.theme`, and so do the
diagram branch (`267-274`) and `produceVideo` (`343-348`, `350-358`). The catalog is the other
caller: `buildCatalog(workspace, projects, options)` (`packages/editor/src/catalog.ts:75`;
`CatalogOptions` at `27-40`: `out`, `title`, `source`, `generator`, `script`, `liveReload`) lays
every picture out with one `lay()` wrapping `layoutIn(workspace, projects, owner, diagram, null,
scenario)` (`99-103`), for the diagrams (`139`) and, through `storyLayoutsIn` (`layouts.ts:43-59`),
the stories (`191-192`); the page builds it in `projectCatalog(playground, { locale, strict })`
(`packages/playground/src/exports/files.ts:77-91`) for the dialog's catalog button
(`downloadCatalog`, `98`; `dialog.ts:551-564`) and for publishing (`packages/playground/src/cloud/publish.ts:54`,
`strict: true`); `packages/cli/test/catalog.test.ts` tests the build. `ExportOutput` carries
`notices` (`85-90`), the sentences of what an export chose because nothing said (decision 0055);
the dialog's `run` joins its own notices (the WebM background, `dialog.ts:126-134`) with the
output's after the download's message (`140-143`). The dialog's rows are `field(label, input,
hint?)`s and `check(label, input)`es (`351-352`, the rows at `354-367`; `at`, `scale`, `size` and
`link` carry a hint, `357-360`), shown per format by `show()` (`374-392`), listed by `openDialog`
after the Theme and Language fields (`566-590`); `openExportDialog(playground, preset)` has the
`Playground` (`274-277`), whose `options.session` is the session the page read at start
(`packages/playground/src/shell.ts:92-100`, `209`). `Session` is `anonymous`, `cookie` with a
`SessionUser` and `token`, which the page treats as nobody (`packages/playground/src/cloud/session.ts:23-43`);
`parseSession` hands `userOf` the answer's `user` object only (`132`), `userOf` reads `sub`, `name`,
`picture` and `handle` from it defensively (`107-117`) and `parseSession` never throws (`124`). The
dialog's words are `messages().exports` (`packages/playground/src/messages/en.ts:329`, `es.ts:303`),
the hints' style `instantHint` (`en.ts:378`), the notices' `webmBackground` (`370`);
`packages/playground/test/messages.test.ts` and `test/account-messages.test.ts` check parity.

**The account.** `users` is `sub, name, picture, email, email_verified, created_at`
(`packages/cloud/migrations/0001_accounts.sql:13-20`) plus `handle` (`0003_sharing.sql:19-21`);
the latest migration is `0004_takedown_project.sql`, one `ALTER TABLE … ADD COLUMN` with a comment.
The migration tests pin each file's number and that it only creates or adds:
`packages/cloud/test/migration-sharing.test.ts` names `THIRD_FILE` and `FOURTH_FILE` (`18-20`) and
asserts with `toEqual` the exact list of the four files (`112-119`), so a fifth file changes that
test; `migration.test.ts:69-75` and `migration-projects.test.ts:102-108` tolerate a fifth. `User` is
`UserProfile` plus `createdAt` and `handle` (`packages/cloud/src/store/types.ts:11-23`);
`CloudStore` has `user(sub)`, `upsertUser` (`250-252`) and `setHandle` (`523-529`), and nothing
that finds a person by anything but the `sub`: the one statement on handles besides `SET_HANDLE` is
the uniqueness check `HANDLE_HELD_BY_ANOTHER` (`packages/cloud/src/store/d1.ts:496-498`). The D1
store reads `USER_COLUMNS` (`d1.ts:140-141`, `152-160`, `285-287`) and the memory store mirrors it
(`packages/cloud/src/store/memory.ts:150-174`); both delete the row on `user.deleted` (`d1.ts:606-632`,
`memory.ts:176-196`) and both pass one conformance suite (`packages/cloud/test/store/conformance.ts:60`,
the users at `118-238`; `setHandle` in `conformance-sharing.ts:770-797`). `HANDLE` is
`/^[a-z0-9-]{3,30}$/` (`packages/cloud/src/ids.ts:13`). The one administrator action leaves a
record: `takedowns (handle, slug, by_sub, reason, at, project_id)` (`0003_sharing.sql:76-83`,
`0004`). `Principal` is `via: "cookie"` with `sub`, `sid`, `profile` and the token, or `via:
"token"` with `sub`, `tokenId`, `tokenName` (`packages/cloud/src/types.ts:24-42`). `sessionRoute`
builds the cookie shape's `user` with `handle: user?.handle ?? null` (`packages/cloud/src/routes/session.ts:50-54`)
and the token shape's (`58-66`), two literals; `packages/cloud/test/audit.test.ts:66` tests the
three shapes. `config.admins` is the set read from `ADMIN_SUBS` (`packages/cloud/src/config.ts:18-19`,
`72-79`, `92`; `packages/cloud/src/env.ts:62-66`, `84-85`), a Secrets Store binding the family's
Terraform declares (`packages/cloud/wrangler.jsonc:47-51`; decision 0046). `takedownRoute` is the
one admin route (`packages/cloud/src/routes/admin.ts:33-52`): `principal?.via !== "cookie" ||
!config.admins.has(principal.sub)` is `fail("not-found")` (`52`), a `404` and never a `403`; an API
token of an administrator is refused too, and the `Origin` rule runs first for every change made
with the cookie (`packages/cloud/src/handler.ts:362-369`; `openspec/specs/cloud-service/spec.md:92-105`);
a `handle` or `slug` of another shape is `404` too (`56-57`); its tests are
`packages/cloud/test/publish-routes.test.ts:1111-1220`. Its own comment says how it is called: "the
person who runs the service calls them with the session cookie on the page's own origin … or from a
development tool" (`admin.ts:1-4`); the docs' Takedown section describes the route and its rules
(`docs/cloud.md:1746-1763`; `docs/es/cloud.md:1825-1843`) and shows no call (the one `fetch(` in
that file is the assets binding, `109`). `readObject(ctx, MAX_JSON_BYTES, "request.invalid")` reads
a JSON body (`packages/cloud/src/routes/projects.ts:85`); `not-found` is `404` and `request.invalid`
`400` (`packages/cloud/src/errors.ts:7`, `10`). The cloud browser suite mints sessions and makes
people (`packages/cloud/test/browser/support.ts:36-63`, `73-103`), runs the Worker with one
administrator, `ADMIN_SUB = "u-admin-suite"` (`packages/cloud/test/browser/worker.ts:326`; asserted
as the whole `ADMIN_SUBS` at `test/browser/helpers.test.ts:160-161`; used at
`scenarios-publishing.ts:227`), and exports an SVG from the dialog in a viewed project
(`scenarios-viewing.ts:233-245`); the playground suite's static server answers `/api/session` with
`{ "user": null }` and exports from the dialog (`packages/playground/test/browser/run.ts:258-265`,
the Spanish run at `3224-3241`). The account panel's Profile is built at
`packages/playground/src/cloud/account-panel.ts:256-321` from `options.user` (`openAccountPanel`,
`77`; the user from the session at `packages/playground/src/cloud/account.ts:53-64`): the head, the
emails, the handle form (`field(m.handleLabel, handleInput, m.handleHint)`, `273-278`) and Sign
out, appended in that order (`299-321`), with the words of `account-panel-en.ts:20-34`; nothing
shows the `sub`. The cloud dialogs copy
text with `copyText` (`packages/playground/src/cloud/clipboard.ts:5-8`, false when the browser
refuses) and select the text for copying by hand when it fails (`publish.ts:309`).

**The docs.** `docs/playground.md:207-235` (Exports in the browser), `274-297` (The account),
`299-313` (The account panel, the Profile row at `308`) and `docs/es/playground.md:219-249`,
`292-318`, `319-333`; `docs/cloud.md:19-37` (the account is a layer), `189-195` (Users), `286-305`
(the routes table), `371-417` (the session answer, two JSON examples with `user`), `1377-1379` (who
needs what), `1746-1763` (Takedown), `1845-1857` (variables, `ADMIN_SUBS` at `1855`) and
`docs/es/cloud.md:307-325`, `391-430`, `1825-1843`, `1928-1940`; `docs/security.md:140-141` and
`docs/es/security.md:156`; `docs/language/svg-export.md:206-215` and `docs/es/language/svg-export.md:221-230`.

## Goals / Non-Goals

**Goals:**

- One request field makes every format, every profile of the language, every view of a story or a
  player and the pictures of a catalog leave the strip out, with the theme otherwise intact, and
  nothing else changes.
- The hosted page offers it as one checkbox to the accounts an administrator selects, the owner
  included by being an administrator, and to nobody else, with no trace on a static server.
- The entitlement is data of the account, set, revoked and listed through the Worker under the
  administrators' rules, reported in the session answer and shown in the account panel; the owner
  can see who is selected and name a person by handle or by the account id the person reads in
  Profile.

**Non-Goals:**

- A gate on the capability: the engine is MIT and runs locally, so `frame none`, the `editorial.*`
  themes, the CLI's `--theme` and the skill's neutral path keep exporting without the strip for
  anyone (decision 0007), and the docs say so. Whether the page's own controls go on offering that
  path to everyone is the owner's call (Open Questions), not a non-goal.
- A per-diagram, persistent choice (that is text: a theme block), a language option for `export`
  blocks, a CLI flag, or a change of the inspector's theme row.
- The `<meta name="generator">` of the player and the catalog, which names the tool that built a
  page, as any generator meta does.
- Thumbnails, which keep the file's theme.
- Any change to the identity contract or to Meltemi Web.

## Decisions

### The switch is a request field, applied as a `frame: "none"` layout override

`ExportRequest` gains `readonly branding?: "theme" | "none"`, optional like `locale`, meaning
`"theme"` when left out, so the CLI's `base`, `profileRequest`, the thumbnail's `svgRequest` and
every test fixture keep building requests unchanged. `layoutOf` takes the request's `branding` beside
its `theme` and passes `frame: branding === "none" ? "none" : undefined` to `layoutIn`, which gains
a trailing `frame?: "none"` parameter after `locale` and hands it to `layoutDiagram`; `storyLayouts`,
`drillViews`, the diagram branch and `produceVideo` all go through `layoutOf`, so a story's views,
the player's drill-down views and every video frame follow. `CatalogOptions` gains `readonly frame?:
"none"` and `buildCatalog`'s `lay()` passes it to `layoutIn`, so the catalog's pictures, the stories'
views included, follow too while its footer and its generator meta stay. `LayoutOptions` gains
`readonly frame?: "none"`, documented as "draws the scene with `frame none` whatever the theme says,
keeping every other token", and `layoutDiagram` applies it right after `resolveTheme`
(`layout.ts:1001-1003`): `const theme = options.frame === "none" ? { ...resolved.theme, frame: "none" }
: resolved.theme`. From there the existing code does the rest: `framed` is false (`1996`), no
gradient is declared (`2165`), no strip is appended (`2162`), the sequence layout sees the same theme
(`1021-1022`, `sequence.ts:542`), the sketch passes find no frame to paint, and the
`layout.unknown-theme` diagnostic is untouched. The two names are deliberate: the layout speaks of the
`frame` token, which the docs teach, and the request speaks of the branding the person left out,
which the dialog says. Alternatives: (a) the dialog rewriting the theme to a generated `<theme>-plain
{ extends …; frame none }` block (a file change for a visual choice, which the person would see in
the code pane and in Git, and the thumbnails and the CLI would follow it, which the owner did not ask
for); (b) `branding` setting `mark none` and `brand ""` and keeping the strip with the title (a
hairline with a lone title at the foot of the sheet looks like a mistake, and the docs' neutral path
is `frame none`); (c) a required field (every builder of a request changes for a default).
Recommendation: the optional request field and the layout override, threaded into the catalog too.

### The checkbox: entitled cookie sessions only, every format, a hint, unchecked at each opening

`openExportDialog` computes `const unbranded = session.kind === "cookie" &&
session.user.entitlements.unbranded` from `playground.options.session` and, when true, builds a
`check(m.unbranded, branding, m.unbrandedHint)` placed right after the Theme field (before Language)
in `openDialog`'s list, since it qualifies the theme; `check()` gains the optional hint `field()`
has, rendered as the same `field-hint`, because "branding" here removes the whole strip, the
diagram's title included, and every comparable row of the dialog says what it does (`instantHint`,
`scaleHint`, `sizeHint`, `linkHint`). The control is not built at all otherwise, so the DOM of a
static page or of a plain person has nothing to find. It shows for every format and target: SVG,
PNG, PDF and the player draw the frame, the player's bundled views do, and a video's frames do.
Checked, `exportNow` sets `request.branding = "none"`; `run` adds `m.unbrandedNotice` ("Without the
Meltemi branding.") to its notices when `built.request.branding === "none"`, so the status line
reads "Downloaded checkout.svg. Without the Meltemi branding.", the way the WebM notice is said. The
catalog button of the same dialog follows the box: `downloadCatalog(playground, locale, branding)`
passes it to `projectCatalog`, which passes `frame: "none"` to `buildCatalog`, so the catalog the
owner hands to a client has no branded sheet inside while its footer "Built with Meltemi Diagrams
<version>" stays (an open question of its own); publishing builds its catalog without the option
(`publish.ts:54`), so a published page keeps the strip. The box is unchecked each time the dialog
opens: an unbranded export is a choice for certain diagrams, and a remembered one would make the next
export of another diagram unbranded without a word. The profile buttons (`runProfile`,
`dialog.ts:604`) are untouched: a profile is text, and its neutral path is `theme`. A token session
never reaches the dialog (the page treats it as nobody, `session.ts:24-27`). Alternatives:
remembering the box for the page's session (a module variable; the accident above); remembering it
per diagram id for the page's session (pre-checked when the same diagram is exported again; the
owner's "para ciertos diagramas" reads that way, so it is asked below); persisting it with the
page's settings (the same accident across reloads, and settings sync nowhere); a Branding select
with `theme | none` (two values do not need a select); a switch in the inspector's theme row (the
inspector writes the file, which this must not); leaving the catalog out of the box and greying the
catalog button's hint while the box is checked (a dialog inconsistent with itself). Recommendation:
the checkbox under Theme with its hint, unchecked at each opening, with the notice, covering the
catalog's pictures.

### `entitlements` lives inside `user` in the session answer

The two signed-in shapes of `GET /api/session` answer `user: { sub, name, picture, handle,
entitlements: { unbranded: boolean } }`; the anonymous shape is unchanged. The page's `parseSession`
hands `userOf` the `user` object alone (`session.ts:132`), `SessionUser` is what `userOf` returns,
and the entitlement is a fact about the person, like the handle, so it belongs where the person is;
`sessionRoute` builds the object once, in a `userShape(sub, name, picture, user)` helper the cookie
branch and the token branch share, with `unbranded: (user?.unbrandedExports ?? false) ||
config.admins.has(sub)`. For a bearer principal the field is informational: nothing in the CLI
reads it until a `--branding` flag exists (Open Questions), as nothing read the handle before the
CLI published, and one `user` shape in both answers keeps `userOf` one function. Alternative: a
top-level `entitlements` beside `user` (then `parseSession`, not `userOf`, would read
`body["entitlements"]` and fold it into the user before the cookie/token branch, and the token shape
would carry a field the token's `user` does not; two places to read one fact). Recommendation:
inside `user`, in both shapes.

### The entitlement is three columns of `users`, set by administrators through the Worker

Migration `0005_unbranded_exports.sql`: `ALTER TABLE users ADD COLUMN unbranded_exports INTEGER NOT
NULL DEFAULT 0 CHECK (unbranded_exports IN (0, 1));`, `ALTER TABLE users ADD COLUMN
unbranded_exports_by TEXT;` and `ALTER TABLE users ADD COLUMN unbranded_exports_at TEXT;`, each with
its comment, the pattern of `0003`'s `handle` and `0004`'s `project_id`: `0` for every row and
`NULL` for the two until an administrator sets the flag; `by` and `at` record who last set or
revoked it and when, as `takedowns (by_sub, at)` records the other administrator action, so the
owner can tell when and by whom an account was entitled. A test like `migration-sharing.test.ts`
(the fifth numbered file, three `ALTER`s, plain ASCII), and `migration-sharing.test.ts` itself
gains `FIFTH_FILE` in its exact list, as `FOURTH_FILE` was added. `User` gains `readonly
unbrandedExports: boolean`, `readonly unbrandedExportsBy: string | null` and `readonly
unbrandedExportsAt: Iso | null`; `USER_COLUMNS` and `toUser` read them; `upsertUser` never writes
them (as `handle`); `CloudStore.setUnbrandedExports(sub: string, on: boolean, by: string, at: Iso):
Promise<"set" | "missing">` is one statement, `UPDATE users SET unbranded_exports = ?,
unbranded_exports_by = ?, unbranded_exports_at = ? WHERE sub = ?`, `"missing"` when no row matched;
the memory store mirrors it; the conformance suite's users block gains the cases (a new person is
not entitled with `null` by and at, set to true then false with by and at following, a missing
person, another person untouched, a `sub` that merely starts the same). Deletion needs no new
statement: `applyUserDeleted` removes the row (`d1.ts:631`, `memory.ts:192`). Administrators are
entitled implicitly in the session answer (previous decision), so the owner needs no grant and
`ADMIN_SUBS` keeps its one meaning as the list of who administers; the row of an administrator says
what was set on it, not the implicit entitlement. Two routes of one account in `routes/admin.ts`,
registered beside the takedown (`handler.ts:362-369`): `GET /api/admin/accounts/<account>/entitlements`
answers `200 { "sub", "handle", "name", "entitlements": { "unbranded": boolean, "by": string | null,
"at": string | null } }` with the row's values, and `PUT` the same path with `{ "unbranded": boolean }`
sets the flag with the caller's `sub` and `deps.now()` and answers the same shape; both start with the
takedown's line (`admin.ts:52`), so an anonymous caller, a person not listed and an administrator's
API token get `404 not-found`, and the `Origin` rule runs before the `PUT`. `<account>` is resolved
by the next decision; an account with no row is `404 not-found` "There is no such account." (a
person has a row from their first request, `docs/cloud.md:189-195`). A body that is not `{ "unbranded":
boolean }` is `400 request.invalid`. Alternatives: (B) a Worker variable `UNBRANDED_SUBS` mirrored on
`ADMIN_SUBS` (config, one line in the session route, tests like `config.test.ts:243-255`; but every
grant needs a change of a Secrets Store value through the family's Terraform and a redeploy, decision
0046, nobody can be added from the page, and nothing records when); (E) a claim from the identity
service (a contract change in Meltemi Web and a new `@meltemi/identity` before this ships, and a
product flag in a family token); a bare 0/1 column without `by` and `at` (nobody could tell when or
by whom an account was entitled or revoked, while the precedent records both). Recommendation: the
three columns, the two routes, administrators implicit.

### The list and the lookup: a listing route, `@<handle>` in the path, the account id in Profile

The owner asked for "un listado de usuarios seleccionados", so the service must show it and the
owner must be able to name a person. `GET /api/admin/entitlements` answers `200 { "accounts":
[ { "sub", "handle", "name", "entitlements": { "unbranded": true, "by", "at" } } ] }`, the rows whose
flag is `1`, the earliest grant first (`ORDER BY unbranded_exports_at, sub`), under the same line as
the other admin routes; `CloudStore.entitledUsers(): Promise<User[]>` backs it in both stores (one
`SELECT … WHERE unbranded_exports = 1`), with conformance cases (nobody; two granted in order; one
revoked leaves). Its path is its own and not `/api/admin/accounts`, because the service lists no
accounts, only the selected ones. For naming a person, `<account>` in `/api/admin/accounts/<account>/entitlements`
is a `sub` (one to two hundred characters without control characters, taken as given) or
`@<handle>` (`@` followed by a match of `HANDLE`, `ids.ts:13`), resolved with the new
`CloudStore.userByHandle(handle): Promise<User | undefined>` (one `SELECT … WHERE handle = ?` on
the unique index `users_handle`, `0003_sharing.sql:21`; the memory store scans); anything else is
`404`, as `HANDLE` and `SLUG` give `404` at `admin.ts:56-57`; the answer always carries the row's
`sub`, so the owner learns it from the handle. A person with no handle (only publishers choose one)
reads their **Account id** in Profile: the panel shows the `sub` in a `code` element with a Copy
button that calls `copyText` (`clipboard.ts:5-8`) and says "Copied."; when the clipboard refuses, the
id is selected and the words say to copy it by hand, as the publish dialog does (`publish.ts:309`).
The id is a random identifier of the person in this service (`u_7d3f` in the docs' examples) and
tells a stranger nothing; the identity service owns the person's name and emails, so the panel adds
no other identifier. Alternatives: no listing (the owner would have to remember whom he granted;
rejected, it is the ask); `GET /api/admin/accounts?handle=` as a separate lookup (a third route for
what the path can say); a lookup by email, `?email=` (the owner knows people by email, but the
cached `email` is the token's claim and may be unverified, and an administrator route that answers
emails is more than a takedown ever exposed; asked below, default no); showing the id in the
account menu instead of Profile (the menu holds actions and the usage block, not facts about the
account). Recommendation: the listing route, `@<handle>` or the `sub` in the path, the account id
with Copy in Profile.

### How the administrator grants: the browser's console, with the calls documented

The service has one administrator, the owner, and the one precedent, the takedown, is called "with
the session cookie on the page's own origin … or from a development tool" (`admin.ts:1-4`) with no
page of its own. The default here is the same: on the page, signed in, the owner opens the browser's
console and runs a `fetch` with `credentials: "same-origin"` (the browser sends the cookie and the
`Origin` header, so the rule holds); the docs' new "Entitlements" section shows the three calls
verbatim, the listing (`await fetch("/api/admin/entitlements", { credentials: "same-origin" }).then((r) => r.json())`),
the grant (`await fetch("/api/admin/accounts/@ana/entitlements", { method: "PUT", credentials:
"same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unbranded: true }) }).then((r) => r.json())`)
and the revocation (the same with `false`), and the Takedown section gains its own `DELETE` snippet
in the same form, so the claim "as takedowns are made today" is written down and true. Alternative:
an Administration section of the account panel, shown only when the session answer says `admin:
true` (a new field of the cookie shape, a seventh `AccountSection`, a list of the entitled accounts
with Revoke, a handle-or-id field with Grant, words in en and es, and the panel's tests); it is the
better product for a second administrator, and it is the owner's call whether DevTools is good
enough for him, so it is asked below. Recommendation: the console with the documented calls; the
routes answer JSON a person can read.

### The page reads the entitlement defensively and shows it in Profile

`SessionUser` gains `readonly entitlements: { readonly unbranded: boolean }`; `userOf` sets
`unbranded` to `true` only when `value.entitlements` is an object whose `unbranded` is exactly
`true`, so an answer without `entitlements`, a static server (`user` is null anyway) or a hostile
body entitles nobody; `session.test.ts`'s `parseSession` block gains the cases. `openAccountPanel`
already receives `options.user`; the Profile section appends, after the handle form and before Sign
out, the account id block of the previous decision for everyone (`h("h4", {}, m.accountIdTitle)`,
`h("p", { class: "account-intro" }, m.accountIdIntro)`, the `code` and the Copy button) and, when
`options.user.entitlements.unbranded`, `h("h4", {}, m.unbrandedTitle)` and `h("p", { class:
"account-intro" }, m.unbrandedOn)`, nothing of the latter otherwise; `AccountPanelModel` and its
state are untouched (nothing to save). A grant made while the page is open shows at the next load,
since the page reads the session once at start (`cloud-accounts`, "The account in the page"); the
docs say so. Alternatives: a line in the account menu (the menu holds actions and the usage block,
not facts about the account); a sentence in the export dialog explaining why the checkbox is there
(the checkbox's own label and hint say it). Recommendation: the Profile blocks.

### Shared projects, thumbnails and the catalog's footer

The entitlement is the person's, not the project's: an entitled viewer of a shared project exports
without the branding as they export anything else (decision 0042: every export works on a viewed
project; `scenarios-viewing.ts:233-245`), and a plain editor of the owner's project does not. The
thumbnail (`thumbnail-render.ts:21-42`) keeps the file's theme: it is the project's own picture in
the person's own switcher and in the pages of the people it is shared with, and a switch there would
be a per-project choice this change does not add. The catalog's footer "Built with Meltemi Diagrams
<version>" (`packages/catalog/src/html.ts:190`; `packages/catalog/src/messages/en.ts:20-21`; the
generator strings at `packages/cli/src/cli.ts:249`, `275`, `packages/cli/src/publish-command.ts:197`,
`packages/playground/src/exports/files.ts:88`) and the `<meta name="generator">` of the player
(`packages/player/src/html.ts:95`) and the catalog (`html.ts:170`) name the tool that built the page,
as any generator meta does; the meta stays, and the footer stays here while the owner answers
(Open Questions). Alternatives: the entitlement bound to the project's owner (the owner's own file
exported by a plain editor would come out unbranded, which the owner did not ask for); thumbnails
following the entitlement (a per-person look of a shared project's card); the footer following the
box (then `buildCatalog` would take `builtWith: false` beside `frame`, one more option and one more
word to drop). Recommendation: the person's entitlement on every export they make, the shared
project's viewer included; thumbnails unchanged; the footer unchanged until the owner answers.

### Words

English: `exports.unbranded` "Export without the Meltemi branding", `exports.unbrandedHint` "Leaves
out the strip at the foot of the sheet: the Meltemi mark, the wordmark and the title; the catalog's
pictures follow.", `exports.unbrandedNotice` "Without the Meltemi branding.",
`accountPanel.accountIdTitle` "Account id", `accountPanel.accountIdIntro` "What this service knows
you by. An administrator may ask you for it to grant something to your account.",
`accountPanel.accountIdCopy` "Copy", `accountPanel.accountIdCopied` "Copied.",
`accountPanel.accountIdSelect` "Select the id and copy it.", `accountPanel.unbrandedTitle` "Exports
without the Meltemi branding", `accountPanel.unbrandedOn` "Your account may export without the
Meltemi branding: the export dialog offers it." Spanish: "Exportar sin la marca de Meltemi", "Omite
la franja al pie de la hoja: la marca de Meltemi, el nombre y el título; las imágenes del catálogo la
siguen.", "Sin la marca de Meltemi.", "Identificador de la cuenta", "Con él te conoce este servicio.
Un administrador puede pedírtelo para conceder algo a tu cuenta.", "Copiar", "Copiado.",
"Selecciona el identificador y cópialo.", "Exportaciones sin la marca de Meltemi", "Tu cuenta puede
exportar sin la marca de Meltemi: el diálogo de exportación lo ofrece." The Worker's JSON errors
stay English, as every error is.

## Risks / Trade-offs

- [The entitlement looks like a lock on a capability that is free] → the proposal, decision 0061
  and `docs/playground.md` say that `frame none` and `--theme editorial.light` export without the
  brand for anyone, and that the entitlement governs the page's one-click convenience.
- [`playground-exports` says "the same requests as the CLI"] → the requirement is restated: the
  same requests plus the one field, sent only by an entitled person, which the CLI could carry too
  if a flag were ever added; the "Same SVG" scenario holds with the box unchecked.
- [A plain person edits the DOM or the request] → they get what `frame none` gives anyone; nothing
  of value is protected by the control, and the Worker never sees the request.
- [The owner must name a person by an opaque id] → `@<handle>` in the path for anyone who
  publishes, the account id with Copy in everyone's Profile, the answer's `handle` and `name`
  beside the flag so the owner sees whom he granted, the listing to review it, and an unknown
  account is `404`, nothing is created.
- [The grant is a console call] → the docs show the three calls verbatim and the routes answer
  readable JSON; the Administration section stays an alternative the owner can choose.
- [The `users` row of a person is written on their first request] → a `PUT` before the person ever
  signed in is `404`; the docs say to grant after the first sign-in.
- [The session is read once] → a grant shows after a reload; the Profile block and the docs say so.
- [The migration runs in production through `deploy.yml`] → the `ALTER`s have defaults, `0` and
  `NULL` for every row, and the tests pin the file's shape and its place in the list; the
  `delivery` change owns the run.
- [The cloud browser suite's Worker has one administrator] → `ADMIN_SUB` is already configured
  (`worker.ts:326`; `helpers.test.ts:160-161`) and the new scenarios grant, list and revoke through it.
- [The catalog follows the box but the footer stays] → the hint says the pictures follow, and the
  footer is an open question the owner answers before or after the first demo.

## Open Questions

- Does "without the branding" also drop the diagram's title, with the whole strip (`frame none`),
  or should the title stay at the foot without the mark and the wordmark (`mark none` plus
  `brand ""`)? Default: the whole strip.
- Should the catalog's footer "Built with Meltemi Diagrams <version>" and the published catalogs on
  `meltemi.page` follow the entitlement? Default: no; the footer names the tool, not the sheet, and
  a published page is built without the box.
- Does the box also cover the catalog section of the dialog, its pictures (the footer apart)?
  Default: yes; the hint says so.
- Should the cloud thumbnails of an entitled person's projects drop the strip? Default: no.
- Should a `--branding none` flag join the CLI for a run with an entitled person's token? Default:
  no; the CLI's neutral path is `--theme` and `frame none`, and the engine cannot enforce a gate.
  Until then the token shape's `user.entitlements` is informational.
- Should the box be remembered per diagram id while the page is open (pre-checked when the same
  diagram is exported again, the notice still said), per page session, or never? Default: never,
  unchecked each time.
- How do you grant: from the browser's console with the documented calls, or from an Administration
  section of the account panel shown only to administrators (the session answer would say `admin:
  true`), with the list, Grant by handle or id and Revoke? Default: the console.
- Are administrators entitled implicitly (you, through `ADMIN_SUBS`, with no grant), and does the
  entitlement follow the person onto projects shared with them (an entitled viewer exports a shared
  project without the strip; a plain editor of your project does not)? Default: yes to both.
- Should the page's own controls go on offering the brand-free path to everyone (the `editorial.*`
  themes in the export dialog's Theme select, the theme editor's `frame`, `brand` and `mark` group)?
  Default: yes (decision 0007; a file theme with `frame none` works anywhere); the entitlement
  governs the one-click box only, and the docs say so.
- Should the administrator also find a person by the email of a sign-in (`GET
  /api/admin/accounts?email=`), besides `@<handle>` and the account id the person reads in Profile?
  Default: no; the person hands over the id.
