# Shared preparations and explicit recipe variants

Implemented evolution of V6, following the agreed phased migration. This does not assign a new major-version number. The calorie-fitting algorithm, rounding rules and food references remain unchanged; improving practical portion fitting is a subsequent product decision.

## Recipe and planning model

`PlannedRecipe.recipe_model` is an optional version-2 document containing a default variant and explicit variants. A variant has a name, substitution description and preparations. Each preparation embeds its identity/revision, name, reference ingredient lines, method, optional-dessert status and eligibility for advance preparation. Reference lines retain component identities for compatibility with saved plans. These identifiers are internal; ingredient role classifications are not reintroduced into the authoring form.

The bundled catalogue now has **63 recipe models and 106 explicit variants**, preserving the existing substitution reference amounts. Fourteen meat/fish dishes have editorially separated common vegetables and variant-specific proteins. Plain, separately cooked grain preparations share identities across recipes. Other preparations stay together unless there is an explicit reviewed separation. Milk-based mixtures, meatball mixtures and other materially different methods are not inferred to be common from matching food names.

The source food catalogue still supplies calories, units and reference states. Every variant uses its actual ingredients and positive preparation instructions. No utensil or cross-contamination workflow is introduced. Compatibility means the selected foods and recipe method suit the participants; it does not mean ingredients with the same name are automatically interchangeable.

`makePortion` chooses a compatible variant, preferring a saved/manual choice and then the original. It preserves the existing budget scaling and rounding algorithm. `PlannedPortion.variant_id` identifies the choice. A new saved snapshot embeds only the selected variant plus its preparation versions, avoiding a copy of every catalogue alternative in every personal portion. Legacy snapshots remain readable and are not rewritten on migration or load.

Recipe editing stays in Recipes. A simple new recipe keeps the existing name/servings/ingredients/steps form and saves as a single preparation plus optional dessert. After saving, the model-aware editor supports explicit variants, preparation linking, ingredient amounts, translated steps and advance-preparation options. Reusing a preparation copies a frozen revision. Changing its method or food identity creates a new identity rather than changing other recipes silently.

## Cooking, shopping and serving

A saved meal shows common preparation totals once, variant-only preparations with their participants, and a collapsed **Divide portions / Repartir raciones** section. Per-person ingredient amounts remain authoritative. A mixed preparation can only be divided by its overall weight when the ingredient ratios agree; otherwise the view directs distribution by ingredient. If a complete matching allocation has measured cooked output, the serving detail can show that cooked weight. No yield is guessed.

Kitchen requirements derive from the selected snapshot. Compatibility includes preparation identity/revision, exact method, food states, nutrition references and actual ratios. The complete-dish preference applies only when every included preparation qualifies. Existing legacy batch rules remain for old snapshots. Current cooked batch composition is immutable; menu/budget/diet changes can flag reservations for review. The next planned session opens by default; cooked batches and later sessions are expandable. Menu's preference to prioritize reusable preparations persists with the household cooking settings.

Shopping continues aggregating personal menu lines, never adding cooking requirements as another contribution and never deducting cooked stock. Pending and Purchased are separate groups, with Purchased collapsed by default. This incorporates the requested grouping into the shared checklist used online and offline; the older V5 records describing PR #46 are historical status records.

## Connected daily flows

- Home prioritizes today's meals; scheduled intake is labelled estimated, including actual food logs.
- Menu uses Change as the primary saved-meal action and puts secondary meal tools under More.
- Profile editing separates personal details, health/goals and food preferences. Changes to name/language/diet do not force calorie-target review. Weight logging saves directly; an available target review remains explicit.
- Both date budget editing and accepting new default budgets load a fresh revision and preview affected personal portions. Default-budget review respects date overrides and later effective targets. One confirmation atomically saves budgets, optional reviewed portion changes and shopping reconciliation. Other members' complete saved portions and cooked compositions remain unchanged.
- Planning history has an ordinary visible entry; the previous gesture is retained as a compatibility shortcut.
- Offline navigation retains all five destinations and the selected person/week/tab within the account/household scope. Saved meals use the same shared-preparation reader. Kitchen and health/profile actions explain that a connection is needed and queue no stock changes.

## Database rollout

Apply these additive migrations in order, then deploy the frontend:

1. `supabase/migrations/202611110029_recipe_preparations.sql`
2. `supabase/migrations/202611110030_budget_portion_commit.sql`

Migration 29 adds models to the shared starter release, leaving private overrides, old menu snapshots, historical records and cooked ledger JSON untouched. It extends recipe validation, canonical portion handling, independent server-built copy/swap previews and cooking requirements. Old format reads remain supported. An old editor cannot remove version-2 metadata from a recipe and receives `recipe_update_required` instead.

Migration 30 adds scoped `save_budgets_and_portions` and `accept_target_and_portions`, with operation receipts checked before revision checks. A private quantity-only updater revalidates the actor against authoritative budgets while preserving every other member's saved JSON. A retry cannot replay over a newer budget save; operation IDs bind actor, changes, reviewed plans and revision. Only the actor's date/default budgets and quantity changes to that member's affected meals are permitted. Recipe composition, other members' portions, closed dates and household scope remain guarded. Failures roll back the whole transaction.

No new tables are exposed publicly. Existing no-login executor, RLS, empty search paths, server-calculated energy, CAS and planning history remain in force. Combined-budget receipts use existing history-receipt retention. The catalogue remains self-contained in the planning library; no new ingredient/preparation management API is required.

For a frontend rollback, retain both database migrations and stored version-2 data. A previous client can read legacy-compatible fields but will be blocked from overwriting new recipe documents. Do not strip `recipe_model` or reverse cooked stock to force compatibility.

Rebuild the pinned models and migration seed with `node scripts/build-recipe-models.mjs`. Review method changes as editorial changes; do not regenerate migrations already applied to a deployed database. Changes after rollout require a new additive migration and preparation revision.

## Acceptance coverage

The test suite compares the original and new engines across supported catalogue diets and dessert choices, verifies common totals and individual variants, and checks cross-recipe rice batching, proportionality, old snapshot preservation and distinct food references. Database tests cover canonical variants, forged lines, old-client write protection, method-revision conflicts, server transfer construction and atomic budget retry/rollback behavior. Browser coverage exercises the actual bilingual mobile flows and collapsed details, with current browser results recorded during verification.

Local verification: 265 logic/database tests, 10 focused browser cases, all 19 PWA cases, and 8 production-build recipe/serving cases across Android Chromium and iPhone WebKit passed. All 36 authenticated household scenarios also passed across desktop/mobile Chromium and WebKit, including one corrected mobile theme-label test rerun. TypeScript/build, formatting and whitespace checks passed. These are local checks; hosted Supabase migrations and deployment have not been performed.
