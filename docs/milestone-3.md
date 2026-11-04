# Milestone 3: shared shopping and offline PWA

This milestone adds the shared shopping workflow and production PWA shell. It ends at review; merging, applying the live migration and deploying require the agreed rollout decision.

## Shopping

Choose a date range, preview the differences and apply them to the household's single list. Quantities come from saved personal portions: breakfast, lunch, dinner, selected sides and desserts, with substitutions included. Eating-out portions contribute no ingredients. Defined ingredient conversions yield canonical gram amounts; aggregation keeps ingredient identity, raw/dry/cooked reference and quantity basis separate. Labels and calorie estimates are never used to guess conversions.

Surviving generated items retain their IDs and checked states when the range changes. Increases uncheck and highlight an item; decreases preserve its check. Missing generated items are removed. Manual additions remain separate, retain their checks and are never removed by menu generation. Any member can add, edit, delete and check manual items. There is no pantry tracking.

Menu changes show a notice; the list changes only after review. Previews check both the current list content revision and a fingerprint of the saved portions. Checkbox changes do not invalidate a preview: applying it reads the latest checked state under the household transaction lock.

## Offline and installation

The production build creates a manifest, icons and a versioned public service worker. Android Chrome offers installation when eligible; iPhone/iPad Safari uses Share → Add to Home Screen. HTTPS is required outside localhost. Load **Menu**, **Recipes** and **Shopping** online to save each view on that device. Offline views show their last-loaded time; unloaded views have an explicit empty state. Profiles, targets, weight/activity/food logs and their dashboard summaries are not put in the offline database. Saved menu portions include their ingredient quantities and meal calories, as required for viewing the menu.

Only shopping checkboxes can be changed offline. Each desired checked state is stored transactionally in IndexedDB with an account ID, unique operation ID and local order. Reconnect sends them in order. The last change accepted by the server wins, even if an offline check arrives after a quantity increase. Server receipts make retries idempotent: retrying an already accepted operation does not overwrite a later edit. Removed item IDs are discarded with a notice while other operations continue; labels are never used to resurrect or remap items. An authoritative refresh follows synchronization, preserving any newer local pending intent. A persisted refresh marker survives a failed response or reload.

Sign-out warns about pending operations. Reconnect and synchronize, or explicitly discard them, then clear that account's cached views and local session. Account-bound requests prevent an old queue from using a newly signed-in account's token. Signed-out tombstones reject late cache writes. A detected membership removal clears cached household views and prevents further writes. A removed member's already downloaded device data cannot be remotely erased while that device stays offline; server authorization rejects it on reconnection.

The service worker caches only the public application shell, self-hosted fonts and static assets. It does not cache Supabase, OAuth callbacks, API responses or authenticated health data. User-selected updates retain IndexedDB and pending checks. Browser storage can be unavailable or evicted; failures are shown and checkbox edits fail rather than pretending to be saved. Offline sign-out cannot confirm remote token revocation; it clears the device's local session.

## Existing-project rollout

After milestone review, apply **only this new migration**, after the four migrations already applied for milestones 1–2:

`supabase/migrations/202611040005_shopping_offline.sql`

Run the entire file in the Supabase SQL editor as project administrator, or use the linked migration workflow. It creates the list, items, private operation receipts, RLS/grants and controlled RPC functions. It also preserves quantity-reference metadata by ingredient version, including the original starter references needed by existing saved meals. Existing profiles, menus and recorded days are retained. Do not rerun the foundation or starter imports. No Google OAuth credentials or Cloudflare environment changes are required.

Deploy the new frontend **after** that migration. Cloudflare Pages still uses Node 24, `npm run build` and `dist`; keep `VITE_ENABLE_PREVIEW=false`. The build now generates `dist/sw.js`. The supplied headers prevent long-lived caching of the worker and manifest. No service-role secret belongs in frontend settings.

## Verification and review

Run `npm run format:check`, `npm run build`, `npm test`, `npm run test:browser` and `npm run test:pwa`. The last command builds an isolated production bundle with the fictional preview enabled and tests its real service worker. It never contacts a live household. Database tests execute all actual migrations and exercise authenticated/anonymous/removed-member permissions, stable IDs, range changes, manual preservation, quantity changes, stale previews and retry receipts. IndexedDB tests cover account isolation, persistence, partial acknowledgments, lost responses, outdated operations, blocked storage and purge guards.

Milestone 4 remains the hosted and cross-device release review: real Google sessions, Supabase Realtime, two-member editing, Android Chrome/iPhone Safari installation and storage behavior, deployment headers, update rollout and final acceptance. No local browser suite proves hosted OAuth or iOS behavior. Pantry handling and guests remain a later version.
