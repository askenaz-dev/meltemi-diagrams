# Hosted maintenance cadence

## Decision

Set `packages/cloud/wrangler.jsonc` to `0 3 1,15 * *`. `scripts/deploy-config.mjs` already copies
the cron configuration unchanged into both hosted environments. No scheduler state, new binding,
dependency or public interface is needed.

A calendar schedule is deliberately used instead of `*/14` in the day-of-month field, which
would reset at month boundaries and could produce runs only a few days apart. Exactly fourteen
days would require additional scheduling logic; the owner's example allows a roughly fortnightly
interval. The chosen dates yield 14–17 days between runs and 24 runs per year.

## Modules and behavior

The scheduled handler continues to call `maintainState` once per platform trigger. The seven-day
blob threshold, bounded scan/delete batches, OAuth expiration checks, idempotency retention and
failure propagation remain as implemented. Module comments use cadence-neutral wording except
where they describe the hosted scheduler explicitly. Documentation in `docs/cloud.md` and
`docs/web-app.md`, with their Spanish twins, names the hosted schedule accurately.

## Verification

Update the existing configuration assertion and scheduled-event fixtures, run collection,
expiration, materialization, deployment and documentation checks, and run the repository's
typecheck, lint and unit-test gates. Verify the generated production/staging configuration uses
the new expression. No deployment is performed from this side conversation.

## Consequences

Heavy maintenance operations occur less often. This is not a guarantee of lower total cost:
garbage can remain stored until the next run, and storage may cost more. A failure is retried by
the next scheduled run. Production and staging share the calendar policy; an on-demand staging
lifecycle remains a separate delivery concern.
