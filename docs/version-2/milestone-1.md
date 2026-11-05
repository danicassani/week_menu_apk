# Version 2 milestone 1 — household isolation and onboarding

Status: implemented locally for the agreed first review checkpoint. No hosted database, Google settings, Cloudflare configuration or production deployment has been changed. The remaining v2 milestones are not implemented by this checkpoint.

## Delivered behavior

- Any verified Google account can explicitly create a household or accept an invitation approved for its email address. Discovery alone does not accept an invitation. Creation makes the person the owner; an account can have one active household membership.
- English/Spanish entry screens handle creation, invitations and unavailable invitations, then continue to the existing personal profile/target onboarding. Household names appear in the workspace.
- The migration assigns the existing household a UUID and retains its original member IDs, content, plans, profiles, calorie/weight/activity history, shopping items and idempotency receipts. Auth account IDs and subsequent membership IDs are separate; a later join gets a new membership rather than reactivating an old profile.
- Removed members lose reads and writes. Their retained history remains in its original household. Owner-only invitation/removal/transfer rules and transfer-before-leaving remain enforced.
- Every private table, lock, revision and relationship is household-scoped. Realtime subscriptions filter the authorized household's revision row.
- Offline keys include account, household and membership. New queued checks carry their household/membership too. Existing v1 queue IDs/order transfer only when the server identifies the original legacy membership. They never move into another household or a later membership.
- A changed active membership clears the old cache and requires a reload before the repository can bind to the new context. Sign-out checks pending intent across that account's cached scopes, then atomically clears/blocks those scopes.

## Database boundary

[Migration 202611040006](../../supabase/migrations/202611040006_households.sql) creates a dedicated `week_menu_executor` role. It cannot log in or bypass RLS, owns no tables and cannot read `auth.users` directly. Ordinary application functions execute as this role, so their existing nutrition/date/shopping queries obey row policies even when called through a definer function. Neither `anon` nor `authenticated` is a member of this role.

Two small administrator-owned helpers resolve the current verified account's active membership/household from database records. They do not accept a tenant ID or trust a caller-set tenant variable. Explicit create/join functions handle onboarding under administrator ownership with identity checks, an account advisory lock and a partial unique index. The departure trigger uses the changed row's household/member identifiers explicitly. An administrator-owned owner-configuration stub fails rather than applying the obsolete v1 setup model.

Public data wrappers now require `p_household_id` and `p_membership_id`. These are expected-context checks against the server-derived membership, not authority supplied by the client. The old signatures are removed so an old installed client cannot replay unbound shopping changes after a membership transition. `get_household_access`, create/join and timezone bootstrap have separate, limited entry points.

Future database functions must preserve this ownership/RLS boundary. New table-owning definer functions cannot safely reuse unscoped application queries. The schema audit runs both the v1 release workflow and the same workflow after the v2 migration.

## Review and rollout

1. Review the migration and this checkpoint before continuing to the next agreed milestone. Keep production on v1 during this review.
2. On a staging copy with migrations 1–5 and an initialized household, back up the database and record baseline household/member/history/shopping counts. A fresh installation must initialize its original owner with the v1 setup first; migration 6 deliberately fails if there is not exactly one original household to preserve.
3. Apply migration 6 as the Supabase project migration administrator. It is transactional and requires permission to create the restricted executor role and grant it to `postgres`. Test this in hosted staging; local PostgreSQL/PGlite checks do not verify the hosted administrator's permissions.
4. Deploy the matching client to staging. Keep `public` as the exposed API schema and `app_private` unexposed. No new environment variables, paid products, photo buckets or OAuth providers are required. Old client data-RPC signatures intentionally fail; users need the matching release. Preserve the existing canonical-URL service-worker recovery behavior.
5. With separate real Google accounts, create a second household, invite/join, remove/rejoin, transfer ownership and verify retained history. Check that the existing Google OAuth audience/consent configuration permits the intended users; this database migration does not change Google-side restrictions. Exercise two actual browser sessions concurrently for create/join and revoked-membership races. Verify Realtime delivery/revocation and a real previously installed PWA with queued v1 checks. None of these hosted checks has been claimed as completed locally.
6. Compare the original household's records with its baseline. Test the original user's normal meal and shopping workflows before any production rollout. Production migration/deployment belongs to the release checkpoint.

New households have private empty content collections at this checkpoint. The existing household retains all its content. The common starter baseline and private overrides are the next milestone; this migration deliberately does not seed new households from someone else's live catalogue.

## Automated verification

Executed locally: 90 unit/component/database/storage/auth checks, 9 existing Chromium flows, 12 new household-onboarding/cache-identity flows across desktop Chromium/phone Chromium/iPhone WebKit, 13 production PWA checks and 10 Chromium/WebKit release checks. Formatting, local documentation links and the production build pass. The browser counts include emulated devices, not physical phones or hosted Google sessions.

Run with Node 24:

```sh
npm run format:check
npm run build
npm test
npm run test:browser
npm run test:households
npm run test:pwa
npm run test:release
```

Database tests apply the actual SQL, preserving v1 fixtures and repeating the integrated meal/shopping/schema release workflow after migration 6. Dedicated adversarial checks cover cross-household snapshots and direct reads, forged contexts/member references, shared ingredient keys, isolated revisions/date locks, removal/rejoin history, personal writes, role ownership and privileges. Storage/repository tests cover legacy queue upgrade, changed membership, late snapshots, operation envelopes and complete sign-out clearing.

The new desktop/phone browser suite exercises the real client and Supabase SDK with intercepted test-only auth/API responses. It proves create/join/error UI behavior, cache-key binding and that another account's cached shopping list never flashes during offline session discovery, not live Google OAuth or hosted RLS; the SQL tests cover the database separately. Existing PWA tests use real Cache Storage/IndexedDB and retain the Cloudflare redirect/`ERR_FAILED` regressions. Run the production-build browser suites sequentially because they share `dist`.

In this workspace, WebKit and its shared libraries live under `/workspace/.cache`. Local WebKit runs used `PLAYWRIGHT_BROWSERS_PATH` and `LD_LIBRARY_PATH` to select them. Its host preflight checks the system linker cache and cannot see the privately installed GLES library; after checking that the native loader can load that library, local runs used `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. The browser itself and all test assertions still ran. This is a local runner setting only; CI installs normal system dependencies and retains its default validation.

## Remaining v2 work

The next checkpoint adds the common starter catalogue/private overrides, larger text and its setting, recipe/ingredient emojis and personal emoji avatars. Re-rolls, preview locks, swaps, copied weeks and informational stars follow in the third checkpoint. Full hosted/device acceptance and the production rollout remain in the release checkpoint. Photo uploads, thumbnails, pantry and preparation-time filters remain deferred.
