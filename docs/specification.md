# Week Menu App — specification

Status: working draft. Confirmed decisions are recorded below. Proposed design details and unresolved questions are explicitly marked; this document is not approval to begin implementation.

Repository: danicassani/week_menu_apk

## 1. Purpose and scope

An installable web application for one household of adults, accessible from Android, iPhone, and desktop browsers over the Internet.

Suggest lunches and dinners, support individual portions and dietary substitutions, estimate personal calorie budgets and daily deficits, and generate a shared shopping list from the final plan.

Use the current active, onboarded household roster when planning new meals, rather than choosing member attendance separately for every meal. A newly invited member joins only newly planned meals after completing their profile and calorie budgets; leave existing planned meals unchanged. Removing a member recalculates unlocked meal quantities for the remaining included members; past days and locked shared meals remain unchanged. Guests and guest portions are outside version-one scope.

## 2. Access, ownership, and visibility

- Google sign-in only.
- Access is restricted to email addresses approved by the household owner.
- One owner invites and removes members.
- The owner can transfer ownership to another active member. The household must always have exactly one owner; transfer ownership before the current owner leaves.
- New members are included only in newly planned meals after onboarding, without modifying existing planned meals.
- All members can edit shared meals, saved recipes, the ingredient catalogue, and the shopping list.
- Each person controls edits to their own profile, calorie budgets, weight measurements, and activity logs.
- Meal portions, calorie budgets, daily totals, weight measurements, and activity logs are visible to all household members.
- Adult profiles only.
- Permission checks must be enforced by the backend, not only hidden interface controls.

Removing a member revokes their access and recalculates unlocked current/future meal quantities for the remaining included household members. This is not a redistribution of the departed member's food: portions remain based on each remaining person's budgets and meal settings. Flag resulting shopping-list changes for review rather than applying them silently. After removal, retain the member's historical calorie, weight, and activity records for household history. The remaining household can still view those records; removal does not authorize others to edit the former member's personal records. Ownership transfer must be atomic so the household is never left without an owner or with two owners. Owner bootstrap and treatment of any future-dated personal entries after removal remain open.

## 3. Profiles, goals, and calorie targets

### Confirmed questionnaire inputs

- Current weight in kilograms (kg).
- Height in centimetres (cm).
- Personal profiles use metric units only in version one; imperial input/display is out of scope.
- Age.
- Sex as the physiological input to the calculation.
- Goal: lose weight or maintain weight.
- Target weight and target date for weight loss.
- Usual activity level: sedentary, lightly active, active, or very active.
- Individual dietary patterns (including vegetarianism), plus optional exclusions of specific catalogue ingredients. Apply both to recipe and substitution suggestions.
- Preferred interface language: English or Spanish.

Calorie targets are estimates, not guarantees of reaching a particular weight by a date.

Version one uses the simplified Mifflin–St Jeor equation to estimate resting energy expenditure, accounts for usual activity, and applies an approximate weight-loss budget derived from the goal and time available.

Resting energy estimate in kcal/day, with weight in kg, height in cm, and age in years:

- Male: 10 × weight + 6.25 × height − 5 × age + 5.
- Female: 10 × weight + 6.25 × height − 5 × age − 161.

This estimates resting expenditure, not total daily expenditure. Source: Mifflin et al., 1990, https://pubmed.ncbi.nlm.nih.gov/2305711/ . For maintenance, estimate maintenance intake without a weight-loss deficit. The target date is an approximate planning goal, not a prediction of reaching that weight on that date. A dynamic weight-change model is outside version-one scope.

Initial goal-screening rules for version one:

- Reject a weight-loss goal implying more than 1 kg of loss per week.
- Reject a calculated calorie-intake target of 1,200 kcal/day or less.
- Explain the failed check and ask the person to revise the goal or deadline; do not silently clamp to a different target.
- Passing these screening rules does not establish that a target is appropriate for every individual.

These app rules draw on NHS gradual weight-loss guidance and NICE guidance restricting low-energy diets to supported specialist care:

- https://www.nhs.uk/conditions/overweight-and-obesity/
- https://www.nice.org.uk/guidance/ng246/chapter/Physical-activity-and-diet

If another validation rule identifies an invalid or excessively restrictive goal, also explain it and ask for revision. The numerical activity factors and goal-to-deficit conversion are confirmed below. Additional applicability constraints and validation details still require review. New weight measurements can trigger the previously agreed target-recalculation review.

