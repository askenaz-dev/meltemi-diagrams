## 1. Delivery contract and implementation

- [x] 1.1 Record the owner-authorized proposal, design and scenarios before implementation.
- [x] 1.2 Implement CI validation and deterministic source-ordered version reservation with Git fixtures.
- [x] 1.3 Gate deployment and releases on CI, separate publishing jobs and add OIDC and final summary.
- [x] 1.4 Update release guidance, dependency pin and lockfile.

## 2. Verification

- [x] 2.1 Run workflow/script tests, typecheck, lint, package tests and relevant build checks.
- [x] 2.2 Review the diff and record exact verification and remaining external setup here.
- [ ] 2.3 Owner merges and observes the first CI, deployment and release; verify all four public channels.
- [x] 2.4 Preserve authentic npm/Sigstore runner coordinates after the first production validation
      exposed a source-ref mismatch; verify deterministic package source metadata and recovery.
- [x] 2.5 Preserve Terraform's observability settings in both Worker deployment configurations
      and verify configuration generation, publish-host isolation and Wrangler schema acceptance.

## Production validation correction on 2026-11-03

Meltemi Web's first production npm run exposed E422: substituting a tag in GITHUB_REF disagrees
with the runner identity in the Sigstore certificate. The same Diagrams implementation now keeps
all signing coordinates unchanged and records product source separately. A source capability
marker prevents a recovery of older source from adding new metadata or changing its artifact
bytes. Focused workflow, versioning, publication and delivery-script tests: 44 passed. Focused
ESLint and Prettier passed. The updated PR's CI and real channel publication remain part of 2.3.

Both Wrangler configurations now retain the observability settings already declared by Terraform.
Configuration generation, cloud configuration, publish-host isolation and browser helpers: 174
tests passed. Both Workers passed Wrangler 4.151.3 `deploy --dry-run`; no deployment mutation ran.
Focused ESLint, Prettier and `git diff --check` passed.

## Verification on 2026-11-01

- `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`: passed.
- Full `pnpm test`: 9,901 passed, one skipped, one documentation-link failure. The two obsolete
  release-guide anchors were corrected; the focused rerun of docs, workflow, authorization,
  versioning, publication and existing delivery-script tests passed all 125 tests in five files.
- `pnpm licenses:inventory --check`: current, 40 packages.
- `pnpm vscode:package`: passed, 416 files, 11.56 MB, package contents verified with VSCE 4.1.0.
- `vsce publish --help`: confirms native `--oidc` and `--skip-duplicate`.
- VSIX packaged twice with SOURCE_DATE_EPOCH from source commit and a one-hour change to the
  generated extension bundle's mtime: identical SHA-256
  `71efc0f398dd1ebbd33f7e3e27f2f13e9f6a9dad7c16a533d2bed49272152d30`.
- `openspec validate automatic-main-releases --strict`: passed. Source-epoch behavior is also
  guarded structurally by the workflow suite; the release manifest carries no generated timestamp.
- No push, merge or publication performed in this implementation step. Marketplace policy,
  Open VSX agreement/namespace/token and production workflow execution remain external verification.
