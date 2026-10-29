# 0061. Exports without the Meltemi branding are an entitlement an administrator grants

Status: accepted (unbranded-exports change, 28 October 2026). Extends decisions 0007 and 0042.

## Context

The owner asked on 27 October 2026 for exports without the Meltemi branding for certain diagrams,
offered to a list of users he selects. The branding is the theme's frame (decision 0007): the strip
at the foot of the sheet with the mark, the wordmark and the diagram's title, drawn by the
technical and stage themes and left out by `frame none` and the editorial themes. The engine is
MIT and the language lets anyone write `frame none`, so nothing can withhold an unbranded picture;
what the owner can give selected people is the one-click path in the hosted page, without editing
the file's theme. The service already had administrators (`ADMIN_SUBS`, decision 0042) and one
administrator action, the takedown, called from the page's own origin with the session cookie.

## Decision

- **A request field, applied as a layout override.** `ExportRequest.branding` (`"theme"` when left
  out, or `"none"`) reaches every layout an export makes (the diagram, a story's views, the
  player's views, a video's frames) as `LayoutOptions.frame: "none"`, which `layoutDiagram` applies
  after the theme resolves: the palette, fonts, sizes and sketch stay, and only the strip and its
  gradient go. `CatalogOptions.frame` does the same for a catalog's pictures, while its footer and
  generator stay. A request without the field draws what it drew before, so the CLI, the profiles,
  the thumbnails and the published catalogs are unchanged.
- **An entitlement per account.** Migration 0005 adds `unbranded_exports` (0 or 1),
  `unbranded_exports_by` and `unbranded_exports_at` to `users`; the store sets and revokes it in one
  statement, lists the entitled accounts and finds a person by handle. `GET /api/session` answers
  `user.entitlements.unbranded`: the row's flag, or true for every administrator, so the owner
  needs no grant.
- **Three administrators' routes, under the takedown's rules.** `GET /api/admin/entitlements`
  lists the entitled accounts, the earliest grant first; `GET` and `PUT
/api/admin/accounts/<account>/entitlements` read and set one, `<account>` being the account id or
  `@<handle>`, recording who and when. A cookie of a listed person on the page's origin, the
  `Origin` rule first, and `404 not-found` for everybody else and for an API token. The owner calls
  them from the browser's console, as `docs/cloud.md` shows, with the takedown's call beside them.
- **The page.** The session's entitlement is read as true only when the answer says exactly that.
  The export dialog builds **Export without the Meltemi branding**, with a hint, under the Theme
  field for an entitled cookie session only, unchecked at each opening; checked, the request says
  `branding: "none"`, the message ends with "Without the Meltemi branding.", and the dialog's
  catalog button builds its pictures without the strip. Profile shows every person their account
  id with Copy, and an entitled person a heading that says what the account may do.
- **The person's entitlement, not the project's.** An entitled viewer of a shared project exports
  it without the strip; a plain editor of an entitled owner's project does not. Thumbnails keep the
  theme.

## Alternatives considered

- **A Worker variable listing the entitled accounts**: every grant would be a change of a secret
  through the family's Terraform and a redeploy, nobody could be added from the page, and nothing
  would record when.
- **A claim of the identity service**: a contract change in Meltemi Web and a new
  `@meltemi/identity` before this ships, and a product's flag in the family's token.
- **The dialog writing a theme block with `frame none`**: a file change for a visual choice, which
  the code pane and Git would show and the thumbnails and the CLI would follow.
- **A language option or a CLI flag**: the engine cannot enforce a gate, and the language already
  has `frame none` for anyone.
- **An Administration section of the account panel**: the better product for a second
  administrator; with one, the console and the documented calls do it, and the section stays
  possible on the same routes.
- **Keeping the title (`mark none` plus `brand ""`)**: a hairline with a lone title at the foot of
  the sheet looks like a mistake; the neutral path the docs teach is `frame none`.

## Consequences

- New public surface: `ExportRequest.branding`, `LayoutOptions.frame`, `CatalogOptions.frame`,
  `layoutIn`'s `frame`, the session answer's `user.entitlements`, the three routes, migration 0005
  and the store's `setUnbrandedExports`, `entitledUsers` and `userByHandle`.
- The deploy applies migration 0005 to the production database: three `ADD COLUMN`s with defaults,
  `0` and `NULL` for every row.
- A grant shows at the person's next load of the page, which reads the session once.
- The control is a convenience, not a lock: a theme with `frame none` exports without the brand for
  anybody, and the docs say so.