### Recalculation

- People can record new weight measurements and change target dates.
- When these changes affect the estimate, show a revised daily target for acceptance.
- Acceptance includes reviewing that person's lunch and dinner budgets.
- Apply accepted changes from today onward.
- Preserve past records.
- Do not silently change meal portions when recalculating targets.
- When a new weight measurement reaches the goal weight, offer a maintenance target for review and acceptance rather than silently switching goals. Include lunch and dinner budget review in acceptance.

### Confirmed numerical conventions

The following conventions are confirmed for version one's simple estimation model. They are coarse planning estimates, not measured expenditure or individualized medical advice:

| Usual activity | Resting-energy multiplier |
| --- | --- |
| Sedentary | 1.2 |
| Lightly active | 1.375 |
| Active | 1.55 |
| Very active | 1.725 |

Usual daily expenditure = Mifflin–St Jeor resting estimate × selected multiplier. Activity categories are coarse estimates, not measured expenditure.

Weight-loss planning deficit = (current weight − target weight) × 7,700 / calendar days until target date, in kcal/day. Subtract this from usual estimated daily expenditure to propose an intake target. Maintenance uses no weight-loss deficit. Run screening on unrounded results before presenting a target.

The 7,700 kcal/kg conversion is a deliberately simplified planning approximation. It does not model changing body composition, water weight, or metabolic adaptation and must not be presented as a reliable weight forecast. Research on its limitations: https://pmc.ncbi.nlm.nih.gov/articles/PMC3810417/ .

Reject invalid or non-finite inputs, nonpositive height/weight, past or same-day weight-loss deadlines, and a weight-loss target not below current weight. A reached goal instead triggers the maintenance-review flow. Other applicability constraints still require review.

Logged-day expenditure uses the separately confirmed replacement formula in section 4.

### Meal budgets and food outside planned meals

- Each person sets personal lunch and dinner calorie-budget defaults manually. Apply those defaults every day, with optional overrides for individual planned meals.
- People log food outside lunch and dinner, including breakfast, snacks, and drinks, by entering a description and total calories. Catalogue lookup for these entries is outside the first-version scope.
- Warn if meal budgets or portions plus other logged food exceed the daily target.
- Warnings allow manual adjustments and do not block finalizing the plan.
- Planned lunch and dinner portions count automatically toward intake without a confirmation step.
- Display clearly that these totals assume planned portions were eaten.
- Count the day's planned meals in the full-day total as soon as planned, labelled as assumed intake. Future dates show projected totals; no meal-time scheduling or confirmation is required.

## 4. Daily activity and calorie deficit

- Use the person's usual activity estimate until activities are logged for a date.
- There is no separate rest-day override in version one. Without logged activities, retain the usual activity estimate.
- Log individual activities and durations, with activity-specific pace or intensity choices (for example, leisurely versus brisk walking).
- Once a day has logged activities, replace that day's usual activity allowance with the logged-activity estimate.
- The override affects only that day's expenditure and deficit, not the baseline calorie target or other days.
- Estimate daily deficit as estimated expenditure minus accounted food calories.
- Do not count the same exercise in both the usual allowance and logged activities.

If the last activity entry is removed from an editable day, restore the usual activity estimate because that date no longer has logged activities. The detailed calculation must define routine movement, net versus gross activity energy, and multiple activities. Use the Compendium of Physical Activities for source activity and pace/intensity energy estimates, with appropriate age-specific coverage. Preserve published MET values and source references, include attribution, and clearly label calculated expenditure as an estimate. Source and reuse guidance: https://pacompendium.com/ .

Exact imported activity coverage and intensity mappings still require a calculation specification.

### Confirmed logged-day calculation

For a date with at least one logged activity, use:

- Baseline daily living expenditure = resting-energy estimate × 1.2.
- Each activity's estimated additional energy = max(MET − 1, 0) × weight in kg × duration in hours.
- Logged-day expenditure = baseline daily living expenditure + the sum of additional activity energy.

This is a simple app convention: subtracting one MET removes the standard resting component of the activity estimate because the daily baseline already includes resting expenditure. Routine movement remains approximated by the sedentary baseline. Use additional exercise entries rather than a second full-day living/activity log; estimates can still differ from actual expenditure.

