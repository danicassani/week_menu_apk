# Menu re-rolls, week deletion and automatic shopping

The user explicitly replaced the previous shopping-review requirement: the list updates automatically when the saved menu changes. The menu still requires approval; shopping does not require a second approval.

- Each suggested shared lunch/dinner has a re-roll before approval. Breakfast re-roll changes only the signed-in person's portion. Other draft slots and other people's breakfasts stay unchanged. Candidates exclude the current recipe, preserve applicable dessert choices and obey diets, substitutions, calorie budgets and variety against the full resulting draft. Exhausted choices keep the current suggestion and explain that more recipes are needed.
- Saved meals use **Preview another recipe**, also excluding the current recipe and the replaced slot from variety comparisons. This fixes the old deterministic alternative that could return the same recipe. Changes still require menu approval.
- **Delete week** confirms deletion of the displayed week's editable meals. The server checks the expected revision and deletes atomically. Closed days and manual shopping additions remain.
- Saving/deleting meals, content edits and member removal reconcile shopping within the same database transaction. Loading a snapshot/list also reconciles already saved menus. Equal fingerprints cause no writes, avoiding Realtime refresh loops and unnecessary revisions.
- The list retains its configured date range. Initially it uses the calendar week of the first future planned meal, honoring Monday/Sunday settings. An explicit date-range change applies directly, without a shopping-review dialog. Increases uncheck/highlight products; decreases preserve checks; obsolete generated entries disappear; manual entries remain.

## Rollout

Apply [migration 8](../../supabase/migrations/202611050008_automatic_menu_shopping.sql) in Supabase SQL Editor after migrations 6–7, before deploying this client. It adds the week-delete API and automatic shopping. Existing API signatures remain compatible, so the backend can be upgraded first. Run migration 8 once, rather than replaying it after success. This workspace has not applied it to hosted Supabase. No paid service is needed.

## Verification

Domain tests cover different alternatives, exhausted catalogues, own-only breakfasts and preserved variety. Browser coverage re-rolls in the approval dialog, verifies only one slot changes, confirms shopping appears immediately after acceptance, then deletes the week while preserving a manual item. Actual PostgreSQL/PGlite tests cover automatic quantities, increase/check behavior, manual entries, stale deletion, closed-day preservation and no-op repeated snapshots. The previous reviewed-shopping flows remain tested against their original migrations; the new automatic workflow is tested with migration 8.
