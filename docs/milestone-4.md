# Milestone 4: release verification

The automated release checks and public hosted smoke checks are implemented. **Physical-device and signed-in household acceptance remain pending.** This report distinguishes those checks from the local fictional preview. No live household records, OAuth settings or migrations were changed by this milestone.

## Release fixes

- The active service worker now serves its own installed HTML and assets until an update is accepted. A newly deployed HTML page can no longer replace the old cached shell while its worker/assets are still waiting. The regression downloads a genuinely different page and script, reloads before approval, then accepts the update offline and verifies pending shopping checks survive.
- Failed initial worker installation shows an offline-availability notice while the connected app remains usable.
- Dialogs wrap forward/backward keyboard focus through enabled, visible controls and restore focus to the keyboard invoker on closing.
- The food-log help now directs people to Menu when replacing a planned meal with eating out. Obsolete shopping placeholder code is removed. The fictional preview retains its language preference across offline reloads without caching profiles or health logs.
- Production PWA tests now use the actual build with the Pages security/cache headers, rather than Vite's header-free preview. Test suites have separate artifact directories. All Playwright configurations are type-checked.

## Automated evidence

The executed suites cover 65 domain/database/storage/auth checks, 9 existing Chromium application flows, 6 production PWA flows and 10 mobile Chromium/WebKit checks. Formatting and the production build pass. `npm audit --omit=dev` reports zero known production dependency vulnerabilities at the time of this review; this is not a substitute for application authorization tests.

| Area                          | Verification                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calculations and permissions  | Actual SQL migrations in PostgreSQL/PGlite, screening/formula boundaries, personal-write ownership, approved/removed identities and history                                                                               |
| Integrated household          | Individual breakfasts; shared chicken/tofu substitutions; personal dessert; forged calorie/conversion fields recomputed by the server; exact converted shopping totals; eating out removes only that person's ingredients |
| Interleaved edits and history | A second editor's stale revision is rejected; an expired shared meal stays immutable across timezone and ingredient changes; the current personal day remains writable                                                    |
| Final schema                  | Public-table RLS, absence of anonymous reads/direct member writes, inaccessible private tables, and anonymous-execution/search-path checks on definer functions                                                           |
| Production PWA                | Real worker/IndexedDB, restart, queued checks, reconnect, explicit-discard sign-out, accepted updates, isolation of waiting releases, install failure, security headers, manifest and callback-cache exclusion            |
| Mobile Chromium and WebKit    | Full English/Spanish planning-to-shopping workflows, dark mode, no horizontal overflow, offline restart/reconnect, read-only member selection, local-data clearing and keyboard dialog behavior                           |
| Installation UI               | Chromium install-prompt handler and iOS Share/Add to Home Screen guidance; this is not proof of native OS installation                                                                                                    |

Run with Node 24:

```sh
npm ci
npx playwright install --with-deps chromium webkit
npm run format:check
npm run build
npm test
npm run test:browser
npm run test:pwa
npm run test:release
npm run check:deployment -- https://week-menu-apk.pages.dev
```

`test:pwa` and `test:release` create isolated production builds with the fictional preview enabled. These bundles are test artifacts; Cloudflare production must keep `VITE_ENABLE_PREVIEW=false`. The build directory is shared, so run these two commands sequentially. CI installs both engines and executes every suite. A browser-emulated iPhone uses desktop WebKit with iPhone settings, not physical iOS Safari. The local environment supplied missing WebKit libraries in its workspace; CI uses Playwright's supported dependency installation.

The public deployment checker performs read-only requests to the app HTML, manifest, icons, worker and hashed entry script. It validates security/cache headers, installation metadata and content types, and prints hashes and a timestamp. It sends no Google credentials and fetches no household records. In an environment requiring an HTTP proxy, use `NODE_USE_ENV_PROXY=1 npm run check:deployment -- https://week-menu-apk.pages.dev`.

## Hosted observations on 4 November 2026

The checked production main revision was `cdbf651899e61aa85cad0f9d4805b62bb3b20537` (milestone 3). Public HTTP checks passed for the app's CSP, `nosniff`, referrer policy, no-store HTML, revalidated manifest/worker, install icons and immutable hashed script. The live Google provider reports enabled. Anonymous direct reads of member/shopping tables and calls to household/shopping snapshot RPCs return HTTP 401 with PostgreSQL `42501` (permission denied). The saved [public evidence](review/milestone-4-public-checks.json) contains no credentials or household records.

