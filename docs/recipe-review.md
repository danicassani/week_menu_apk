# Recipe review and catalogue improvements

## Behavior

Ingredient selectors sort by the displayed English or Spanish ingredient name using locale-aware, case-insensitive ordering. This includes curated display names, recipe ingredient selection and personal exclusions. Source names and authored recipe ingredient order remain unchanged.

Vetoing or restoring a recipe updates its existing card and open reader from the write acknowledgement. It does not request a complete household snapshot or rebuild the catalogue. Loaded pages, search and visible cards remain in place. Cached recipe summaries and details receive the same narrow patch; ingredient pages are untouched. Closing the reader or switching catalogue tabs while a write finishes does not reopen it or replace the new tab's cards.

The server returns the household revision with the veto result. A consecutive acknowledgement can safely advance the local planning revision; an unexpected gap leaves planning incomplete until its normal authorized refresh. Unrelated changes can still trigger a background refresh, preserving the loaded page count. Recipe content and veto revisions keep their existing independent concurrency checks and lost-response retry behavior.

## Recipe Tinder

**Recipes → Recipe Tinder / Tinder de recetas** reviews every active recipe available to the household, including vetoed recipes and recipes beyond the first 50 catalogue cards. Search filters do not restrict this review. Archived recipes are excluded. Only summaries are paged up front; the current and next recipe details are fetched as needed.

- Swipe right or choose **Accept / Aceptar** to accept the recipe and remove an existing household veto.
- Swipe left or choose **Veto / Vetar** to veto it for the household.
- Read ingredients on the card or expand the complete recipe before deciding.
- Vertical scrolling remains available. Horizontal gestures require a clear horizontal movement; buttons provide the same actions without swiping.
- The progress indicator counts reviewed active recipes. Closing and reopening, refreshing or signing in on another device resumes the signed-in member's progress.
- Restarting requires confirmation and clears only that member's review progress. It does not change any household vetoes.

Progress is private to the signed-in household membership; veto decisions remain shared with the household. A recipe whose content revision changes becomes eligible for review again. A concurrent veto or recipe edit requires reviewing the current data before retrying. Decisions advance only after the server acknowledges both the veto and personal progress in one transaction.

The fictional preview persists review progress in its existing tab-scoped simulator. Real cross-device persistence uses Supabase. Reviewing and changing vetoes require an online connection; existing offline recipe readers retain their last loaded veto status. Meals, portions, shopping contributions and calorie history are unchanged by review decisions.

## Rollout

Apply [migration 20](../supabase/migrations/202611080020_recipe_review.sql) after successful migrations 1–19, before merging/deploying the new client. Use the Supabase SQL editor as the project administrator and do not replay earlier successful migrations. The migration preserves existing households, recipes and vetoes.

The new `app_private.recipe_reviews` table uses forced household RLS with no direct anonymous/authenticated access. Scoped RPCs verify active membership, derive the actor on the server and isolate review progress by member. Public wrappers expose only the required operations. Keep `app_private` outside the exposed Data API schemas. No new environment variable, external service, paid dependency or offline schema reset is required. Implementation does not apply SQL or deploy to the hosted project.

## Verification

The tests execute actual migrations locally through PGlite and cover personal progress in the same and different households, direct-table denial, edited recipe revisions, stale writes, retry safety and resetting progress without changing vetoes. Ingredient-order tests compare displayed labels in both languages. Offline tests verify narrow cache updates and preserve ingredient entries even when their IDs match recipe IDs.

Browser coverage includes more than 50 recipes, swipe decisions, resume after reopening/reloading, restart and bilingual selectors. An authenticated intercepted-API fixture verifies a veto makes one write, requests no snapshot/catalogue reload, preserves all 100 loaded cards and handles closing/switching tabs during a pending response. Mobile production scenarios run in emulated Android Chromium and iPhone WebKit. PWA checks cover offline data and update/recovery behavior.

Executed totals are recorded in the pull request. These local database, intercepted-auth and emulated-device checks do not claim hosted Google OAuth or physical-device acceptance.
