# Version 2 milestone 4 — release verification

Status: automated release-candidate verification complete; hosted/physical-device acceptance remains pending. No database migration, Google configuration, Cloudflare deployment or production household data was changed by this milestone. There are no new migrations beyond 1–11.

## Findings and changes

- The SQL release workflow previously tested v1 and the early v2 schema through migration 7. It now upgrades the existing initialized household through every migration, including shared starters, presentation and ratings. It verifies authoritative arithmetic, personal breakfasts, shared substitutions/dessert, eating out, automatic shopping, stale editors and immutable historical days against the final schema.
- Final-schema auditing covers RLS, direct-write/anonymous grants, private definer exposure/search paths, security-invoker catalogue views, executor table ownership and CREATE privilege removal. The common read-only starter table is an explicit member-readable exception; private tables remain inaccessible to direct authenticated reads.
- Production-built Android Chromium/iPhone WebKit flows exercise the complete v2 interface in English/Spanish: personal avatar navigation/grid, Large text, protected suggestion regeneration, personal breakfast swaps, recipe reading, ratings and copied-week review.
- The new 200% text-size test found an iPhone English overflow. Header actions now wrap instead of pushing Edit profile beyond the viewport. The keyboard skip link stays inside the viewport and moves fully out of view until focused, regardless of text height. Screenshots were visually reviewed.
- `check:deployment` now checks every declared public-shell asset, including secondary scripts, CSS, fonts and license text, with same-origin/type/cache checks. The local built-file server now serves font-license text with the same text MIME type as Pages. It requires the HTML entry in the manifest and handles Pages' `/index.html` canonicalization through the already-checked root. HTTP fixtures prove that a missing secondary chunk fails verification.
- CI retains `verification-results` screenshots/failure traces for seven days on success or failure. Browser suites that rebuild `dist` must run sequentially.

## Executed evidence

The checked public production site is https://week-menu-apk.pages.dev. Evidence is timestamped and describes the deployed bundle at that time, before this milestone's CSS fix is merged; it does not assert that the pending fix is already deployed.

| Verification                     | Evidence and limits                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public HTTPS hosting             | [Public report](release-public-checks.json): all declared shell assets, security/cache headers, installation manifest/icons and worker verified. No login or private household reads.                                           |
| Public Google entry              | [Authorization-entry report](release-auth-entry.json): Supabase returns a Google authorization redirect, configured client ID and matching project callback. No account was logged in and no code/token exchange was attempted. |
| Production dependency advisories | [Dependency report](release-dependencies.json): `npm audit --omit=dev` reported zero advisories. This is not a penetration test or a guarantee of no vulnerabilities.                                                           |
| Existing v2 CI                   | [Milestone-3 workflow](https://github.com/danicassani/week_menu_apk/actions/runs/42148957469) completed successfully. The new checks run in the same workflow for this PR.                                                      |

Local results on 6 November 2026:

| Command                                   | Result                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check` / production build | Passed                                                                                                                                  |
| `npm test`                                | 104 passed, including the final-schema v1/v2 release workflow and deployment-check HTTP fixtures                                        |
| `npm run test:browser`                    | 17 flows exercised successfully; one 30-second timeout during concurrent local load passed unchanged in an isolated rerun (7.3 seconds) |
| `npm run test:households`                 | 12 passed across desktop Chromium, phone Chromium and iPhone WebKit                                                                     |
| `npm run test:pwa`                        | 14 passed, including queued checks, sign-out purge, legacy redirected-worker recovery and the complete built-shell audit                |
| `npm run test:release`                    | 14 passed across Android Chromium/iPhone WebKit, including the four new v2 language/device flows and 200% text scaling                  |

The iPhone overflow was reproduced by the new assertion before the CSS fix and disappeared with the fix; no assertion was weakened. PGlite verifies SQL logic and permissions, not Supabase-managed infrastructure. Browser device profiles are emulations, not physical phones. Household onboarding browser tests use intercepted test-only auth/API responses; they do not impersonate real Google accounts.

## Remaining hosted acceptance

The environment has no Supabase administrator connection or authenticated Google household session. Migration 11 has been requested for confirmation, but its hosted application has not been independently inspected. Do not record the following as passed without real observations:

1. Confirm migration 11 succeeded after 1–10. Do not repeat successful migrations or reset household data. The corrected migration-10 ownership pattern remains documented in [milestone 2](milestone-2.md).
2. With real Google accounts, use two independent households and an invited second member. Confirm separate catalogues, menus and ratings; then confirm that a meal/shopping change reaches the invited member through Realtime without mixing households. Use test content/accounts for membership-removal and ownership-transition checks.
3. In Chrome on Android and Safari on iPhone, open the deployed app normally, use avatar/large-text controls, plan/lock/swap/copy and rate a recipe. Install to the home screen, load menu/recipes/shopping, disconnect, check an item, restart, reconnect and confirm synchronization. Avoid clearing browser data to make the test pass.
4. Exercise an already-installed PWA updating from the previous matching v2 release with a queued shopping check. Verify that the intent survives update acceptance and that explicit sign-out clears the household cache. These paths pass automation but still need physical-device evidence.

## Rollout and recovery

The code candidate is reviewable in its PR; merging triggers the existing Pages build. After deployment, run `npm run check:deployment -- https://week-menu-apk.pages.dev` again and record the new shell version. Check the real-account/device observations above before declaring hosted acceptance complete.

If the frontend needs rollback, choose the previous matching v2 Pages deployment. Keep the additive household/catalogue/presentation/rating migrations; do not restore a pre-household client with obsolete RPC signatures, drop tables or erase local shopping intent. Existing PWA update/recovery behavior remains unchanged.

Pantry, preparation-time limits, photos, automatic translation and multiple simultaneous household memberships remain outside this release.
