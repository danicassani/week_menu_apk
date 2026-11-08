# Version 4 milestone 3 — clear ingredient names and recipe readers

Status: implemented for review. Delivers V4-04 and V4-13. Pastel themes and integrated release review remain milestone 4.

## Ingredient labels

A curated bilingual presentation overlay shortens unchanged starter names: Eggs / Huevos, Almonds / Almendras, Carrots / Zanahorias, Green/brown lentils / Lentejas verdes o pardinas and the individual rice types. Ordinary raw, dry, peeled, flesh and shell qualifiers are removed from names. Product distinctions remain, including canned tomatoes, frozen peas, steamed tofu and dried basil. Arbitrary words are never stripped from household content: sun-dried tomatoes and custom names remain intact.

The overlay requires an exact ingredient identity and an exact original name in each language. A household rename in English preserves that English text while the untouched Spanish starter translation can still use its shorter label. Empty translations keep the existing fallback behavior. Unknown/private ingredient identities keep their entered names. Merely editing calories, units, emoji or another field does not persist a presentation alias as a private rename.

Catalogue cards and readers, profile exclusions, recipe selectors, substitutions, serving details, transfer reviews, historical correction fields and shopping use the same labels. Search recognizes both the original and shorter names, across the complete server catalogue and saved offline pages. Paging remains bounded at 50 with the existing cursor, archive, chronology and household checks. Recipe-name searches are unchanged.

Shopping retains individual canonical rows and reference-state compatibility keys. Routine raw/dry state captions no longer repeat the preparation state beside every quantity. If equal display labels refer to different states/bases, a state caption still distinguishes them. Manual product names and entered amounts remain untouched. Ingredient details retain the explicit nutrition state and unit conversions; the catalogue keeps its source attribution; presentation labels do not redefine what 100 g means.

## Recipe presentation

Catalogue recipe captions read **Ingredients for 1 person / Ingredientes para 1 persona**, or **Ingredients for N people / Ingredientes para N personas**. The recipe editor uses Serves / Personas and Calculated energy per person. These labels continue using the stored base serving count; no amounts or scaling formulas change. Planned and historical readers retain their member, actual quantities, calorie totals, substitution notes and serving-allocation context.

Known starter preparation/weighing panels are hidden from catalogue, suggested, saved, historical and offline readers, as well as the recipe/portion editor. This includes the lentil notice about dry weight and assumed cooked-weight conversions. Independently authored preparation notes are preserved. Newly created/private recipe identities are not reinterpreted as starter recipes, even when copied from a starter.

Several original starter cooking steps pointed at the removed separate panel. Exact, unchanged starter steps now show their cooking method directly in the numbered directions: grains follow the packet; pulse methods retain soaking, fresh water, vigorous boiling and cooking until tender. This avoids orphaned references to a nonexistent panel. The remaining actual directions and household-written steps stay intact. Overlays require the known recipe/component identity and both original step translations; modified household methods are not replaced.

Online and offline catalogue readers share `RecipeContent`. Historical and planned snapshot readers apply the same read-only projection. The original pinned starter JSON/CSV, recipe instructions, ingredient IDs, nutritional states, conversions, canonical quantities, source attribution, saved household edits and historical snapshot objects are not rewritten. There is no starter-release upgrade or historical correction in this change.

## Search migration and rollout

1. Confirm migrations 1–17 have succeeded. Do not replay successful scripts.
2. Apply [migration 18](../../supabase/migrations/202611080018_display_name_search.sql) once in the Supabase SQL editor as the project administrator.
3. Deploy this frontend after the migration succeeds. Older clients keep their existing name fields and can search original names as before. The new aliases are additional search matches, not replacement stored values.
4. Verify a private ingredient rename, another household's unchanged starter and an offline recipe on the deployed origin.

Migration 18 adds one immutable, invoker-only internal display-name function and extends the existing authorized catalogue query. Only the executor can call the helper. Public RPC signatures, existing function ownership, empty search paths, RLS and bounded paging are preserved. It adds no table, privileged schema grant, environment variable, background job or external service. No hosted migration or production deployment was performed during implementation.

Presentation sources live separately in [content/presentation](../../content/presentation/README.md). The client imports the small presentation overlays rather than the full starter recipe library. `node scripts/build-content-display.mjs` regenerates the recipe overlay and pending migration's SQL aliases from the curated labels and pinned starter recipes. Applied migrations remain immutable; later alias changes require a new migration.

## Verification

Automated checks cover all curated labels and original-name guards, independent translations, unknown/private identities, meaningful qualifiers, no mutation of source/nutrition/recipe quantities, custom notes and methods, self-contained starter steps, singular/plural captions and shared offline rendering. Database checks compare the SQL aliases with the same curated source and verify full-catalogue search, private renames, unchanged conversions/nutrition and household isolation.

Bilingual phone scenarios verify readable catalogue labels, editing another field without renaming, an explicit private rename, the lentil recipe without its generic panel, unchanged cooking directions and a four-person base caption. PWA coverage exercises cached recipe and ingredient readers after an offline reload. Existing transfer, shopping, historical correction, queued-check and worker recovery checks remain part of regression verification. The PR records final totals and captures.

| Check                                                                  | Result                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Full unit/database suite, including final-schema security audit        | 159 passed                                                |
| Full main browser suite                                                | 45 passed                                                 |
| Authenticated-client household suite                                   | 33 passed across desktop/phone Chromium and iPhone WebKit |
| Production mobile release suite                                        | 38 passed across Android Chromium and iPhone WebKit       |
| PWA offline/upgrade/recovery suite                                     | 17 passed                                                 |
| Final presentation tests after private-ID/import hardening             | 2 passed                                                  |
| TypeScript, production build, formatting and local documentation links | Passed                                                    |
| Generated recipe overlay and SQL aliases                               | Reproduced byte-for-byte                                  |

Authenticated browser tests use intercepted HTTP fixtures. Android/iPhone tests use emulation. Hosted Google OAuth, Realtime and real physical devices remain deployment acceptance checks.
