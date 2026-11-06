# Menu re-rolls, week deletion and automatic shopping

The user explicitly replaced the previous shopping-review requirement: the list updates automatically when the saved menu changes. The menu still requires approval; shopping does not require a second approval.

- Each suggested shared lunch/dinner has a re-roll before approval. Breakfast re-roll is available for every household member and changes only the selected person's portion. Other draft slots and other people's breakfasts stay unchanged. Candidates exclude the current recipe, preserve applicable dessert choices and obey diets, substitutions, calorie budgets and variety against the full resulting draft. Exhausted choices keep the current suggestion and explain that more recipes are needed.
- Saved meals use **Preview another recipe**, also excluding the current recipe and the replaced slot from variety comparisons. This fixes the old deterministic alternative that could return the same recipe. Changes still require menu approval.
- **Delete week** confirms deletion of the displayed week's editable meals. The server checks the expected revision and deletes atomically. Closed days and manual shopping additions remain.
- Saving/deleting meals, content edits and member removal reconcile shopping within the same database transaction. Loading a snapshot/list also reconciles already saved menus. Equal fingerprints cause no writes, avoiding Realtime refresh loops and unnecessary revisions.
- The list retains its configured date range. Initially it uses the calendar week of the first future planned meal, honoring Monday/Sunday settings. An explicit date-range change applies directly, without a shopping-review dialog. Increases uncheck/highlight products; decreases preserve checks; obsolete generated entries disappear; manual entries remain.

## Rollout

Apply [migration 8](../../supabase/migrations/202611050008_automatic_menu_shopping.sql) in Supabase SQL Editor after migrations 6–7, before deploying this client. It adds the week-delete API and automatic shopping. Existing API signatures remain compatible, so the backend can be upgraded first. Run migration 8 once, rather than replaying it after success. This workspace has not applied it to hosted Supabase. No paid service is needed.

## Verification

Domain tests cover different alternatives, exhausted catalogues, individual breakfasts for the viewer and other members and preserved variety. Browser coverage re-rolls in the approval dialog, verifies only one slot changes, confirms shopping appears immediately after acceptance, then deletes the week while preserving a manual item. Actual PostgreSQL/PGlite tests cover automatic quantities, increase/check behavior, manual entries, stale deletion, closed-day preservation and no-op repeated snapshots. The previous reviewed-shopping flows remain tested against their original migrations; the new automatic workflow is tested with migration 8.

## Suggestion preview controls

**Suggest week** / **Sugerir semana** opens a draft before applying changes. **Only empty slots** / **Solo huecos vacíos** is checked by default; unchecking it explicitly enables replacement of existing editable meals. Week deletion (eraser) and copying (import arrow) remain beside the suggestion button, with localized accessible names and tooltips. Deletion still requires confirmation.

The preview toolbar shows the selected calendar week as **DD/MM - DD/MM** and outline dice regenerate unlocked suggestions. Cards show localized weekdays; individual dice choose alternatives and open/closed padlocks control retention. Breakfast swaps move the selected person's choices between days, preserve the other portions, recalculate destination budgets and respect that person's locks. Incompatible destinations are disabled. Shared lunch/dinner swaps retain their existing rules.

Over-budget calorie numbers are gold/yellow, underlined buttons with accessible warning labels and 44 px touch targets. Tapping opens the rounding explanation; closing it returns focus to the number and retains the draft. Other calorie totals stay plain. No schema migration or new external service is required.

## Atomic shopping date-range changes

The date-range button now uses `set_shopping_date_range` once instead of a preview/apply network round trip. The server validates the expected household/membership, locks that household, validates the date range and reconciles the latest menu in the same transaction. An interval without planned home-cooked portions removes all generated products; checked manual additions remain. Reloading preserves the selected empty interval. Selecting a populated interval restores its generated requirements. Menu edits and date-range edits continue using the same increase/decrease/check rules.

Apply [migration 12](../../supabase/migrations/202611060012_shopping_date_range.sql) once, after migrations 6–11 and before deploying this client. It adds only an authenticated, context-bound API and a private helper owned by the existing RLS-restricted executor. It does not change household tables or broaden their write grants. Existing preview/apply APIs remain available for older clients.

The reported production connection message could not be reproduced without the affected session; the existing empty-range reconciliation passed the final-schema SQL reproduction. This change removes the legacy two-request path and its inter-request concurrency window. Regression tests cover an empty range with/without manual additions, persistence across reload, return to populated dates, invalid dates, forged contexts and access denial.

## Daily meal budgets and shopping feedback

The daily budget dialog shows breakfast, lunch and dinner as three labeled number fields on one row, including on phones. It preloads the selected date's overrides or accepted personal defaults. One save applies only changed fields through the existing individual-budget API; a blank field restores that meal's default. Use defaults removes that date's overrides. Changing dates loads the corresponding values; existing meal portions still require manual review. No new SQL migration is required.

Unknown errors while applying a shopping range now say that the list could not be updated for that interval. Known errors retain their specific explanation, including invalid ranges, access changes and a changed menu/list requiring the date range to be applied again. Shopping synchronization also uses action-specific wording. These messages describe the failed action without assuming a connectivity cause.
