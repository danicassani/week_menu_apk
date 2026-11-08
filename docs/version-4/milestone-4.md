# Version 4 milestone 4 — device themes and release review

Status: implemented for review. This completes the four V4 implementation milestones and V4-02. Merge/deployment and hosted physical-device acceptance are separate release steps.

## Seven families, fourteen variants

Profile → Settings → Theme colour offers White, Blue, Pink, Violet, Green, Yellow and Orange. Each has a light and dark palette. The header's existing light/dark toggle stays independent of colour. Native radio semantics, translated names, a visible selected check and keyboard focus make selection usable without relying on colour alone. The picker uses a focus-within outline so Safari also shows native-radio keyboard focus. The grid wraps on narrow screens and at enlarged text sizes.

Colour uses the validated device-only key `week-menu-colour-v1`; the existing `week-menu-theme` light/dark key is retained. White is the initial family. A missing/invalid mode uses the system's initial preference, with a safe light fallback if media queries are unavailable. Invalid colours fall back to white. Blocked storage still allows session-only changes. Cross-tab storage changes synchronize both preferences independently. Sign-out clears household data but retains these non-sensitive device preferences. Theme selection performs no Supabase write.

One theme provider applies semantic tokens to the application root, covering signed-in pages, onboarding, welcome/sign-out screens, dialogs, update prompts and cached offline views. Browser/OS launch surfaces and the standalone public recovery document retain their static neutral fallback. No theme preference is added to a profile, household snapshot or offline checkbox payload. No new service, image, font, dependency or environment variable is introduced.

| Family | Light background | Dark background |
| ------ | ---------------- | --------------- |
| White  | `#f7f7f5`        | `#111111`       |
| Blue   | `#edf4fc`        | `#101b29`       |
| Pink   | `#fceff4`        | `#25151e`       |
| Violet | `#f3effc`        | `#1c1729`       |
| Green  | `#edf6ef`        | `#131f17`       |
| Yellow | `#fcf7e7`        | `#221f13`       |
| Orange | `#fff1e7`        | `#261a13`       |

Surfaces, subtle backgrounds, normal/secondary text, primary controls, inverse text, borders, focus and warnings have explicit per-palette values. Input/secondary-button boundaries use a stronger control token separately from decorative dividers. Disabled controls have readable muted text and a distinct surface. Summary-card secondary text uses an explicit inverse-muted colour instead of reducing the opacity of all its content. Calorie warnings retain their on-demand explanation and yellow/gold presentation. Charts keep stable member colours, names and percentages; an outline defines their boundary against each surface. No allocation, nutrition or historical-edit logic changes.

The automated matrix checks normal, secondary, placeholder and warning text against background/surface/subtle colours, primary/inverse text pairs, and focus/control boundaries. Across all fourteen variants, the minimum tested text contrast is approximately **4.66:1**, and the minimum tested control/focus contrast is approximately **3.11:1**. The exact per-variant values are written to `test-results/theme-contrast.json`. These token checks complement rendered browser/focus/capture checks; they are not a claim of a complete accessibility certification.

## Integrated V4 scope

| Milestone | Delivered requests                                                                                                                 | Review                   |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1         | Quieter menu/dashboard controls, target review, one shared allocation bar, historical controls/layout and quiet shopping increases | [Report](milestone-1.md) |
| 2         | All upcoming shopping and estimated whole-egg purchasing units                                                                     | [Report](milestone-2.md) |
| 3         | Curated ingredient labels, plain serving captions and recipe presentation                                                          | [Report](milestone-3.md) |
| 4         | Seven local colour families with light/dark counterparts and integrated verification                                               | This report              |

All thirteen requested V4 items have an implementation. Pantry, photos, translation APIs, guests and simultaneous household memberships remain outside this release. Existing calorie methodology, Google OAuth, household authorization, immutable source/history references, queued shopping receipts and membership rules remain in place.

## Upgrade from the previous app

A separate local acceptance check built the actual merged milestone-three source, commit `2493b71ae1ce5f27795d7b730b672b00087e2311`, with the fictional preview enabled. It installed that build's worker, saved a manual shopping item and an existing dark-mode preference, then served the new build from the same local origin. While the new worker waited, it queued a checkbox offline. Accepting the update loaded the new application offline, preserved the dark preference, initialized White as its colour family, retained the queued checked state and synchronized it after reconnecting. No browser-data deletion or household-cache reset was used.