Replace, rather than add to, expenditure calculated from the usual multiplier. Logging a small amount of exercise can therefore produce a lower total than the usual active/very-active estimate. The person must log all relevant additional activities for a useful daily override. This affects only the date's estimated deficit and does not increase the accepted intake target or automatically resize meals.

Example: resting estimate 1,600 kcal/day, weight 70 kg, and 30 minutes at 4 MET gives baseline 1,920 + additional activity 105 = 2,025 kcal estimated expenditure. This illustrates arithmetic, not a personal prescription.

This formula is confirmed for version one. Use the Compendium's standard MET-based energy convention; the values remain estimates.

## 5. Meal planning and suggestions

- Plan lunch and dinner.
- Each meal uses one recipe in version one. A recipe can include its side dishes and an optional dessert; multiple independently selected recipes within a meal are out of scope.
- Dessert selection is per person: some members can include the recipe's dessert while others skip it.
- For each person, proportionally scale the selected recipe components (main, sides, and dessert if included) toward their meal calorie budget, then allow manual ingredient-quantity edits.
- Include selected dessert ingredients and calories in portion calculations and shopping totals. Skipped dessert contributes neither quantities nor calories for that person.
- The household's planning-week start is configurable as Monday or Sunday, defaulting to Monday. This affects the weekly view and generation range, not the calendar dates of existing meals.
- Generate suggestions for a whole week or an individual meal.
- When generating a week, preserve existing planned meals by default and fill available slots. Offer an explicit option to replace existing meals; show a preview before applying the generated plan.
- Suggestions come from a starter collection of approximately 40–50 European and international everyday recipes, plus household-saved recipes.
- Provide the starter recipes in English and Spanish, with ingredient quantities and dietary metadata. Recipe content provenance and reuse rights must be recorded.
- Prioritize variety across the week, while respecting individual exclusions and calorie budgets.
- A shared meal can have different ingredient quantities for each person.
- When suggesting a meal, scale recipe ingredient quantities proportionally toward each person's manually set lunch or dinner calorie budget. This provides the initial suggested portion; subsequent ingredient-amount edits remain manual.
- Recalculate calories for the actual quantities shown. Substitutions require review and their own calorie calculation; matching a calorie budget does not imply nutritional equivalence.
- A shared meal can have substitutions, such as tofu for one person and chicken for another.
- Suggest substitutions automatically from the ingredient catalogue.
- Require review before applying a suggested substitution.
- For concurrent edits to the same shared recipe or planned meal, reject a stale save and tell the second editor that the record changed. Require review of the latest version before saving; do not silently overwrite another member's changes.
- People can replace meals and manually edit ingredient quantities.
- Show calorie warnings and recalculate totals as quantities change.

Initial portion scaling is proportional to the individual's meal budget. Practical quantity rounding, the recipe-selection algorithm, definition of variety, substitution suitability rules, and behavior when no suitable recipe exists remain to be specified. AI-generated recipes are not part of the agreed first-version scope.

### Meal edits versus saved recipes

Ingredient-quantity edits affect only that planned meal by default.

After an edit, suggest updating the saved recipe through a separate action. Include a “Don't show again” preference, with a setting to enable the prompt again.

When updating a saved recipe, select one person's edited meal variant, specify its reference serving count, and preview the changes before applying a new recipe version. Do not merge different people's substitutions into a single base recipe.

## 6. Recipes and the shared ingredient catalogue

### Nutrition

- Import a curated starter ingredient set from the UK Composition of Foods Integrated Dataset (CoFID).
- Use the official downloadable dataset and its applicable Open Government Licence attribution requirements. Retain source food identifiers and release information.
- Provide English and Spanish names for the imported starter catalogue.
- All household members can add, edit, and delete catalogue items.
- Users select catalogue ingredients and enter quantities when saving recipes.
- Calculate recipe and portion calories from ingredient nutrition values.
- Support grams, millilitres, and ingredient-specific units such as eggs and tablespoons.
- Each supported unit needs a defined conversion for that ingredient.
- Do not assume that millilitres equal grams for every ingredient.

The selected source is UK CoFID. Its official publication includes the dataset and user guide: https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid . The cited 2021 user guide permits reuse under the Open Government Licence v3.0, excluding logos. Preserve the required attribution and check the terms of the actual release imported.

