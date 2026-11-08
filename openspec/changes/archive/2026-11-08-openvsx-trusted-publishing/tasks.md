## Implementation

- [x] 1. Verify the official registration requirements, published CLI pin and duplicate behavior.
- [x] 2. Add the constrained Open VSX OIDC job and document its registration and recovery.
- [x] 3. Add workflow guards and validate focused delivery tests.
- [x] 4. Run typecheck, lint and the full unit suite.
- [x] 5. Open a pull request and verify green CI before integration.

## Production verification

- [x] 6. Confirm the owner configured the main-only environment and matching Open VSX registration.
- [x] 7. After merge authorization, verify the automatic release's OIDC publication and public VSIX.

## First version of a new or removed extension

- [x] 8. Ask the registry whether the VSIX's extension exists; publish its first version with
  `OVSX_PAT` in a separate step, and through OIDC otherwise; guard both in `workflows.test.ts`.
- [x] 9. Register the trusted publisher after that first version and verify that the next version
  publishes through OIDC.

## Evidence

- `npx --yes ovsx@1.3.0 publish --help` exposes both required flags; its published source obtains
  OIDC before the duplicate catch. Independent review confirmed failures propagate.
- `workflows.test.ts` and `automatic-release.test.ts`: 33 passing tests.
- `openspec validate openvsx-trusted-publishing --strict`, `pnpm typecheck` and `pnpm lint` passed.
- `pnpm test`: 333 files passed, 9936 tests passed and one skipped.
- The owner confirmed the saved Open VSX registration and GitHub's single `main` branch rule;
  independent read-only API review confirmed the environment policy.
- 2026-11-04, extension `meltemi.meltemi-diagrams-vscode`: the registry answered 404, and release
  1.11.5 published its first version with `OVSX_PAT` after the token was renewed in Meltemi Web's
  `infrastructure` environment. The trusted publisher was then registered for `askenaz-dev`,
  `meltemi-diagrams`, `release.yml` and `open-vsx`, and 1.11.4 published through OIDC
  (`publishedWithTrustedPublishing: true`). Version 1.11.3 cannot return: Open VSX keeps a removed
  version's identity reserved.

Do not archive until the applicable gates pass. The OIDC step of the new job is verified by the
first release after this registration.

## Integration

The pull request was integrated as `3f332af` after green CI. Main CI run 41760564660, release
run 41761706518 and deploy run 41761706536 passed, and Open VSX served 1.10.22 with
`publishedWithTrustedPublishing: true`. Those runs belong to the repository before its recreation
on 2026-11-04. The gates above passed, so the change is archived.
