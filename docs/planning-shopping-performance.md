# Weekly-menu statement timeout

## Observed failure

After migration 23 completed successfully, the hosted `apply_meal_plans` request returned PostgreSQL `57014`, `canceling statement due to statement timeout`. The supplied week contains 21 meal slots and 42 personal portions, including vegetarian substitutions and both original and newly sourced recipes. This response establishes a server-side statement cancellation; it does not identify the precise nested SQL statement or exclude lock contention on the hosted project.

The separate `No API key found in request` response occurs before database execution. It cannot explain a database timeout on the same request. No key change is needed to fix this confirmed timeout.

## Changes

[Migration 24](../supabase/migrations/202611080024_planning_shopping_performance.sql) reduces work in the existing authenticated, atomic save path:

- Read previous plans only for the slots in the submitted batch, instead of aggregating every retained historical recipe snapshot into JSON.
- Evaluate the common-catalogue membership predicate once per SQL statement through an initplan. Its authorization condition is unchanged.
- Compute shopping expiry cutoffs by distinct date, rather than repeatedly for individual ingredient lines.
- Read upcoming contributions once when building shopping requirements.
- Compute one trusted shopping projection for automatic reconciliation, then reuse its quantities and fingerprint for deletion and upserts. The old path repeatedly recomputed requirements/fingerprints through nested wrappers and a correlated deletion query.

The private projection helpers are owned by `week_menu_executor`, use an empty search path and are not executable by `public`, `anon` or `authenticated`. No caller-provided session setting is trusted as a cache. Public entry points retain their signatures, household authorization and actor lock. Menu changes and shopping reconciliation still commit or roll back together. Manual additions, stable item keys, checked-state increase/decrease rules, revision checks, offline receipts, source references and historical records are preserved. No global timeout, RLS bypass, retry loop or environment variable is introduced.

The client maps a confirmed PostgreSQL statement timeout to an English/Spanish database-timeout notice rather than claiming a connectivity problem. It does not automatically repeat the write.

## Verification and limits

The synthetic integration fixture mirrors the reported seven-day, two-person recipe choices, budgets and vegetarian substitutions without copying personal identifiers. It tests an empty list and then a populated list. A local PostgreSQL/PGlite run measured about 1,000 ms before optimization and 194 ms after optimization for a full-week save with an existing list (roughly five times faster). These measurements are local; they do not establish hosted latency or prove the same timeout locally.

The permanent regression instruments only its disposable test database and asserts exactly one upcoming-contribution computation per menu save, instead of imposing a flaky wall-clock threshold. It verifies helper access is denied, unchanged quantities retain a checked item, and manual additions survive replacement. The existing integration suites cover stale revisions, increased/decreased quantities, shopping expiry, historical corrections, transfers and household isolation with the complete migration chain. Repository tests verify timeout translation and that the write is attempted once. Measurements are written to `test-results/planning-performance.json`.

## Existing-project rollout

1. Run the entire migration 24 as the Supabase project administrator after successful migrations through 23. Apply only pending scripts; do not replay earlier successful migrations.
2. Refresh the app, generate a new weekly preview and save it. The database optimization works with the existing frontend, so it does not require waiting for a frontend deployment.
3. Merge and deploy the matching frontend for the specific timeout notice and the earlier in-dialog save-error feedback.

Hosted execution is still required. If `57014` persists, inspect database logs and active query/lock waits for that request before changing timeouts; local benchmarks cannot rule out contention or other deployment-specific causes.