Exact release selection, raw/cooked food distinctions, imported coverage, and the initial recipe collection remain open. Retain source identifiers and distinguish household edits from original imported values. CoFID describes the UK food supply; it is not a guarantee of matching every European ingredient or branded product.

### Edits, archiving, and history

- Editing nutrition values updates recipes, today's meals, and future meals that use the ingredient, except for shared meal dates already locked under the timezone rule.
- Preserve the values recorded for past days.
- Deleting an ingredient archives it: hide it from new selections while keeping existing references.
- Past days are read-only in the first version: portions, outside-food entries, weight measurements, activity logs, and other historical records cannot be corrected. This restriction may be revisited later.
- Lock a shared meal date for the whole household as soon as that calendar date has ended for any member. Snapshot its portion quantities, ingredients, substitutions, and nutritional values so later catalogue or recipe changes cannot alter the recorded meals.
- The lock takes precedence over updates to today's meals: a member whose device is still on that date can view the locked meals but cannot edit them.
- This shared-meal lock does not itself move another member's personal outside-food, weight, or activity records into the past; their own local day boundary governs those personal records.

### Language

The app supports English and Spanish, selectable per person. Provide starter content in both English and Spanish. Household-created content stays in its original language, with optional manual translations. Automatic translation through an external service is outside the agreed scope.

## 7. Shared shopping list

- Maintain just one shared shopping list.
- Choose a date range and generate its contents.
- Include final ingredient amounts across every person's portions and substitutions.
- Combine quantities only when ingredients and units are compatible.
- Support shared checked/unchecked states and manual additions.
- No pantry inventory or automatic stock subtraction in the first version.
- If meals or portions change, indicate that list updates are available.
- Let a member review and apply changes; do not silently regenerate the list.
- When an applied update increases the required quantity of an item marked as bought, uncheck the item and highlight its increased quantity. Do not change its checked state before the reviewed update is applied.

Quantity increases for checked items follow the uncheck-and-highlight rule above. When applying reviewed updates, reduce quantities or remove menu-generated entries that are no longer required. Preserve checked states on remaining entries unless their quantity increases. Always preserve manual additions as separate entries so menu regeneration cannot remove or change them. Multiple shopping lists are outside the first-version scope.

## 8. Offline behavior

- View the last loaded menu, recipes, and shopping list offline.
- Allow shopping items to be checked and unchecked offline.
- Synchronize those checkbox changes after reconnection.
- Other edits require an Internet connection.
- Show when displayed information is cached and when checkbox changes are pending.

For a shared shopping checkbox, the last change accepted by the server wins, including a queued offline change. Preserve the final local checked/unchecked intent rather than replaying an ambiguous toggle. If a queued checkbox change refers to an item removed before reconnection, discard that outdated change, show a notice, and continue synchronizing the remaining valid changes. Do not recreate the removed item.

If sign-out is requested with unsynchronized shopping changes, warn and let the person reconnect to synchronize or explicitly discard the changes before signing out. After sign-out, clear cached household data for that account. On detected membership revocation, stop synchronization and clear cached household data. A disconnected device cannot be cleared remotely. Offline caches cannot be remotely erased from a disconnected device.

### Timezones

Shared menu entries belong to a calendar date: Friday lunch stays on Friday for every member, regardless of timezone. Each person's current device timezone determines their Today view and local day boundaries. For server-side locking, use the last reported device IANA timezone, since a disconnected device's current zone cannot be known. Never reopen a locked meal date after a timezone change. Meals are not shifted to different calendar dates by timezone conversion. Shared meals for a calendar date lock for everyone when that date first ends for any household member, even if it is still Today for others. Once locked, later timezone changes must not reopen the meals. Personal logs follow the owner's local day boundary.

## 9. Confirmed technical stack

| Concern | Decision |
| --- | --- |
| Application | Installable responsive web app (PWA) |
| Interface | React and TypeScript |
| Web hosting | Cloudflare Pages |
| Database | Supabase PostgreSQL |
| Sign-in | Supabase Auth with Google |
| Shared updates | Supabase-backed synchronization |
| Source control | GitHub: danicassani/week_menu_apk |
| Initial service tiers | Free plans, subject to limits |

The browser loads the application from Cloudflare Pages and uses Supabase for authenticated data access. Backend policies enforce membership and edit permissions.

