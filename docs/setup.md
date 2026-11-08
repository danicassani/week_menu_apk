# Run, configure and verify the app

All four version-four implementation milestones are ready for review; see the [V4 release report](version-4/milestone-4.md). The current frontend requires successful migrations 1–19, including the household recipe-veto extension; milestone 4 itself added no SQL or environment variable. Existing projects should apply only pending migrations and must not repeat successful scripts. Earlier milestone reports below retain the incremental rollout details.

For version 3 milestone 1, apply [migration 13](../supabase/migrations/202611070013_budget_commits_and_shopping_expiry.sql) after 1–12 and before deploying the matching client. See [the milestone report](version-3/milestone-1.md) for budget acknowledgements, shopping expiry and offline behavior.

For version 3 milestone 2, apply [migration 14](../supabase/migrations/202611070014_meal_transfers.sql) after 1–13 and before deploying the matching client. See [the transfer review](version-3/milestone-2.md) for swaps, recipe copy/paste, permissions and rollout. Existing API signatures and household records are preserved.

For version 3 milestone 4, apply [migration 16](../supabase/migrations/202611070016_historical_corrections.sql) after 1–15 and before deploying the matching client. See [the historical-correction and release report](version-3/milestone-4.md).

For version 3 milestone 3, apply [migration 15](../supabase/migrations/202611070015_catalogue_pages.sql) after 1–14 and before deploying the matching client. See [the milestone report](version-3/milestone-3.md) for compact household snapshots, catalogue paging, local activity preferences and serving allocation.

For version 4 milestone 2, apply [migration 17](../supabase/migrations/202611080017_upcoming_shopping.sql) after 1–16 and before deploying the matching client. It makes all upcoming meals authoritative for shopping, including calls from older date-range clients, and adds household egg purchasing estimates. See [the rollout and offline compatibility report](version-4/milestone-2.md). Only apply pending migrations as the project administrator; no new environment variable is needed.

For version 4 milestone 3, apply [migration 18](../supabase/migrations/202611080018_display_name_search.sql) after 1–17 and before deploying the matching frontend. It adds shorter ingredient names as catalogue search aliases while preserving original/private content. See [the presentation and compatibility report](version-4/milestone-3.md). No starter release or environment change is required.

For household recipe vetoes, apply [migration 19](../supabase/migrations/202611080019_recipe_vetoes.sql) after 1–18 and before deploying the matching frontend. It adds an isolated household preference while preserving starter content and saved meals. See [the behavior and rollout report](recipe-vetoes.md).

## Local development

Use Node.js 24 LTS and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open the address printed by Vite. **Explore the preview** opens a fictional sample household. It makes no Supabase requests and sends no invitations. Its menu, catalogue and shopping simulator persist within the current browser tab for offline-reload testing; profiles and health logs stay in memory. Exiting the preview clears its saved data. Preview is available in development; production requires an explicit `VITE_ENABLE_PREVIEW=true` build setting. It never authenticates a user or bypasses database permissions.

```sh
npm run build
npm test
npx playwright install --with-deps chromium webkit
npm run test:browser
npm run test:pwa
npm run test:release
```

The [current release verification report](version-4/milestone-4.md) separates executed checks from pending real-device/Google-session acceptance. `npm run check:deployment -- https://week-menu-apk.pages.dev` audits only public hosting files and headers.

Browser checks use `/usr/bin/chromium` when installed, otherwise Playwright's Chromium. Set `CHROMIUM_PATH` to override. Unit/integration tests run PostgreSQL through PGlite, including the actual migrations, role grants and row-level policies. They do not substitute for testing the hosted OAuth flow.

## Supabase setup

**Current V4:** one Supabase project serves multiple isolated households, with one household per person. Any verified Google account can create its own household or accept an invitation. Keep `public` as the exposed Data API schema; do not expose `app_private`. Apply pending migrations through 18 as the project administrator before deploying the current client.

