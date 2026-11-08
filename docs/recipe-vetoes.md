# Household recipe vetoes

A recipe's catalogue reader offers **Veto recipe / Vetar receta**. A veto applies to the entire household and excludes that recipe from new automatic week/meal suggestions and re-rolls, including everyone's breakfasts. Reversing it uses **Remove veto / Quitar veto** in the same reader.

Vetoed recipes remain in the ordinary catalogue, including search and paging. Their cards use a transparent background, dashed border, muted title and faded emoji, with a **Vetoed / Vetada** label. Text stays readable, and cards remain enabled for ordinary clicks, keyboard activation and the existing copy context action. This is separate from archiving, which retains its existing hide/show behavior.

Manual selection, recipe copying and explicitly copying a previous week remain available. Vetoing a recipe never removes or recalculates saved meals or shopping contributions. If no eligible suggestion exists, the existing planner explains the gap rather than silently choosing a vetoed recipe. A shared revision change invalidates outdated suggestion reviews through the existing concurrency guards.

## Persistence and permissions

Migration 19 adds `app_private.recipe_vetoes`, keyed by household and recipe ID, with its own revision. It has forced RLS and no direct application/anonymous table grants. A scoped RPC verifies the current Google account's active membership before reading/updating the preference. Any active household member can change a veto, consistent with shared recipe editing.

The flag is independent of recipe content revisions. Vetoing a starter recipe does not create a private content copy, change the pinned starter collection, or affect other households. Recipe editing cannot accidentally overwrite the flag. Existing private recipes, translations, archived status, quantities, nutrition and historical references remain intact.

The existing resolved recipe view exposes boolean `banned` and `veto_revision` metadata in current library/detail reads. Catalogue summaries carry `banned`. A compare-and-set conflict refreshes the open reader for review before another attempt. A same-value retry immediately after an accepted operation acknowledges it without incrementing the revision again, covering a lost response. The household revision is bumped once for an actual change, so normal Realtime/foreground refreshes pick it up.

Updated clients honor the suggestion preference. Older installed clients must update to understand this new flag; it is not a server prohibition on manually planning a recipe. Vetoes are a household planning preference, not an authorization boundary on recipe access.

Cached offline recipe cards/readers retain the last loaded veto status. Changing vetoes requires a connection, as with other recipe edits. No new offline write queue, storage schema reset, service, environment variable or paid dependency is introduced.

## Rollout

Apply [migration 19](../supabase/migrations/202611080019_recipe_vetoes.sql) once after successful migrations 1–18 and before merging/deploying this frontend. Use the existing Supabase SQL editor as the project administrator; do not replay successful scripts. Keep `app_private` unexposed. No hosted SQL or deployment was performed during implementation.

Verification covers suggestion filtering, reversal, readable/searchable dimmed cards, manual portions, lost-response retries, stale revisions, independent content edits, unchanged saved meals/shopping, cross-household isolation and direct table denial. Browser scenarios exercise both languages and persisted state after reload; the PWA scenario checks the cached vetoed card and recipe reader offline. The normal full database suite also audits final-schema permissions. See the PR for exact final results and phone captures.

## Executed checks

- Full unit/database suite: 163 passed.
- Focused suggestion/database/security checks after the final guards: 23 passed.
- Full main browser suite: 50 passed.
- New production veto scenarios: 4 passed across Android Chromium and iPhone WebKit, both languages.
- PWA/offline/recovery suite: 18 passed, including cached veto status.
- TypeScript, production build, formatting and local documentation links passed.

The phone profiles are emulated; the SQL suite runs the real migrations locally in PGlite. Hosted Supabase/OAuth and physical-device acceptance are not claimed.