Proposed implementation approach, not yet approved in detail:

- Cache the app shell and explicitly loaded menu, recipe, and shopping data.
- Persist pending checkbox state changes locally and synchronize on reconnection.
- Keep nutrition calculations in testable modules with explicit formula versions.
- Use historical snapshots or versions so catalogue edits do not rewrite past days.
- Enforce membership and personal-write restrictions with database policies and server-side validation.
- Use atomic database operations where changes must remain consistent.
- Keep deployment credentials and actual household data out of the public GitHub repository.

No hosting resources have been provisioned and no application code has been implemented as part of this specification.

### Plan limitations to revisit before deployment

- Supabase Free projects can pause after a week of inactivity.
- Supabase Free currently lists 500 MB database storage.
- Cloudflare Pages Free currently allows 500 builds per month.
- Free-tier availability is not a promise of indefinite zero cost.
- No paid upgrade is authorized by this document.

References:

- https://supabase.com/pricing
- https://supabase.com/docs/guides/database/overview
- https://developers.cloudflare.com/pages/platform/limits/

## 10. Screens and navigation

### Confirmed opening screen

After sign-in and any required initial setup, open a dashboard containing:

- Today's lunch and dinner.
- A preview of the shared weekly menu.
- A calorie summary.
- A shortcut to the shared shopping list.

Today follows the current device timezone. The calorie summary defaults to the signed-in person, with a member selector to view another household member. Selecting another member does not grant editing rights to that person's profile or personal logs. The detailed dashboard layout remains open.

### Confirmed mobile navigation

| Main destination | Contents |
| --- | --- |
| Dashboard | Today's meals, personal calorie summary with member selector, weekly preview, shopping shortcut, and quick food/activity logging |
| Menu | Weekly lunch/dinner plan, generation previews, meal replacements, portions, and substitutions |
| Shopping | The one shared list, date range, update review, and offline checkbox status |
| Recipes | Starter and saved recipes, recipe editor, and ingredient catalogue management |
| Profile | Personal measurements, goal and calorie-budget settings, weight/activity history, language, and household settings |

On phones, the Menu tab displays a vertical list of seven day cards for the selected week. Each card shows lunch and dinner; scroll vertically through the week. Use the household's configurable Monday/Sunday week start, with Monday as the default. Meal editing, portions, and substitutions remain part of the meal-detail workflow.

Use a labelled bottom navigation on mobile, with an equivalent layout suitable for larger screens. All destinations follow the previously agreed household visibility and editing permissions; viewing a member's health history does not grant editing rights. Exact visual design is still open.

### Other proposed screens

These screens organize the confirmed workflows under the approved five-tab navigation. Detailed screen layouts remain open for review.

1. Google sign-in and invitation/access status.
2. Profile questionnaire and initial target/budget review.
3. Weekly menu with personal portions, substitutions, and calorie summaries.
4. Meal editor and suggestion/substitution review.
5. Shared recipe collection and recipe editor.
6. Ingredient catalogue, nutrition values, conversions, and archive controls.
7. Daily summary and outside-food/activity logging.
8. Weight history, goal settings, and recalculation review.
9. Shopping list, pending menu changes, and offline sync status.
10. Settings: language, recipe-update prompt, and owner membership controls.

## 11. Proposed verification scenarios

These are acceptance-test candidates for review before implementation.

- An unapproved Google account cannot read household information.
- A member can view another member's shared health data but cannot edit their personal logs or profile.
- Different portions and reviewed substitutions produce correct per-person calories and shopping totals.
- A meal can include dessert for one member and omit it for another; calories, scaled portions, and shopping totals reflect each person's selection.
- Dietary-pattern rules and individual ingredient exclusions apply to recipes and proposed substitutions.
- Generating a week preserves existing meals by default, and replacement requires an explicit choice and preview.
- A stale recipe or meal save is rejected with a review flow instead of overwriting another member's edits.
- Ingredient edits update today's and future unlocked plans without changing past recorded totals or locked shared meals.
- Shared meals lock for everyone as soon as their date ends for any member, including members whose device still shows that date as Today.
- Attempts to edit past days are rejected by backend validation as well as disabled in the interface.
- Archiving an ingredient preserves existing recipes and meals.
- Accepting a new target includes budget review and leaves past targets intact.
- Personal meal-budget defaults apply across dates, with individual meal overrides.
- Reaching goal weight offers a maintenance target for acceptance rather than automatically changing the goal.
- Logging activity replaces only the selected day's usual activity allowance.
- Menu edits produce a reviewable shopping-list change rather than overwriting the list.
- Applying a quantity increase to an item marked as bought unchecks it and highlights the increased quantity; merely previewing the update does not change the live checklist.
- Offline checkbox changes persist through an app restart and synchronize after reconnection.
- A queued checkbox change for a removed item is discarded with a notice without preventing other valid changes from synchronizing.
- Sign-out with pending shopping changes requires synchronization or explicit discard; completed sign-out clears cached household data.
- Both languages cover all first-version interface workflows.

