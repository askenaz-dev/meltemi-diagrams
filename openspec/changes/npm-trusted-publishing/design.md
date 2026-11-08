# Design: npm trusted publishing

## Context

The `npm` job of `release.yml` publishes twenty tarballs from the checked artifact under
`release-<version>`, then moves `latest` with `npm dist-tag add` where `canPromote` allows it. It
already has `id-token: write` for provenance and reads `NPM_TOKEN` through `NODE_AUTH_TOKEN`.
`scripts/publish-npm.mjs` refuses to start without that token.

npm's trusted publishing exchanges a GitHub OIDC identity for a short-lived token scoped to one
package. Until 2026-09-30 it covered `npm publish` only; a registration can now also allow
`npm dist-tag`, used by npm 11.21.0 and later (12.2.0 on the 12 line). The registration is per
package, needs the package to exist and expires unless a publication uses it within two days.
`npm trust github` registers from the command line but cannot grant the dist-tag permission.

## Decisions

### 1. npm 11.21.1, installed by the job

Node 24's bundled npm (11.12.1 on the reference machine) exchanges OIDC for `publish` but not for
`dist-tag`. The job installs `npm@11.21.1`, the newest 11 release at least two weeks old, rather
than moving to npm 12, which the rest of the toolchain does not use. The script refuses an npm that
cannot move dist-tags through OIDC: with the token gone, an older npm would publish and then fail
to move `latest`, leaving a release half promoted.

The install step sets `NODE_AUTH_TOKEN` empty, so the `.npmrc` that `setup-node` writes sends no
credential (and never its placeholder) while fetching npm itself.

### 2. The token as npm's own fallback, not a separate step

npm 11.21.1 (`lib/utils/oidc.js`) tries the OIDC exchange before every `publish` and `dist-tag`,
sets the exchanged token over any configured one when the registry accepts it, and keeps the
configured token silently when it refuses. Keeping `NPM_TOKEN` in the publish step therefore lets
the owner register packages one by one without breaking a release, and a registered package never
uses the token. Open VSX needs a separate token step because `ovsx` prefers a PAT over OIDC; npm
does not, so one step is enough.

### 3. A report of who published, from the registry

The registry records `GitHub Actions <npm-oidc-no-reply@github.com>` as the publisher of a version
published through a trusted publisher, and the token's owner otherwise. After publishing, the
script reads `_npmUser` of each new version and prints the counts, with a notice naming packages
still on the token. A read the registry cannot answer yet counts as unknown and never fails the
channel: the report tells when the token can be retired and gates nothing. Dist-tag moves leave no
such record; once tokens are disallowed, a `dist-tag` refused by the registry fails the channel as
any other npm error does.

### 4. Environment `npm`, restricted to main

Like `open-vsx`, a registration naming an environment refuses any job outside it, and the
environment's deployment branch policy admits `main` only. Without an environment, any ref running
`release.yml` would be trusted. The environment holds no secrets; `NPM_TOKEN` stays a repository
secret placed by Meltemi Web's Terraform until it is retired.

## Risks

- **Registrations expire.** Saving a registration starts its two-day window, so a release must
  follow the owner's registrations; any merge to `main` makes one.
- **A package is missed.** The notice names it; the token keeps it publishing until tokens are
  disallowed, which waits for a report of twenty through trusted publishing.
- **Registry lag.** A version may not be readable right after publishing; it is counted as unknown,
  and the next release or `npm view <name>@<version> _npmUser` settles it.

## Migration

1. Merge this change; releases keep publishing with the token.
2. The owner registers the twenty packages, then a release runs within two days.
3. When a release reports twenty through trusted publishing, the owner disallows tokens on each
   package, `NPM_TOKEN` leaves Meltemi Web's Terraform, and the owner revokes it on npmjs.com.
