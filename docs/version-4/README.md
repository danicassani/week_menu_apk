# Version 4 — requested backlog

Status: version-four planning started after all four version-three implementation milestones were merged. The requests below are not yet implemented. See the [design and confirmed decisions](design.md) and [delivery milestones](milestones.md). All project documentation remains in English; the application continues supporting English and Spanish.

## V4-01 — show eggs as units in shopping

The shopping checklist currently presents eggs in grams. Show a number of eggs instead.

- Use a defined ingredient-specific grams-per-egg conversion. The starter pack's editorial egg weight is not a confirmed universal conversion; preserve that distinction and provide a confirmation/configuration path during implementation.
- Keep precise edible-weight quantities and nutrition references internally. Changing the shopping display must not change recipes, portions or calorie totals.
- Aggregate all applicable meal contributions before converting to purchasing units, avoiding rounding each meal separately.
- Working default for later review: round the combined purchasing requirement upward to whole eggs, while preserving the exact underlying requirement. Do not introduce carton-size assumptions.
- Preserve quantity increase/decrease behavior, including unchecking and highlighting an increased requirement. Localize unit labels.

Reference: [starter quantities and conversions](../../content/starter/README.md).

## V4-02 — pastel themes with dark counterparts

Offer these seven theme families, each with a light and dark counterpart:

| Theme family | Light mode                   | Dark mode                           |
| ------------ | ---------------------------- | ----------------------------------- |
| White        | Neutral white/light surfaces | Corresponding neutral dark surfaces |
| Blue         | Pastel blue palette          | Related muted dark palette          |
| Pink         | Pastel pink palette          | Related muted dark palette          |
| Violet       | Pastel violet palette        | Related muted dark palette          |
| Green        | Pastel green palette         | Related muted dark palette          |
| Yellow       | Pastel yellow palette        | Related muted dark palette          |
| Orange       | Pastel orange palette        | Related muted dark palette          |

Treat the selected color family and light/dark mode as separate preferences. Preserve the current light/dark toggle and existing saved preferences during rollout. Exact palettes, setting placement and persistence details belong to the later design review.

Choose compatible foreground colors for backgrounds, cards, inputs, dialogs, buttons and navigation. Verify readable contrast, visible focus and distinguishable disabled, warning and selected states in every palette. Normal text should meet WCAG AA 4.5:1 contrast; large text and relevant UI boundaries/indicators should meet their applicable 3:1 requirements. Color alone must not convey a status. Check both languages and existing text-size settings.

## V4-03 — quieter empty slots in the weekly menu

- Replace the visible **Not planned / Sin planificar** text with a quiet dash placeholder, such as `— — —`.
- Shorten **Suggest meal / Sugerir comida** to **Suggest / Sugerir**.
- Place the placeholder and Suggest action on the same row, including on narrow phones and with larger text.
- Retain an accessible description of the empty meal/date; the placeholder must not be the only information available to assistive technology.
- Preserve ordinary closed-day restrictions and the version-three copy/paste and swap destination behavior.

## V4-04 — simpler ingredient names

Remove preparation/reference-state qualifiers such as **raw**, **peeled**, **without shell** and **dry** from ordinary ingredient display names. Put that preparation information in the relevant recipes instead.

| Current style                         | Intended display style                             |
| ------------------------------------- | -------------------------------------------------- |
| Whole chicken egg, raw, without shell | Eggs                                               |
| Almonds, without shell                | Almonds                                            |
| Carrots, raw, peeled                  | Carrots                                            |
| Chickpeas, dry                        | Chickpeas                                          |
| Sun-dried tomatoes                    | Sun-dried tomatoes — retain the defining qualifier |

Apply this naming principle consistently to the ingredient catalogue, shopping checklist and ingredient selectors in both application languages. Recipe instructions and ingredient-preparation information must still explain the required state and weighing basis.

This is a presentation/content change: retain source names, nutritional reference state, conversions, identity and recorded historical references. Do not merge distinct nutritional records merely because their shorter labels resemble one another. Avoid blanket word deletion that would corrupt meaningful product names such as **sun-dried tomatoes**. Household-created text keeps the existing entered-language/manual-translation behavior.

