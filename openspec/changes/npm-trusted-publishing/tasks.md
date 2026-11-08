## 1. Implementation

- [x] 1.1 Read npm 11.21.1's `lib/utils/oidc.js`, `lib/commands/publish.js` and
  `lib/commands/dist-tag.js`: both commands try the exchange first and keep the configured token
  when the registry refuses it. Pin the newest 11 release at least two weeks old.
- [x] 1.2 Run the `npm` job in environment `npm` and install `npm@11.21.1` with no credential;
  keep `NPM_TOKEN` only in the publish step.
- [x] 1.3 In `scripts/publish-npm.mjs`, replace the token requirement with `credentialProblem`
  (OIDC identity or token, npm that moves dist-tags through OIDC), return the published packages and
  report `publisherOf` each one.
- [x] 1.4 Guard the job in `workflows.test.ts` and the script in `publication.test.ts`.
- [x] 1.5 Describe the registrations and the token's retirement in `RELEASING.md` and the launch
  checklist.
- [x] 1.6 Create GitHub environment `npm` with one **Branch: main** deployment rule, as `open-vsx`.
- [ ] 1.7 `openspec validate npm-trusted-publishing --strict`, `pnpm typecheck`, `pnpm lint`,
  `pnpm test`; open the pull request and wait for green CI.

## 2. Owner

- [ ] 2.1 Register the trusted publisher of each of the twenty packages on npmjs.com as
  `RELEASING.md` describes, allowing **npm publish** and **npm dist-tag**.
- [ ] 2.2 Within two days, a release whose npm job reports twenty packages through trusted
  publishing.
- [ ] 2.3 Choose **Require two-factor authentication and disallow tokens** on each package, and
  revoke the token on npmjs.com.
- [ ] 2.4 Remove `NPM_TOKEN` from Meltemi Web's Terraform and `infrastructure` environment, and
  remove its fallback from the publish step; the next release publishes through OIDC alone.

## 3. Archive

- [ ] 3.1 After 2.4, `openspec archive npm-trusted-publishing --yes`, write the spec's Purpose,
  and check task 7.4 of `delivery`.

## Evidence

- 2026-11-08: npm 11.21.1 (published 2026-10-15) calls the OIDC exchange in `publish` and in
  `dist-tag add`/`rm`, replaces the configured token only when the registry answers with one, and
  otherwise keeps it. Trusted-published versions read `GitHub Actions <npm-oidc-no-reply@github.com>`
  as `_npmUser` (checked on `vite`, `zod`, `prettier`); 1.11.33 reads the token's owner.
- Environment `npm` created through the API with one `main` branch rule, the same policy as
  `open-vsx`; read back with `deployment-branch-policies`.
- `openspec validate npm-trusted-publishing --strict`, `pnpm typecheck` and `pnpm lint` passed.
  Focused delivery tests: 83 passed. `pnpm test`: 11,374 passed and one skipped; the four failures
  of `local-operations.test.ts` came from running it in Git Bash, whose GNU `tar` reads `C:` as a
  host, and the file passes 8 of 8 from PowerShell with Windows' `tar`, as CI runs it.
