## Context

The portal publishes product documentation from releases. The source guides have accumulated
contributor instructions, benchmark reports and implementation details alongside valid public
contracts. The existing bilingual check covers headings and code, not semantic completeness.

## Decisions

1. Treat the 40 English/Spanish page pairs as an explicit audit inventory, including language,
   import and migration tracks. Record sources, findings and disposition for each page.
2. Use `mdg` for installed CLI examples. Retain package-manager examples that apply to a user's
   own SDK/CI project; move repository-only instructions to internal material.
3. Extract private Worker/database/room/deployment/test details from cloud and browser guides
   into `docs/internal/`, preserving useful internal references. Keep public API, protocol,
   security, quotas and diagnostic contracts in the user reference.
4. Preserve the recently improved AI entry points except for independently verified issues.
5. Keep performance reports versioned internally; user limitations belong to compatibility.

## Modules and interfaces

Only documentation and documentation checks change. The CLI, language, HTTP/MCP API and runtime
interfaces remain unchanged. Meltemi Web owns exclusion of internal documents and product-only
search in the portal.

## Validation

Run documentation links, bilingual heading/code parity and focused feature documentation tests,
then repository typecheck/lint and the full suite after coordinating machine load. Check selected
CLI examples using local fixtures, and name exactly which flows were executed. A source audit is
not a browser or provider end-to-end test.
