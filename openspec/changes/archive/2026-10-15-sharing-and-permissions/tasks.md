## 1. Permissions

- [x] 1.1 `migrations/0003_sharing.sql` (`projects.link_access`, `members`, `invitations`, `publications`, `takedowns (handle, slug, by_sub, reason, at)`, `users.handle` with its unique index, created here and not in `0001_accounts.sql`), store methods, conformance suite over both stores
- [x] 1.2 `src/access.ts` and the role each route needs (the table of the design); in this order `404` for no access, `401 auth.required` for an anonymous principal when the link would give a signed-in person enough, `403` for any other insufficient role; the room receives the role and refuses a viewer's update; tests of the matrix (nine cells), the refusals (an editor deleting is `403`, an anonymous push on a `private` project is `404`, on a `view` link `403` and on an `edit` link `401`; an editor restoring a version is allowed, restore being a `write` route) and the viewer's update
- [x] 1.3 Sharing routes: `GET/PATCH …/sharing` (the full state for the owner, `{ linkAccess, role }` for others, `members` with names and pictures for members), members (`POST` invitation with link, `PATCH` role, `DELETE` member, `DELETE …/members/me`), invitations (`GET` and `DELETE` for the owner, `403` to anyone else, `POST /api/invitations/:token/accept`), `413 quota.members` beyond 50 members plus pending invitations, resolution at `GET /api/session` with the handle in the answer, thirty-day expiry; tests including unverified emails, expired tokens, a viewer asking for the invitations and the fifty-first invitation

## 2. Viewing by link

- [x] 2.1 `packages/canvas`: `readOnly` in `CanvasSettings`, received through the `settings` host message and switchable at run time (`act()` drops actions, inline editing and the inspector's `commit` are no-ops, the `data-edit` hiding of story mode is reused; selection, zoom, pan, minimap, stories and effects stay); webview tests
- [x] 2.2 The page: `/p/<id>` answers a 302 to `/?project=<id>` keeping the query, the page reads `project` and `invite` from `location.search` and keeps the address, `GET /api/projects/:id` for the admitted, view mode (`CodePane.setReadOnly`, the `Playground` guards on `applyEdits`, `format`, `rename`, `newFile`, `renameFile`, `deleteFile` and `openLocal`, the binding silent as viewer, `readOnly` sent to the canvas, exports on), snapshot for anonymous with the reload hint, live for signed-in viewers, "Make a copy" and "Save a copy to my projects", `?invite=` acceptance, "not found" without detail; messages `en`/`es`; unit tests of the mode switches and of each guard

## 3. The share dialog

- [x] 3.1 `src/cloud/share.ts`: link level, link with copy, members and roles, invite by email with validation, pending invitations with links and revoke, leave; the owner edits, a non-owner sees the link, their role, as a member the member list and "Leave", never an invitation; the anonymous dialog untouched; unit tests with a fake client including the viewer's dialog

## 4. Publishing

- [x] 4.1 Handles (`PATCH /api/account`, validity, uniqueness, lock) and `PUT/DELETE …/publish` (owner, slug, size, rate, R2 object and row); tests
- [x] 4.2 The publish Worker `src/publish.ts` with `wrangler.publish.jsonc` (R2 binding `BLOBS`, D1 binding `DB`, no assets): only `/<handle>/<slug>/` and `index.html` under it, the headers, no cookie, no API, 404 elsewhere; the main Worker's `DEV`-only `/_published/` route; the takedown route for `ADMIN_SUBS` writing `takedowns`; tests including `GET /playground.js` on the publish host → 404 and `/_published/` absent without `DEV`
- [x] 4.3 `src/cloud/publish.ts`: build the catalog over the project's files (as the catalog export), ask for the handle the first time, publish, show the address, unpublish, show a takedown; unit tests with a fake client
- [x] 4.4 The cascade extended (memberships, invitations, publications, projects of a deleted owner); tests

## 5. Suites and documentation

- [x] 5.1 The cloud browser suite: a `view` link in an anonymous context (draws, plays, exports, refuses typing, no canvas plan), a `private` link says not found, make a copy, invite and accept in a second context, the share dialog as owner and as viewer (no invitation shown), publish and read the publication under `/_published/`
- [x] 5.2 `docs/cloud.md` (permissions and the role table, invitations, publishing, the publish Worker, takedown, the codes `access.denied`, `invite.invalid`, `quota.members`, `handle.invalid`, `handle.taken`, `handle.locked`, `publish.too-large`, `publish.rate`), `docs/playground.md` (sharing, viewing, publishing), `docs/es/` mirrors, decision 0042 cross-checked; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm vscode:test-webview`, `pnpm playground:test-browser`, `pnpm cloud:test-browser` green
