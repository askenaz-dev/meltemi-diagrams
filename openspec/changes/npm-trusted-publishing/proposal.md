# npm trusted publishing

## Why

The twenty npm packages are the last channel that publishes with a long-lived secret,
`NPM_TOKEN`. Anyone holding it can publish under `@meltemi`, and npm limits how long a token with
write rights lives, so it has to be renewed. npm now trusts a GitHub workflow's OIDC identity for
`npm publish` and, since 2026-09-30 and npm 11.21.0, for `npm dist-tag` too. That covers the whole
npm channel, including the step that moves `latest`, so the token can go.

This is the follow-up the `delivery` change left to the owner as its task 7.4. Marketplace and
Open VSX already publish this way.

## What changes

- The `npm` release job runs in a GitHub environment `npm`, restricted to `main`, with
  `id-token: write`, and installs npm 11.21.1 before publishing.
- `scripts/publish-npm.mjs` accepts the job's OIDC identity or `NPM_TOKEN`, refuses an npm that
  cannot move dist-tags through OIDC, and reports how many packages each credential published.
- While packages are being registered the token stays as npm's own fallback. npm tries OIDC first,
  so a registered package never uses it.
- `RELEASING.md` describes the registration of each package and the retirement of the token.

## Capabilities

- `npm-trusted-publishing`: constrained workflow identity for npm publication and dist-tags.

## Non-goals

Version allocation, the checked artifact, the `release-<version>` tag and the rule that `latest`
never goes back stay as `automatic-main-releases` defines them. Provenance keeps the runner's
identity as that capability requires. Removing `NPM_TOKEN` from Meltemi Web's Terraform is a
change there, made after the owner's registrations are verified.

## Authorization

The owner asked on 2026-11-08 for the pull request that lets npm publish without the token. The
owner registers the trusted publisher of each package and chooses when tokens are disallowed.
