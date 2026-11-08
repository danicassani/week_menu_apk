# Version 4 milestone 2 — upcoming shopping and egg units

Status: implemented for review. Delivers V4-01 and V4-07. Recipe naming and preparation information remain milestone 3; pastel themes remain milestone 4.

## One list for upcoming meals

Shopping has no week or date-range controls. The server combines all planned meals whose authoritative shared-day cutoff has not passed, including today's open meals and dates beyond the week loaded in Menu. It excludes eating-out portions and ingredients whose shopping policy excludes them. Closing or deleting meals removes only their contributions. Historical corrections cannot restore expired shopping requirements. Manual additions remain independent of meal dates.

Existing stable ingredient/reference keys, row IDs, receipts and optimistic concurrency checks remain. A decrease preserves the checked state of a surviving row; a positive increase unchecks it even when its displayed egg count does not change. There are no increase highlights or messages. An empty future menu leaves only manual additions. Repeated reads of an already reconciled list are no-ops.

Migration 17 changes the shared requirement/reconciliation path, including the existing date-range, preview and apply RPCs. Their argument shapes remain compatible, but a valid old interval cannot narrow the shared list. The stored start/end bounds are derived metadata, not user-selected scope. Existing household content and pending checkbox intentions are retained.

Planning reads reconcile before returning their revision. A saved meal-transfer preview hydrates a stale planning library before its initial review when a shopping change has advanced the shared revision; a change after review still invalidates it. This prevents a successful shopping check from leaving the next copy/paste review unusable while waiting for Realtime.

## Eggs as purchasing units

Compatible generated egg rows show whole eggs, calculated by summing precise edible grams across all applicable meals and rounding upward once. The exact grams remain visible beneath the count. The bilingual count is explicitly an estimate, not a carton-size recommendation.

The confirmed starter default is **50 edible grams per egg, without shell**, from the pinned starter pack's editorial `reference_piece_conversion`. It is not a CoFID measurement or a recipe nutrition conversion. Any household member can change the household estimate through Shopping → Egg size estimate, or reset it to the starter default. The setting is isolated by household and uses revision checks. A conflicting edit preserves the draft and requires reloading for review. Retrying the same accepted request after a lost response acknowledges it without applying another change.

Only the compatible starter egg identity, raw-edible state and edible-reference-weight basis receive this purchasing mapping. Other ingredients, incompatible references or invalid/missing conversion metadata retain grams. Manual additions keep their entered amounts. Changing the estimate changes neither recipes nor personal portions, calories, historical records or canonical shopping grams.

## Offline and upgrade behavior

Shopping observations include `scope: "upcoming"`, `contributions_complete`, per-date contributions and their authoritative cutoffs, plus purchasing metadata. The client verifies complete provenance against the observed generated rows before subtracting expired grams locally. It preserves surviving row IDs/check states and all manual additions. Each successive cutoff schedules another projection. Projection does not overwrite the cached server observation or change queued operation payloads.

A legacy range-based cache is labelled as a saved list that needs refresh; it never claims complete upcoming coverage. Existing queued checks remain queued. Reconnecting reconciles before acknowledging checks, including checks for rows that expired or were removed, without recreating those rows. Account-scoped storage, sign-out clearing and membership validation are unchanged. There is no background job, new paid service, image storage or additional environment variable.

## Migration and deployment

1. Confirm migrations 1–16 have succeeded in the existing Supabase project. Do not replay successful scripts.
2. Apply [migration 17](../../supabase/migrations/202611080017_upcoming_shopping.sql) once as the project administrator in the Supabase SQL editor. It is transactional and additive. Keep `app_private` unexposed.
3. Deploy this frontend after the migration succeeds. The older client remains API-compatible during this ordering, although its date-range controls no longer narrow the shared list.
4. Verify two real households, an invited member, pending offline checks and a timezone cutoff on the deployed origin. No hosted SQL or production deployment was performed during implementation.

The migration adds a forced-RLS private purchasing-settings table. New functions use empty search paths and the existing verified membership context. Application roles cannot access the table or internal query/reconciler helpers directly; only the scoped RPC is granted. No broad schema/table grant or `auth` privilege repair is required.

## Verification

The automated suite covers multiweek aggregation, no-op reads, empty-menu clearing, preserved manual/check state, same-whole-egg-count increases, expiry, old interval/preview/apply calls, conversion reset/CAS/lost acknowledgement, unchanged nutrition and cross-household denial. Browser scenarios cover English and Spanish, estimate editing, copying into separate weeks and the shopping-to-menu revision transition. Authenticated-client fixtures exercise conflicting estimate edits and an accepted request whose response is lost. PWA checks cover complete-cache expiry and upgrading a legacy range cache while a checkbox is queued.

| Check                                                                  | Result                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Full unit/database suite, including final-schema security audit        | 156 passed                                                |
| Full main browser suite                                                | 43 passed                                                 |
| Transfer and upcoming-shopping scenarios after final error handling    | 9 passed                                                  |
| Authenticated-client household suite                                   | 33 passed across desktop/phone Chromium and iPhone WebKit |
| Production mobile release suite                                        | 34 passed across Android Chromium and iPhone WebKit       |
| PWA offline/upgrade/recovery suite                                     | 16 passed                                                 |
| TypeScript, production build, formatting and local documentation links | Passed                                                    |

The database fixture's two dates are 21 days apart. Its enriched shopping JSON is 6,125 bytes with six checklist rows and two daily contributions. `EXPLAIN ANALYZE` inside an authenticated transaction measured approximately 6 ms for ten per-date ingredient rows in the local PGlite fixture. These are small-fixture observations, not production capacity or latency guarantees. All future contributions intentionally increase payload size with the number of planned meals; no week limit is silently imposed.

Automated authentication uses intercepted HTTP fixtures; Android/iPhone coverage uses device emulation. Real Google OAuth, hosted RLS/Realtime and physical-device acceptance remain deployment checks. See the PR for final test totals and phone captures.