## V4-05 — repair the calorie-target review action

Reported bug: the **Review your target** action does not work. Recorded as a functional defect; it has not been reproduced or diagnosed as part of this backlog update.

During implementation, identify the affected control and reproduce the issue with the person's own signed-in profile. Activation must open the intended calorie-target review flow, or show a specific actionable error instead of doing nothing. Preserve the existing eligibility rules, questionnaire, target/budget review and explicit acceptance; the repair must not automatically accept a new target or alter another person's personal settings. Add a regression check for the reproduced failure.

## V4-06 — simplify the home dashboard

- Remove the **Your week at a glance** weekly-menu preview block.
- Keep the existing **View week** action; a second weekly preview is unnecessary.
- Remove the shopping-list shortcut from the home dashboard.
- Keep the Menu and Shopping navigation tabs, today's meals and the calorie summary available.

## V4-07 — one shopping list for all upcoming meals

Remove the week/date-range selector from Shopping. Automatically combine ingredients from all upcoming planned meals, including plans beyond the currently viewed week. No manual interval application should be needed.

Working interpretation for later design review: include today's still-open meals as well as later dates. Continue using the authoritative shared-day cutoff; closed/expired days contribute nothing. This extends the existing [shopping expiry behavior](../version-3/milestone-1.md), rather than restoring past contributions.

Preserve automatic reconciliation after menu changes, compatible-quantity aggregation, checked-state decrease/increase rules and manual additions. Manual items remain independent of meal dates. Keep existing offline checks and synchronization guarantees. Reconcile existing lists during rollout without requiring browser-data clearing; assess backend/API compatibility and efficient querying when the technical design is prepared.

## V4-08 — give Sync now a button appearance

Render **Sync now / Sincronizar ahora** as an obvious button, consistent with the other actions and all theme variants, rather than as a text-like link.

Preserve its synchronization purpose, pending-change feedback, offline/busy behavior and safe retry semantics. It must remain keyboard accessible, visibly focused and touch friendly. Automatic synchronization and shopping generation must continue independently of this manual action.

## V4-09 — meal-card actions as icons

In the weekly Menu, replace **Review meal / Revisar comida** with a pencil icon and **Preview another recipe / Probar otra receta** with the matching dice icon.

Group the five meal actions at the bottom of each card in this order:

1. Pencil — review/edit the meal.
2. Dice — suggest another recipe.
3. Copy — copy the meal or individual breakfast; use the existing Paste state when a source is copied.
4. Eraser — remove the meal, preserving the existing confirmation and date permissions.
5. Up/down arrows — swap/move the meal or individual breakfast.

Replace **View recipe / Ver receta** with an eye icon. This is a separate read-only recipe action, not a sixth action in the five-icon bottom group. Its exact position can be settled during layout implementation.

Use the existing matching outline icon style, translated accessible names/tooltips, visible focus and touch-friendly targets. Preserve per-person breakfast behavior, overwrite review, ordinary closed-day restrictions and the version-three historical-correction boundary. The eraser applies only to its meal; it must not silently become Delete week or Erase day.

## V4-10 — one rectangular allocation bar for shared meals

Hide allocation graphics for all individual breakfasts. For lunch and dinner, replace the pie charts with **one segmented rectangular bar per meal**, rather than separate charts for sides, meat and plant-based substitutions. Preserve member colours, percentages, avatar identification and exact individual quantities.

The combined visualization must remain honestly labelled when people have different preparations. It must not imply that one percentage can be used to divide every side or substitution. The proposed calculation and review criteria are recorded in the design and milestone-one acceptance checks.

## Delivery boundary

These ten requests are reserved for version 4. This record introduces no runtime changes, migrations, palette assets or deployment, and does not claim the target-review bug is fixed. The linked design records implementation responsibilities, compatibility requirements and proposed milestone ordering. D4-01 (local themes) and D4-02 (editable estimated egg purchasing units) are confirmed. The working defaults above are explicitly distinguished from the user's requests.