## 12. Remaining specification work

Breakfast scope is under discussion: decide whether to add planned breakfast recipes or a dedicated breakfast budget/log, and whether any breakfast planning is personal or shared. Until resolved, the confirmed planner still covers lunch and dinner.

The [technical-design draft](technical-design.md) consolidates the proposed data model, history enforcement, recipe-generation behavior, offline synchronization, and verification approach. Its proposals require review and do not change the confirmed decisions.

1. UK CoFID release/coverage and attribution implementation, starter recipe provenance, and Compendium release/age-specific activity coverage.
2. Additional applicability and validation details for Mifflin–St Jeor. Activity factors, the 7,700 kcal/kg planning approximation, and the >1 kg/week and <=1,200 kcal/day rejection rules are confirmed.
3. Practical rounding of proportionally scaled portion quantities. The sedentary-baseline-plus-net-activity override formula is confirmed.
4. Technical enforcement of the confirmed earliest-member-midnight lock for shared meals and local-day locking for personal records. Past-day corrections are excluded from version one.
5. Implementation of cache clearing on detected membership revocation, now confirmed as the required behavior. Removed-item offline changes are discarded with a notice while valid changes sync; sign-out requires syncing or explicit discard before cache clearing. Recipe/meal conflicts require review; checkbox conflicts use server acceptance order.
6. Owner bootstrap and treatment of future-dated personal entries after member removal. Ownership transfer and new-member effects on existing meals are confirmed. Guests are excluded from version one.
7. Bilingual starter-content coverage and the optional manual-translation workflow.
8. Practical rounding, display, and matching of compatible ingredient quantities in shopping-list review.
9. Detailed screen layouts and technical-design review. Five-tab navigation and the four-milestone sequence, with a user review after each milestone, are confirmed.

Confirmed requirements above remain valid while these details are resolved. Source mapping, storage, consistency, and test design can be proposed as engineering details rather than requiring a separate product question for every implementation choice.

## 13. Confirmed delivery sequence

All milestones contribute to the same agreed version-one scope. Review the result with the user after each milestone before proceeding to the next. Documentation approval does not itself authorize implementation.

1. Foundation and personal calculations: authenticated invitation-only household, ownership permissions, adult profiles, both interface languages, Mifflin–St Jeor targets, screening, budget defaults/overrides, food/activity/weight records, and recalculation/maintenance review.
2. Recipes and meal planning: attributed CoFID import, ingredient editing/conversions/archiving, 40–50 bilingual starter recipes, household recipes, shared weekly plans, suggestions, proportional portions, reviewed substitutions, stale-edit handling, and immutable history.
3. Shopping and installable experience: generated shopping quantities, manual additions, reviewed updates, dashboard integration, PWA installation, offline cached views, and queued checkbox synchronization.
4. Release verification: complete representative household workflows; verify authorization, calorie and unit arithmetic, historical locking, concurrent changes, offline reconnection, English/Spanish coverage, and Android/iPhone browser and home-screen behavior. Configure hosting and a controlled first release when authorized.

Run the relevant checks during each milestone; the final phase verifies the integrated application. Do not defer permission or calculation correctness checks until release.

## 14. Outside version one

- Guest diners or guest accounts.
- Multiple independently selected recipes per meal; one recipe may include sides and an optional dessert.
- Multiple households or public self-registration.
- Native app-store applications.
- Pantry inventory and automatic stock subtraction.
- AI-generated recipes.
- Weight-gain targets.
- Imperial profile units.
- Editing past days.
- Offline edits beyond shopping checkboxes.
- Automatic translation of household-created content.

Future reconsideration does not change the initial scope without an explicit decision.
