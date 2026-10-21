# Launch checklist

What only the product owner can do before and at the launch, and the document that prepares each
step. Everything else is done and verified in the repository
([quality results](../quality/results.md)). The delivery is
[decision 0046](../decisions/0046-delivery.md): the infrastructure is Terraform in the Meltemi Web
repository, and everything runs as GitHub pipelines.

## Before publishing

- [ ] **Trademark review.** Search the name "Meltemi Diagrams" and the `.meltemi` extension in the
      markets of the launch, and have the name reviewed legally
      ([decision 0009](../decisions/0009-product-name.md)).
- [x] **Repository.** `https://github.com/askenaz-dev/meltemi-diagrams`, named in every manifest,
      README and document (the release test checks it); created by the family's Terraform, then
      the first push ([releasing](../../RELEASING.md)).
- [ ] **Accounts.** The npm organisation `meltemi` (it exists), the `meltemi` publisher on the
      Visual Studio Marketplace and the `meltemi` namespace on Open VSX, with two-factor
      authentication; their tokens go to the `infrastructure` environment of
      `askenaz-dev/meltemi-web`, and Terraform places them here as `NPM_TOKEN`, `VSCE_PAT` and
      `OVSX_PAT` ([releasing](../../RELEASING.md#the-tokens)).
- [ ] **Security reports.** Turn on private vulnerability reporting in the repository's security
      settings ([security policy](../../SECURITY.md)); no Terraform resource exists for it.
- [ ] **Slide applications.** Run `pnpm verification:kit kit`, check the files in PowerPoint,
      Keynote and Google Slides, and fill the table of
      [office applications](../verification/office-apps.md).
- [ ] **Final verification.** On the reference machine: `pnpm acceptance`, `pnpm conformance`,
      `pnpm release:check` and `pnpm vscode:test`, all passing ([releasing](../../RELEASING.md)).

## The hosted service

- [ ] **The family's infrastructure applied.** The Meltemi Web repository's `delivery` change: the
      zones `meltemi.dev` and `meltemi.page` on the Cloudflare account, the Workers
      `meltemi-diagrams-cloud` and `meltemi-diagrams-publish`, the D1 database `meltemi-diagrams`,
      the R2 bucket `meltemi-diagrams-blobs`, the Secrets Store with `FORMS_SECRET`,
      `IDENTITY_EVENTS_SECRET` and `ADMIN_SUBS`, and this repository's `production` environment.
- [ ] **The identity package on npm.** `@meltemi/identity` published; `packages/cloud` depends on it
      instead of the local link ([cloud](../cloud.md#the-identity-package)).
- [ ] **The first deployment.** `deploy.yml` green; then the family's Terraform attaches
      `diagrams.meltemi.dev` and `meltemi.page` ([cloud](../cloud.md#deploying)).
- [ ] **Smoke test.** Sign in at `https://diagrams.meltemi.dev`, `mdg login`, push a project, open
      its link in another browser, edit it from two browsers, publish a page to
      `https://meltemi.page/<handle>/<page>/`, take it down as administrator (after your `sub` is in
      `ADMIN_SUBS`), delete the project.

## Publishing

- [ ] Tag `v1.9.0` and watch the release workflow: the npm packages with provenance, the extension
      on both marketplaces, the GitHub release ([releasing](../../RELEASING.md)).
- [x] **Host the playground.** It is `https://diagrams.meltemi.dev`, deployed from `main`
      ([playground](../playground.md)); the README and the announcement name it.
- [ ] Publish the [announcement](announcement.md) with the links of the packages, the extension
      and the playground.

## After publishing

- [ ] **Trusted publishing.** Configure it per package on npm and retire the npm token
      ([releasing](../../RELEASING.md#the-tokens)).
- [ ] **Pilot.** Recruit five to eight participants and run the [pilot](../pilot/protocol.md);
      summarise it with `pnpm pilot:summary`.
- [ ] **PlantUML corpus.** Add samples from the existing PlantUML tool to `corpus/import/` when
      they are available ([roadmap](../roadmap-1.0.md)).
- [ ] **Triage.** Defects that lose data or draw wrong relations first, then what pilots need for
      a second delivery ([governance](../../GOVERNANCE.md)).