These anonymous checks establish denial and endpoint presence, not correctness for signed-in users or confirmation that every migration is installed. There are no configured Supabase administrator credentials or approved user sessions in the execution environment. Hosted Chromium navigation was blocked by trust of the environment's outbound TLS proxy; TLS verification was kept enabled. The public HTTP audit used the configured CA trust successfully. A real Google token exchange, refresh, Realtime subscription and hosted browser workflow have not been claimed as passing.

## Remaining live acceptance

Use the existing household and agreed app URL. Avoid changing personal goals or removing the real owner just to run a test. Review disposable test meals/manual items before committing them. Record device/browser/OS, date, result and any cleanup performed below.

| Check                   | Steps and expected result                                                                                                                                                                                                                                | Status                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Migration inventory     | Confirm migrations 001–005 in the project, including `202611040005_shopping_offline.sql`. Do not rerun applied migrations. The M4 PR introduces no migration.                                                                                            | Pending owner confirmation          |
| Google and roles        | On both devices, sign in as two approved members. An unapproved address must receive denial. Each member sees shared summaries but can edit only their own personal data. Sign out and sign in again; no callback error or prior account's cached views. | Pending                             |
| Realtime                | Keep both signed in. Add a disposable manual shopping item on one device; it appears on the other. Check it on the second; both eventually agree. If Realtime is delayed, foreground refresh must still work.                                            | Pending                             |
| Concurrent editing      | Open the same test recipe/meal on both. Save one edit, then try saving the old second draft. The second editor must review current content rather than overwrite it.                                                                                     | Pending                             |
| Android installation    | Chrome menu/install prompt → install. Launch from the home screen, sign in if needed, load Menu/Recipes/Shopping, go offline and restart. Saved views and queued checks remain.                                                                          | Pending physical Android            |
| iPhone installation     | Safari → Share → Add to Home Screen. Launch the installed app and verify Google return/session behavior in that context. Load the three views there, enable airplane mode and restart. Browser and installed-app storage can differ.                     | Pending physical iPhone             |
| Reconnect ordering      | Queue a shopping check offline; make a different change on the other connected device. Reconnect the first. The last server-accepted intent wins. A deleted item is not recreated and causes a notice.                                                   | Pending                             |
| Sign-out and storage    | With a queued offline check, sign-out requires reconnect/sync or explicit discard. After exit/relaunch, no cached household views remain. Verify the installed app separately from the browser.                                                          | Pending                             |
| Update                  | With a harmless pending shopping check, accept the next update in the installed app. It reloads successfully and preserves the pending check until sync.                                                                                                 | Pending after controlled deployment |
| Languages/accessibility | Try English/Spanish, light/dark mode, keyboard or VoiceOver/TalkBack labels, larger text and portrait/landscape on actual devices.                                                                                                                       | Pending physical devices            |

History/date locks, activity arithmetic and member-removal authorization are automated locally. Do not change a device clock or remove a real household member as a substitute for a controlled hosted test account. Remote membership removal cannot erase data on a disconnected device; it must deny access and purge the saved views when detected on reconnection.

## Controlled rollout and rollback

1. Review this PR and automated results. Confirm the existing five migrations; this change needs no new SQL, OAuth credentials or Cloudflare variables.
2. Review the Cloudflare preview build, keeping preview content disabled for any build pointed at the real household. Repeat the public checker against its exact origin. Preview Google sign-in needs an exact Supabase redirect allowlist entry if you choose to test it; do not add a wildcard.
3. After approval, merge/deploy this frontend through the existing Pages project. Run the public checker against production and record the deployed commit. Complete the live acceptance rows with both devices.
4. If release checks fail, use Cloudflare Pages' previous production deployment. Do not drop tables, delete history or roll back the additive milestone-3 schema. Existing installed clients may keep their installed shell until its next accepted update; verify the rollback update and retained queue before declaring recovery. If an emergency forces clearing device storage, synchronize pending checks first or obtain explicit discard from that device's user.

Release acceptance is complete only after the pending hosted/device rows have recorded results. Pantry inventory, guest diners and additional product scope remain outside version one.