**Fresh-install foundation prerequisite:** migration 6 deliberately requires an initialized original household. Follow the [v2 migration rollout](version-2/milestone-1.md#review-and-rollout) after the original foundation procedure below. The numbered procedure describes the legacy single-household stage and its owner bootstrap, not the current V4 access policy. Do not replay migrations 1–5 on an existing database.

### Legacy foundation stage: migrations 1–5

If the v2 client reports `42501: permission denied for schema auth` on `get_household_snapshot`, use the additive [auth-permission repair](version-2/auth-permission-repair.md) after migration 6. It preserves the existing household and does not require replaying earlier migrations.

1. Create the intended household's Supabase project. At this legacy stage the project serves **one** household. Keep `public` as the exposed Data API schema; **do not expose `app_private`**.
2. Apply these migrations, in order, using the Supabase SQL editor as the project administrator (or a linked Supabase CLI migration workflow):
   - `supabase/migrations/202611030001_foundation.sql`
   - `supabase/migrations/202611030002_activities.sql`
   - `supabase/migrations/202611030003_planning.sql`
   - `supabase/migrations/202611030004_starter_food.sql`
   - `supabase/migrations/202611040005_shopping_offline.sql`
3. Configure the owner's approved Google email in the SQL editor, replacing the example. This function is deliberately inaccessible to application users:

   ```sql
   select app_private.configure_owner('owner@example.com');
   ```

   The first verified Google account with that exact normalized address initializes the household. Subsequent ownership transfers do not reset when the original owner signs in again. No client environment variable can claim ownership. After initialization, the owner configuration cannot be changed through this function.

4. Enable **Google** in Supabase Authentication → Providers. Create a Google OAuth web client and use the callback URL shown by Supabase (normally `https://<project-ref>.supabase.co/auth/v1/callback`) as its authorized redirect URI. Save the Google client ID and secret **only in Supabase**, never in this repository or `VITE_*` settings. Keep other sign-in providers disabled. Database authorization also verifies the account's confirmed Google identity.
5. **After the first Cloudflare Pages deployment supplies the app URL**, set Supabase's Site URL to the intended app origin. Add exact redirect URLs for that origin's `/` and, for development, `http://localhost:5173/` and/or `http://127.0.0.1:5173/`. Avoid unrestricted production redirect wildcards. The application uses PKCE and returns to its own origin.
6. Copy `.env.example` to `.env.local`, then fill in the project URL and **publishable** key:

   ```dotenv
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<project-publishable-key>
   VITE_ENABLE_PREVIEW=false
   ```

   A legacy anonymous key is also accepted by the SDK. Never use a secret or service-role key in the frontend. These two public values are embedded at build time; authorization is enforced by database roles, row-level read policies and controlled write functions.

7. Restart Vite or rebuild after changing environment settings. Sign in as the configured owner, complete the profile and accept the target and three budgets. Approve other Google addresses under Profile → Invite member. **This approves access; it does not send an email.** Share the app's address with the invitee separately.

The revision table is added to `supabase_realtime` when that publication exists. Only a non-sensitive revision counter is published; clients fetch a fresh authorized snapshot. Foreground refresh and a once-per-minute visible-page refresh also pick up changes and date rollovers. Verify Realtime in the hosted project, particularly after member removal.

## Cloudflare Pages deployment settings

Build command: `npm run build`. Output directory: `dist`. Use Node 24 and the two public Supabase environment values above. Preview is off unless explicitly enabled. `_redirects` provides the SPA fallback; `_headers` provides security headers and self-hosted-asset caching. The current content security policy permits the standard `*.supabase.co` API and WebSocket domains. Adjust that allowlist if a custom Supabase domain is used.

The production build registers a public-shell service worker. Menu, recipes and shopping views are saved in account-scoped IndexedDB after loading them online; only shopping checkboxes can be edited offline. Profile and health logs stay in React memory. Sign-out requires synchronizing or explicitly discarding pending checks, then clears local household data. See [milestone 3](milestone-3.md) for installation, updates and storage limits. HTTPS is required for deployment. Provisioning and deployment remain subject to the agreed release milestone.

## Hosted acceptance checks still required

- Confirm an unrelated Google account can create its own household but cannot read another household through UI or direct REST calls. Verify invitations grant access only to their household.
- Sign in with real owners in two households and an invited member on Android Chrome and iPhone Safari; verify profile ownership, shared reads, invitations, transfer, removal and fresh-token access revocation.
- Confirm PKCE redirects, refresh, sign-out and browser storage clearing on the final HTTPS origin.
- Confirm revision notifications and foreground date rollover with users in different IANA timezones. Database tests cover the two lock models, but hosted-browser integration still needs verification.
- Review project backup, retention and actual provider/free-plan limits before entering real household history. No live service configuration or hosted end-to-end result is claimed by the local test suite.
