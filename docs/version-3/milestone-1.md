# Version 3 milestone 1 — trustworthy saves and shopping expiry

Status: implemented locally for review. The confirmed product decisions remain in [the planning package](README.md). This milestone implements V3-10 and V3-04; clipboard/swaps, charts, activity/catalogue changes and historical correction remain in milestones 2–4. No hosted migration or deployment has been performed from this workspace.

## Budget commits and feedback

The old mutation wrapper awaited both the write and a household refresh inside one error handler. A browser regression reproduces the reported failure mechanism: the budget RPC commits, the following snapshot returns an error, and the original dialog incorrectly remains open as if saving failed. The same regression passes with the new operation stages.

Changed daily meal budgets now use one `save_my_meal_budgets` transaction. All fields/date permissions validate before anything commits; null clears a meal override. The API derives the current member, checks the expected household context and never accepts an arbitrary recipient. Existing individual-budget RPCs remain for installed older clients.

The form retains one operation ID for retries of the same date/payload. A private, RLS-scoped receipt returns the original acknowledgement on a repeat without replaying over later budget edits; a changed payload using that ID is rejected. Old receipts are pruned on budget writes only after 30 days and only for personal dates that can no longer be edited. Future-date receipts remain protected. No background scheduler is added.

Once the mutation is acknowledged, a failed refresh shows **Changes saved. The latest view could not be loaded. Refresh to update it.** The dialog closes and Refresh only reads state. A genuinely rejected write keeps the draft and shows its translated error inside the form. A lost acknowledgement is explicitly an unknown outcome, with **Check latest data** available inside the dialog and the same operation ID retained for a safe retry. Superseded refreshes do not turn an acknowledged commit into a failed write.

The shared operation wrapper now distinguishes these stages for other acknowledged mutations too. Background view-refresh errors name the read failure instead of claiming that an unrelated change could not be saved.

## Shopping expiry

The authoritative requirements query excludes shared dates that are persistently closed or have reached their first active member's cutoff. Requirements, fingerprints and automatic reconciliation use the same eligibility rule. Expiring a date does not edit/delete its historical meal records.

Generated products lose only the expired grams. A surviving row retains its ID and checked state on a decrease; an expired-only row is removed whether checked or unchecked. Manual additions remain. Future increases keep the existing uncheck/highlight rules. Repeated reads with unchanged eligible requirements do not bump household revisions.

Shopping observations include `observed_at` and the next `valid_until` cutoff. Visible clients refresh at that boundary and on foreground/reconnect. A sleeping tab catches up on its next authorized read; correctness does not depend on a paid scheduler or leaving the browser open.

Offline caches without enough per-day provenance cannot calculate an exact replacement quantity. They therefore explicitly warn that saved quantities may include expired meals and request reconnection, while retaining pending checks. Optional observation metadata is added to existing cache objects; no destructive IndexedDB reset or schema upgrade is needed.

Regression work also exposed a post-acknowledgement window: a checkbox can reach the server just before the next read fails. The cache now retains the acknowledged checked value/revision even when that read fails. Older responses cannot overwrite a newer item checked revision; a genuinely newer server check still wins. A forced expiry/foreground refresh is not lost behind another synchronization flight.

## Migration and rollout

Apply [migration 13](../../supabase/migrations/202611070013_budget_commits_and_shopping_expiry.sql) once, after successful migrations 1–12 and **before deploying this client**. It adds the private budget receipts and authenticated batch API, extends shopping eligibility/observation metadata, retains the existing RLS executor and removes temporary schema-CREATE permission before committing. Existing household IDs, nutrition references, menus, check receipts and pending operations remain.

Do not replay already successful migrations or clear users' browser data. Old clients retain their individual budget APIs and shopping API signatures; their server reads receive the expired-ingredient reconciliation too. New clients require migration 13 for batch budget saving. A frontend rollback can retain the additive migration; the older frontend will not acquire the new feedback improvements.

Hosted acceptance requires applying the migration and observing real Google household sessions, Realtime and physical Android/iPhone behavior. Local PostgreSQL/PGlite checks and intercepted-auth browser scenarios do not establish that hosted acceptance has occurred.

## Verification record

The automated checks cover atomic rejection/reset, replay after a newer save, wrong-household access, private receipt access, closed/non-finite dates, authoritative shopping subtraction, checked/unchecked expiry, manual items, stable/no-op revisions and timezone/DST cutoffs. Domain/cache checks cover exact cutoff equality, incomplete offline provenance, safe queued checks and post-ack read failure.

Browser checks reproduce committed-write/failed-refresh behavior, rejected and uncertain mutations, same-ID retry, refresh without duplicate writes, responsive notices, midnight refresh without applying the range, offline expiry warnings, pending checks after reload, and legacy service-worker recovery. The authenticated browser scenarios use test-only intercepted Supabase responses; device profiles are emulations.

Verification results:

| Check                                                                | Result                                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Production build, full formatting and local documentation link paths | Passed                                                                                                                  |
| Full unit/database suite                                             | 114 passed before the final cache refinements                                                                           |
| Targeted cache/domain suite after the final refinements              | 24 passed, including two additional synchronization regressions                                                         |
| Main browser flows                                                   | 25 passed across dashboard, planning and shopping                                                                       |
| Authenticated-client browser flows                                   | 21 scenarios verified across desktop/phone Chromium and iPhone WebKit; updated budget/shopping cases rerun successfully |
| Production-built Android/iPhone release flows                        | 14 passed                                                                                                               |
| PWA shell, update, offline and recovery flows                        | 15 passed                                                                                                               |

Tests shared with earlier versions remain in place; time-dependent observation metadata is checked separately from stable list contents/revisions. These are local automated results, with the hosted limits described above.