Observed local shell versions were `week-menu-shell-3e92a08ab4ecd6b90e63` before and `week-menu-shell-3043ec359fd0d21448f2` after. These identify the local preview-enabled builds, not a hosted production release. The JSON result and screenshot are saved as `test-results/previous-release-upgrade.json` and `test-results/previous-release-upgrade.png`.

To reproduce, build the previous checkout separately using Node 24 and its locked dependencies, with `VITE_ENABLE_PREVIEW=true`. Build this checkout with the same preview setting, then run:

```sh
node scripts/check-previous-release.mjs /absolute/path/to/previous/dist
```

The optional second argument selects the new build's output directory; `UPGRADE_TEST_PORT` changes the default local port 5177. The script uses a temporary local server and Chromium, without contacting Supabase. Run it and the PWA/mobile suites sequentially when they share `dist`.

The ordinary PWA suite additionally verifies a colour selection surviving an offline worker update, pending receipts, sign-out/discard handling, missing/redirected cached shells and network fallback for the earlier ERR_FAILED failure modes. Authenticated-client tests verify changing colour without a backend mutation. Their HTTP responses are intercepted; they do not use real Google accounts.

## Deployment order and hosted review

No SQL migration is added by milestone 4. An existing V4 deployment needs successful migrations **1–18** before using this frontend. The user reported migration 18 and milestone 3 merged/applied before this work; no scripts were replayed and no hosted database was changed.

After reviewing this PR and its CI checks, merge and deploy through the existing Cloudflare Pages build: Node 24, `npm run build`, output `dist`, existing public Supabase URL/publishable key, and preview off unless explicitly required. No hosting or OAuth setting changes are required. An installed PWA offers its normal update action and preserves pending checks.

On the deployed HTTPS origin, complete the remaining hosted acceptance with real accounts: two isolated households, an invited member, owner removal/transfer, own-profile restrictions, Realtime refresh and Google sign-in/sign-out. Verify theme choice and enlarged text on physical Android Chrome and iPhone Safari, including installed/offline updates with a pending shopping check. Confirm upcoming shopping/expiry across timezones and run `npm run check:deployment -- https://week-menu-apk.pages.dev` against the new deployment. Local emulation and a successful prior-worker fixture do not establish these hosted results. This PR performs no production deployment.

## Verification evidence

The theme scenarios render and capture every family in both modes, in English and Spanish, and check reload/sign-out persistence, radio keyboard selection and visible focus at 320 px with 200% root text. Separate checks cover legacy settings, invalid input, cross-tab changes and unavailable storage. Existing regression suites cover recipe labels, menu actions, transfers, history, calorie/budget acknowledgements, shopping expiry/units, tenant permissions and worker recovery. See the PR for final suite totals.

| Check                                                                  | Result                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Full unit/database/RLS suite                                           | 161 passed                                                         |
| Full main browser suite                                                | 48 passed                                                          |
| Main theme scenarios after final Safari focus styling                  | 3 passed                                                           |
| Authenticated-client household suite                                   | 33 passed across desktop/phone Chromium and iPhone WebKit          |
| Existing production mobile scenarios                                   | 38 passed across Android Chromium and iPhone WebKit                |
| New production theme scenarios after the Safari focus correction       | 4 passed, both languages on both mobile profiles                   |
| PWA offline/upgrade/recovery suite                                     | 17 passed                                                          |
| Actual previous-release worker → final new shell                       | Passed again after final focus styling; pending check synchronized |
| Contrast matrix                                                        | All fourteen palettes passed; exact values in the JSON report      |
| TypeScript, production build, formatting and local documentation links | Passed                                                             |

The full mobile run exposed Safari's missing `:focus-visible` match for the native radio. The final picker uses `:focus-within`; its four new mobile scenarios and three main theme scenarios were rerun successfully after that CSS-only correction. Existing non-theme mobile scenarios had passed in the integrated run. The main warning test was updated to the new accessible gold colour, then the full main suite passed.

CI's `verification-results` artifact contains the per-palette phone captures and contrast report. The separately run previous-build acceptance result is local evidence. Physical devices, real OAuth and hosted Realtime remain the explicit acceptance boundary described above.
