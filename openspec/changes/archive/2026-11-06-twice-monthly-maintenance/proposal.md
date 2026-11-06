# Twice-monthly hosted maintenance

## Why

The owner requested a longer interval between the hosted service's maintenance runs to reduce
background operations. The current weekly schedule runs even when staging is unused. This is a
post-1.0 hosted-service change outside the roadmap.

## What changes

- Schedule hosted maintenance at 03:00 UTC on the first and fifteenth of each month.
- Describe this as twice monthly: the interval is 14–17 days, rather than exactly fourteen days.
- Keep the collection's seven-day eligibility threshold and all reference/expiry checks.
- Align the scheduler assertion and the English/Spanish hosted-service documentation.

## Capabilities

### Modified

- `cloud-projects`: update the scheduled collection cadence in usage and storage quota.

## Impact

The shared hosted Worker configuration applies the same cadence to production and staging.
There are 24 scheduled invocations per environment per year. Unreferenced blobs and expired
records can remain physically stored longer between runs. Expired authorization entries remain
unusable. Local Docker's own launcher is unaffected.

## Non-goals

Suspending or provisioning staging on demand belongs to the delivery change. This change does
not modify that lifecycle or the documentation AI controls.
