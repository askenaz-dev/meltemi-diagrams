## Context

`cloud-projects` admits the owner only: every route checks `owner_sub`, the room receives the
role `owner`. The page shares the anonymous project through `#p=` links that carry the files;
the catalog build (`buildCatalog`) is host-neutral and the page already produces catalogs as an
export. The session cookie is shared by every host under `meltemi.dev` and those hosts are one
site, so user-authored HTML must live elsewhere (decision 0042).

## Goals / Non-Goals

**Goals:**

- One permission model, resolved in one place, used by every route and the room.
- A link anyone can open, with nothing to install and nothing to sign in to, that shows the
  diagrams and plays the stories.
- Publications as the catalog people already know, on a domain with no cookie and no API.
- Nothing shared by accident: new projects are private; the owner manages sharing.

**Non-Goals:**

- Presence; the command line; comments; organisations.

## Decisions

### The permission matrix

| Project | Anonymous | Signed in, not a member | Member |
| --- | --- | --- | --- |
| `private` | none | none | `viewer` or `editor` as given |
| link `view` | `viewer` | `viewer` | as given (never less than `viewer`) |
| link `edit` | `viewer` | `editor` | as given (never less than `editor`) |

The owner is always `owner`. `src/access.ts` exports `access(project, principal): "owner" |
"editor" | "viewer" | undefined`; a route states the role it needs (`read` = viewer, `write` =
editor, `manage` = owner):

| Needs | Routes |
| --- | --- |
| `manage` (owner) | `DELETE /api/projects/:id`; `PATCH /api/projects/:id` (name, description); `PATCH …/sharing`; members and invitations (`POST …/members`, `PATCH`/`DELETE …/members/:sub`, `GET`/`DELETE …/invitations`); `PUT`/`DELETE …/publish` |
| `write` (editor) | `PUT …/files`; `PUT`/`DELETE …/binaries/<path>`; `PUT …/thumbnail`; `POST …/versions`; `POST …/versions/:n/restore` |
| `read` (viewer; anonymous included on a link) | `GET /api/projects/:id` (metadata); `GET …/files` (the snapshot); `GET`/`HEAD …/blobs/<hash>`; `GET …/versions`, `…/versions/:n`; `GET …/thumbnail`; `GET …/sharing`; the room as viewer |

`POST …/duplicate` needs `read` and creates in the caller's account; `DELETE …/members/me`
needs a membership; `PATCH /api/account { handle }` needs a cookie principal; the admin routes
need a cookie principal listed in `ADMIN_SUBS`. When the role falls short the answer is, in this
order: no access at all → `404 project.not-found`, so a private project does not reveal that it
exists; an anonymous principal on a route needing more than the link gives, when the link would
give a signed-in person enough (a `write` route on an `edit` link) → `401 auth.required`, so the
page offers sign-in; any other insufficient role → `403 access.denied`. The room receives the
resolved role in the upgrade's internal headers; a viewer's update closes the socket
(`cloud-document`).

### Members and invitations

```
members      (project_id, sub, role, added_at)                      primary key (project_id, sub)
invitations  (id, project_id, email, role, token, created_by, created_at, accepted_at NULL)
```

`POST /api/projects/:id/members { email, role }` records an invitation with a 128-bit token
and answers it with its link `<origin>/p/<id>?invite=<token>`; it does not send mail (the
owner sends the link or the person signs in with that email). Resolution: at `GET
/api/session`, when the principal's `email_verified` is true, every pending invitation for that
email becomes a membership (`accepted_at` set); `POST /api/invitations/:token/accept` does the
same for the signed-in person whatever their email (the link is the proof). An invitation
expires after thirty days. The owner may change a member's role, remove a member or revoke an
invitation; a member may leave (`DELETE /api/projects/:id/members/me`). Members see the project
in `GET /api/projects` with their role.

