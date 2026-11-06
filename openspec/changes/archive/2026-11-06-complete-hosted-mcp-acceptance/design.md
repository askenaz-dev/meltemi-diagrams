## Context

Two dedicated accounts supply separate `mdg_` tokens in each hosted environment. Token values
are bootstrapped upstream in Web/infrastructure, then distributed by the existing Terraform
resource. CI must not operate with personal owner credentials.

## Decisions

1. Keep product OAuth untouched. A privileged setup process uses the existing D1 adapter and
   official OAuth provider to create only run-owned clients/grants for the verified test account.
   Authorization codes are exchanged on the real public token endpoint for narrow and refresh
   tests. Expired and wrong-resource credentials are preprovisioned with the same provider in
   isolated fixture processes. Evidence calls them fixtures, never interactive consent.
2. Keep Cloudflare authority outside the acceptance process. Setup validates environment,
   database, origin and dedicated account identity; its fixture manifest is ephemeral, private,
   outside uploaded results, and cleaned on success or failure. Cleanup names exact run-owned
   clients/grants and confirms no residual records. No global signing key or browser cookie is used.
3. Hosted delivery requires 34 passed, zero failed and zero skipped. Anonymous/local diagnostic
   modes retain honest skips; missing CI prerequisites fail the hosted completeness gate.
4. Redact every fixture credential before assertions or diagnostic output. Results only expose
   booleans, criterion outcomes and sanitized fixture cleanup counts.

## Failure boundaries verified during implementation

- Bind dedicated accounts with reviewed subject fingerprints, keeping actual account IDs and
  email addresses out of public sources. Rotation for the same identity preserves the boundary.
- Sign the write-ahead journal with the existing deployment credential and validate raw stored
  ownership before any delete, including expired grants. A surviving registration receipt without
  its signed journal fails closed. Recover a lost public-registration response only by the exact
  run nonce/name, expected metadata and absence of grants.
- Require a private protected Windows parent ACL. Set the current user as owner only on a newly
  created empty file held open, before writing credentials; never change existing file ownership.
- Guard results, log and cleanup-summary outputs against both private inputs by lexical path,
  resolved aliases and file identity before writes. Invalid configurations preserve recovery
  material and produce fixed sanitized failure phases instead of remote error bodies.

## Modules and interfaces

`packages/acceptance/src/mcp`: fixture schema/setup/cleanup, remote D1 transport, steps 27/28,
strict completeness, and redaction. Reuse `packages/cloud/src/oauth/{provider,store}.ts` without
changing their runtime behavior. `.github/workflows/deploy.yml` orchestrates privileged setup,
unprivileged acceptance and unconditional cleanup. `docs/quality/mcp-acceptance.md` describes
prerequisites, evidence and consent limits.

## Alternatives and risks

Storing browser sessions in CI introduces renewal and cookie exposure. A new token-exchange
API would expand product authority merely for testing. Waiting one hour for expiry is slow.
Preprovisioning bounded records using deployment authority avoids those changes, but requires
strict ownership, exact cleanup and explicit fixture provenance. Refresh reuse assertions follow
the provider's documented grace behavior. No unresolved irreversible design choices remain.
