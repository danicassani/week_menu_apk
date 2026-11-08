# Remove ingredient repetition rules

The configurable main/base ingredient repetition window has been removed. Consecutive meals may use the same ingredient or the same recipe. This applies to week suggestions, individual suggestions, re-roll alternatives, manual meal edits, copying a week, pasting meals and swapping meals.

Suggestions still honor household recipe vetoes, archived content, meal eligibility, personal dietary exclusions, substitutions and calorie budgets. A re-roll still seeks a different recipe from the meal being replaced; having that alternative on another day no longer disqualifies it. Locks, overwrite review, stale-revision checks, automatic shopping and household isolation retain their existing behavior.

Profile settings no longer offer a variety interval. Ingredient readers/editors no longer display or request a canonical main/base ingredient key. Recipe editors no longer classify ingredient lines as main, base or support. Meal components such as the main dish, sides and optional dessert are independent of that classification and remain available.

## Compatibility and rollout

Apply [migration 21](../supabase/migrations/202611080021_remove_variety.sql) after successful migrations 1–20, before deploying the new frontend. It removes the server repetition checks from both meal batches and transfer previews, and accepts recipe/ingredient content without the obsolete metadata. Ingredient membership, substitution validity, nutrition, conversions and dietary validation remain enforced.

The migration changes installed function definitions with exact guards so earlier household, shopping and authorization patches remain intact. It keeps existing function owners, search paths and grants. It neither rewrites stored content nor recalculates existing meals or historical records. Legacy variety metadata and the old household column can remain inert in existing records; current planning does not use them. The old settings RPC argument remains for compatibility and is ignored.

Earlier specification, milestone reports and starter-source snapshots describe the original repetition design. This document supersedes those requirements for the current application. Foundation migration tests still exercise the historical schema; current full-schema tests verify repeated meals are accepted.

## Verification

Coverage includes consecutive same-recipe lunches/dinners saved through the real SQL API, neighboring-recipe re-rolls, pastes and swaps, ingredient/recipe saves without obsolete metadata, and unchanged protection against invalid settings, stale writes and unauthorized access. Browser checks verify week-start settings still work and variety controls are absent. The PR records executed suite totals.

No hosted SQL, merge or deployment is performed during implementation.
