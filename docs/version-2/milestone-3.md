# Version 2 milestone 3 — menu drafts, week copies and ratings

Implemented for review. No hosted SQL or deployment has been performed.

## Planning controls

- Preview suggestions have shared-meal locks and individual breakfast locks. Regenerate unlocked preserves locked portions, while failed alternative searches retain the original choice and show a notice. Locks are temporary draft controls; they do not alter historical date locks or survive a new generation.
- Select Swap suggestion, then Swap here on another draft slot. Shared lunches/dinners can swap when both recipes support the destination types; a breakfast swaps only the signed-in person's portion. Other breakfasts remain unchanged. Locked slots must be unlocked first. Destination portions are rebuilt using accepted budgets/overrides, active members, dietary exclusions, current catalogue nutrition and conversions, and dessert choices. Variety is checked against the resulting draft plus retained saved neighbors. Failure preserves the draft.
- Copy a week accepts a source date (normalized using the household's week-start preference) and previews choices for the displayed destination week. Everyone's known breakfasts and shared meals are included. Existing destinations stay by default; the existing replacement checkbox explicitly opts into replacement. Closed destinations remain unchanged. Logs and targets are never copied, and the source week is never modified.
- Archived/missing recipes, missing budgets, variety conflicts and missing personal source choices produce visible gaps rather than invented replacements. A new member with no historical breakfast has an explicit unplanned gap. Available portions can still be reviewed and saved. New dietary substitutions are shown before approval. Saved changes reconcile shopping for its configured date range as before.
- Server commits continue through the context-bound, revision-checked meal API. It validates date cutoffs, members, meal types, catalogue/diet restrictions and budgets, and validates variety atomically after removing all replaced slots. Draft locks are client state, not persistent authorization or historical locks.

## Eating out and provenance

Migration 11 derives an underlying home-recipe ID/snapshot from the previously stored portion when it becomes eating out, ignoring client-supplied provenance. Editing the eating-out record again retains that reference. Copies recover its recipe choice and rebuild a home portion using current destination settings. Older breakfasts whose original recipe was already discarded remain explicit gaps; they are not inferred from a restaurant description. A shared source can recover its stored shared recipe ID.

## Stars

Open a recipe in the household collection to view its household average/count and choose your own 1–5 stars. There are no comments and no influence on suggestion ranking, probability or exclusions. One current rating is keyed by household, verified account and recipe; membership records provide provenance. Rejoining the same household updates that account's existing rating, rather than adding a second score. Former-member ratings remain included in the household's informational history. Ratings of starter recipes stay private to the household.

Only the signed-in account can write its score. RLS restricts reads by household and writes by account/current membership. The public RPC is an invoker wrapper over an executor-owned private helper, following the corrected migration-10 ownership pattern. The library exposes a caller-specific `mine` flag so a returning member sees their existing score without exposing account identifiers through the snapshot.

## Rollout and verification

After migrations 1–10, apply [202611060011_recipe_ratings.sql](../../supabase/migrations/202611060011_recipe_ratings.sql) as the migration administrator before deploying this client. No new environment variables or external services are needed. Review on staging before production.

Domain tests check destination budget recalculation, eating-out recovery/missing-reference gaps, personal breakfast preservation, locked swaps and atomic variety rejection. Database tests apply the real SQL and check private/caller-owned ratings, invalid scores/contexts, same-account rejoin uniqueness and server-derived eating-out provenance. Browser tests exercise locks/regeneration, personal swaps, copied-week review/source preservation, and changing a single recipe rating. Existing planning, shopping, household isolation and PWA regressions remain applicable. Hosted Google/Realtime and physical-device acceptance belong to milestone 4.

Still deferred: pantry, preparation-time limits, photos and automatic translation. The next milestone is integrated hosted/device acceptance and release.