Invitations are the owner's: tokens and links are returned only to the owner (`POST
…/members`, `GET …/invitations`), and `GET …/invitations` answers `403 access.denied` to
anyone else; `GET …/sharing` answers the full state to the owner and only `{ linkAccess, role }`
to others, with `members` (names and pictures, never emails) added for members and nothing of
it for link-only viewers, so a `view` link never yields an invitation an editor could be made
from. A project holds at most 50 members plus pending invitations (`413 quota.members`).

Alternative: send invitation mail. A mail sender is a dependency and a deliverability problem
the family does not have yet; the identity service already verifies emails, so matching at
sign-in covers "invite by email", and the link covers the rest.

### Viewing by link

The Worker answers `/p/<id>` with a 302 to `/?project=<id>`, keeping the query (`?invite=`
included); the project's link stays `<origin>/p/<id>`. The page reads `project` and `invite`
from `location.search`, keeps the address as it is, asks `GET /api/projects/:id` (which answers
for anyone the link admits) and opens in **view mode** when the role is `viewer`, or in the
normal mode when it is `editor` or `owner`. View mode is enforced at every point that edits:
`CodePane.setReadOnly(true)` sets `readonly` on the text area and makes `newline`, `indent`,
`acceptCompletion`, `applyFix`, `openFixes`, `openRename` and the format branch (Shift+Alt+F)
return early (hover and the completion list stay, for reading); `Playground` guards
`applyEdits`, `format`, `rename`, `newFile`, `renameFile`, `deleteFile` and `openLocal` in view
mode; the binding never sends an update when the role is `viewer`; the canvas receives
`readOnly` through the `settings` host message (`CanvasSettings.readOnly`, `canvas-package`).
The header offers "Make a copy" and, signed in with an account, "Save a copy to my projects";
exports, stories and effects work as always. Anonymous viewers load the files once
(`GET …/files`) and see a "reload to see changes" hint when the page has been open for more
than five minutes; signed-in viewers connect to the room as viewers and see changes live. An
`invite` query accepts the invitation first.

Alternative: serving `index.html` under `/p/<id>`. Every relative URL of the page
(`playground.js`, `assets/…`, `templates.json`) would resolve under `/p/`, and the page's
`base-uri 'none'` forbids a `<base>` that would fix them; a redirect costs one round trip and
keeps one page at one address. Alternative: a separate viewer page. The playground already
draws, plays and exports; one page with a mode is less to maintain.

### The share dialog

For a cloud project the header's share button opens `src/cloud/share.ts`: the link level as
three radio buttons with one sentence each, the project's link with copy, the members with
their roles (role menus and remove for the owner), "Invite" with an email field and a role,
pending invitations with copy and revoke, "Leave" for members. Non-owners see the link, their
own role and, as members, the member list (names and pictures) and "Leave"; invitations and
their links never reach them. The anonymous project's dialog is today's `#p=` dialog.

### Publishing

```
users.handle   [a-z0-9-]{3,30}, unique, chosen at the first publication (created by 0003_sharing.sql)
publications   (project_id, handle, slug, published_at, bytes)   unique (handle, slug)
takedowns      (handle, slug, by_sub, reason, at)
```

`PUT /api/projects/:id/publish { slug, html }` (owner; slug `[a-z0-9-]{1,60}`; HTML at most
16 MiB, `413 publish.too-large`; at most 10 publications per project per hour, `429
publish.rate`): stores `published/<handle>/<slug>/index.html` in R2 and the row, and answers
the public address. `DELETE …/publish` removes both. The page builds the HTML with
`buildCatalog` over the project's files, exactly as the catalog export, in
`src/cloud/publish.ts`, which also asks for the handle the first time (`PATCH /api/account
{ handle }`, cookie principal; `400 handle.invalid`, `409 handle.taken`; `409 handle.locked`
while a publication exists, so a handle cannot change under a published address).

Serving: the publish host is a second, minimal Worker, `packages/cloud/src/publish.ts`, with
its own `wrangler.publish.jsonc` (R2 binding `BLOBS`, D1 binding `DB`, no assets, no other
binding) bound to `PUBLISH_HOST` as a Workers Custom Domain. It serves only
`/<handle>/<slug>/` (and `index.html` under it) from R2, for a `publications` row that exists,
with `Content-Type: text/html; charset=utf-8`, `Cache-Control: public, max-age=300`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; it never sets a cookie,
never answers an API route, and answers 404 to everything else (`/`, `/playground.js`, the
assets, `/api/*`). The catalog's own policy (its `<meta>`) governs the page. The main Worker
(`run_worker_first: true`, dispatching on `Host`, `cloud-accounts`) never serves the publish
host; in development (`DEV`) it serves the same content under `/_published/<handle>/<slug>/`
on its own origin so the suite can check it; production never does.

Takedown: `DELETE /api/admin/publications/<handle>/<slug>` for a cookie principal in
`ADMIN_SUBS` removes a publication and records `takedowns (handle, slug, by_sub, reason, at)`;
the project's owner sees the publication as removed by the service.

Alternative: serving the publish host from the main Worker's handler by `Host`. The Worker that
holds the cookie, the API and the static assets would answer on the user-content domain, and
one missed branch serves the app or a cookie there; a Worker with two bindings and no assets
cannot. Alternative: rendering publications from the project's data in a sandbox instead of
serving uploaded HTML. A second renderer; the catalog build is the renderer, and the separate
domain isolates it.

### Open decisions

1. **The publish host.** Alternatives: a second domain the owner registers (`meltemi.page` or
   similar); a free `*.workers.dev` host. Recommended: a registered domain, so publications
   have stable addresses people can print; `workers.dev` works as a stopgap in the delivery
   change if the registration lags.
2. **Viewers live or snapshot.** Alternatives: live for all; snapshot for all; live for
   signed-in. Recommended: live for signed-in viewers (they hold quota), snapshot for anonymous
   ones with a reload hint.
3. **Who manages sharing.** Alternatives: owner only; editors too. Recommended: owner only; an
   editor who could open a project to the world is a surprise.

## Risks / Trade-offs

- **Email matching trusts the provider's verification**, as the identity service does; the
  invitation link covers people whose email differs or is unverified.
- **Public links are unguessable, not secret**: anyone the holder forwards them to can view;
  that is the owner's choice when they pick `view` or `edit`.
- **Published HTML is user content.** It is on its own domain, size-capped, rate-limited and
  removable; the catalog build makes it, so it carries no script the page did not write, but
  the service does not verify that and the isolation does not depend on it.
