# Repair for HTTP 403: permission denied for schema auth

The reported `get_household_snapshot` failure is PostgreSQL `42501`, `permission denied for schema auth`. It is reproducible after migrating an existing initialized household and removing `auth` schema usage from the new executor role. `get_household_access` still succeeds, but migration 6's snapshot response directly calls `auth.uid()` as `week_menu_executor`. The invitation function has the same dependency.

The existing-household migration was intentional: migration 6 requires one original household and backfills its records, retaining IDs and history. This incident is a missing restricted-permissions test case, not a reason to create another household or reset the database. The earlier local fixture allowed the executor into `auth`, hiding this dependency. Reproducing the permission boundary produces the same error code, message and failing snapshot expression.

## Apply the repair

In Supabase's SQL Editor, as the project migration administrator, run the complete [migration 202611050007](../../supabase/migrations/202611050007_auth_namespace_independence.sql). It requires migration 6 and is safe to rerun. Run this repair rather than repeating migration 6.

It replaces only `app_private.api_snapshot()` and `app_private.api_invite()`. Both now derive the account UUID from the already verified active membership's `user_id`, read through existing household RLS. Function owners, execute grants, table policies, household/member IDs, health/history, content, shopping and operation receipts are preserved. No additional grant into `auth` and no RLS bypass is needed. The existing tightly scoped administrator-owned identity resolvers continue checking the current verified Google identity.

After the script commits, reload the app or select **Reload current household**. No frontend build, browser-data clearing or sign-out is required by this repair. The public API signatures and returned context structure are unchanged.

This workspace has no administrator connection to the hosted Supabase project, so the repair is supplied for execution in the project's SQL Editor. Local verification does not claim that it has already run against production.

## Verification

The new regression was first run against migration 6 without the repair and failed with the exact reported `42501` / `permission denied for schema auth` at `api_snapshot`'s `auth.uid()` expression. With migration 7, the same existing household loads while direct `auth.uid()` access remains forbidden to the executor.

The household suite now runs with no executor `auth` schema usage throughout, covering original and newly created households, invitations whose owner's account/membership UUIDs differ, removal/rejoin history, tenant boundaries and direct-write restrictions. Reapplying the repair preserves function owners/ACLs and the household snapshot's data. The integrated meal, substitution, eating-out, nutrition, shopping, history and schema audit also runs after migrations 6–7 with the same restricted schema access.

Run:

```sh
npm test
npm run build
npm run format:check
```
