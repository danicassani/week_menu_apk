# Week Menu App — specification

Status: functional requirements documented and technical consistency review completed. See the [reviewed technical design](technical-design.md) and [review findings](technical-review.md). Source/content and visual deliverables are tracked below; implementation has not started.

Repository: danicassani/week_menu_apk

## 1. Purpose and scope

An installable web application for one household of adults, accessible from Android, iPhone, and desktop browsers over the Internet.

Suggest breakfasts, lunches, and dinners, support individual portions and dietary substitutions, estimate personal calorie budgets and daily deficits, and generate a shared shopping list from the final plan.

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

Removing a member revokes their access and recalculates unlocked current/future meal quantities for the remaining included household members. This is not a redistribution of the departed member's food: portions remain based on each remaining person's budgets and meal settings. Flag resulting shopping-list changes for review rather than applying them silently. After removal, retain the member's historical calorie, weight, and activity records for household history. The remaining household can still view those records; removal does not authorize others to edit the former member's personal records. Ownership transfer must be atomic so the household is never left without an owner or with two owners. Configure the initial owner's approved Google email during deployment. When a member leaves, delete their future-dated personal entries/settings while retaining past records and historical calculation references. Exclude the removed member from active planning and totals; deletion must not cascade into immutable history.

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

If another validation rule identifies an invalid or excessively restrictive goal, also explain it and ask for revision. The numerical activity factors and goal-to-deficit conversion are confirmed below. Input validation, versioning, and source-coverage handling are specified in the reviewed technical design; actual source coverage is verified during the relevant milestone. New weight measurements can trigger the previously agreed target-recalculation review.

### Recalculation

- People can record new weight measurements and change target dates.
- When these changes affect the estimate, show a revised daily target for acceptance.
- Acceptance includes reviewing that person's breakfast, lunch, and dinner budgets.
- Apply accepted changes from today onward.
- Preserve past records.
- Do not silently change meal portions when recalculating targets.
- When a new weight measurement reaches the goal weight, offer a maintenance target for review and acceptance rather than silently switching goals. Include breakfast, lunch, and dinner budget review in acceptance.

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

Reject invalid or non-finite inputs, nonpositive height/weight, past or same-day weight-loss deadlines, and a weight-loss target not below current weight. A reached goal instead triggers the maintenance-review flow. Document and verify source applicability during import; do not fabricate unavailable mappings.

Logged-day expenditure uses the separately confirmed replacement formula in section 4.

### Meal budgets and food outside planned meals

- Each person sets personal breakfast, lunch, and dinner calorie-budget defaults manually. Apply those defaults every day, with optional overrides for individual planned meals.
- People log food outside planned breakfast, lunch, and dinner, including snacks and drinks, by entering a description and total calories. Catalogue lookup for these entries is outside the first-version scope. Do not log a planned breakfast again as outside food.
- Warn if meal budgets or portions plus other logged food exceed the daily target.
- Warnings allow manual adjustments and do not block finalizing the plan.
- Planned breakfast, lunch, and dinner portions count automatically toward intake without a confirmation step.
- Display clearly that these totals assume planned portions were eaten.
- Count the day's planned meals in the full-day total as soon as planned, labelled as assumed intake. Future dates show projected totals; no meal-time scheduling or confirmation is required.
- An unfilled meal is not implicitly skipped: show a known-calorie subtotal and label the day's projection/deficit incomplete until its meal entries are provided. Meal budgets are an allocation check, not additional consumed calories.

## 4. Daily activity and calorie deficit

- Use the person's usual activity estimate until activities are logged for a date.
- There is no separate rest-day override in version one. Without logged activities, retain the usual activity estimate.
- Log individual activities and durations, with activity-specific pace or intensity choices (for example, leisurely versus brisk walking).
- Once a day has logged activities, replace that day's usual activity allowance with the logged-activity estimate.
- The override affects only that day's expenditure and deficit, not the baseline calorie target or other days.
- Estimate daily deficit as estimated expenditure minus accounted food calories.
- Do not count the same exercise in both the usual allowance and logged activities.

If the last activity entry is removed from an editable day, restore the usual activity estimate because that date no longer has logged activities. The confirmed calculation below defines the routine baseline and summed net activity energy. Use the Compendium of Physical Activities for source activity and pace/intensity energy estimates, with appropriate age-specific coverage. Preserve published MET values and source references, include attribution, and clearly label calculated expenditure as an estimate. Source and reuse guidance: https://pacompendium.com/ .

Exact imported activity coverage and intensity mappings are content/import deliverables, with source gaps reported explicitly under the technical design.

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

Breakfast is fully included in version one. Each member chooses an individual breakfast recipe, with a personal default calorie budget and individual meal overrides. It uses the same suggestion, portion, calorie-accounting, and reviewed shopping-list workflows. Lunch and dinner retain a shared recipe with personal portions and reviewed substitutions, except for members explicitly marked as eating out.

- Plan breakfast, lunch, and dinner.
- Each person's home-cooked meal uses one recipe in version one. Breakfast recipes are chosen individually; lunch and dinner share a recipe with personal variants. A recipe can include its side dishes and an optional dessert; multiple independently selected recipes for one person's meal are out of scope.
- Dessert selection is per person: some members can include the recipe's dessert while others skip it.
- For each person, proportionally scale the selected recipe components (main, sides, and dessert if included) toward their meal calorie budget, then allow manual ingredient-quantity edits.
- Include selected dessert ingredients and calories in portion calculations and shopping totals. Skipped dessert contributes neither quantities nor calories for that person.
- The household's planning-week start is configurable as Monday or Sunday, defaulting to Monday. This affects the weekly view and generation range, not the calendar dates of existing meals.
- Generate suggestions for a whole week or an individual meal.
- When generating a week, preserve existing planned meals by default and fill available slots. Offer an explicit option to replace existing meals; show a preview before applying the generated plan.
- Suggestions come from a starter collection of approximately 40–50 European and international everyday recipes, plus household-saved recipes.
- Provide the starter recipes in English and Spanish, with ingredient quantities and dietary metadata. Recipe content provenance and reuse rights must be recorded.
- Prioritize variety across the week, while respecting individual exclusions and calorie budgets.
- For lunch and dinner suggestions, do not repeat a main/base ingredient within any rolling three-calendar-day window. Breakfast is exempt. The household can configure the window length; default to three days. Apply the rule across week boundaries and against retained neighboring plans, rather than resetting it on Monday/Sunday. Use explicit main/base ingredient roles; minor ingredients do not trigger this rule.
- If no suitable recipe exists, tell the user and suggest adding more recipes. Do not silently relax exclusions or other enforced rules.
- A shared meal can have different ingredient quantities for each person.
- When suggesting a meal, scale recipe ingredient quantities proportionally toward each person's manually set breakfast, lunch, or dinner calorie budget. This provides the initial suggested portion; subsequent ingredient-amount edits remain manual.
- Recalculate calories for the actual quantities shown. Substitutions require review and their own calorie calculation; matching a calorie budget does not imply nutritional equivalence.
- A shared meal can have substitutions, such as tofu for one person and chicken for another.
- Suggest substitutions automatically from the ingredient catalogue.
- Require review before applying a suggested substitution.
- For concurrent edits to the same shared recipe or planned meal, reject a stale save and tell the second editor that the record changed. Require review of the latest version before saving; do not silently overwrite another member's changes.
- People can replace meals and manually edit ingredient quantities.
- Show calorie warnings and recalculate totals as quantities change.

Initial portion scaling is proportional to the individual's meal budget. Apply the confirmed unit-aware rounding rule:

- Quantities of at least 10 g/ml round to the nearest 10 g/ml.
- Smaller quantities use 1 g/ml precision.
- Countable units such as eggs retain sensible whole or fractional units using ingredient-specific conversions.
- Calculate calories from the final quantities actually saved and shown. If rounding changes the budget fit, show the existing warning and allow manual adjustment.
- Generate shopping requirements from those same final quantities, rather than separately rounded hidden values.

The configurable main/base-ingredient variety rule and curated substitution-matching contract are specified above and in the reviewed technical design; actual substitution metadata is prepared with starter content. No-match behavior is confirmed above. AI-generated recipes are not part of the agreed first-version scope.

### Eating out and food from bars/restaurants

- Any member's breakfast, lunch, or dinner can be marked as eating out instead of their home-cooked portion.
- Other members can keep their home-cooked portions for the same meal.
- Require a description and a manually entered calorie estimate; unknown or blank calories are not allowed.
- Count the entered estimate toward that person's meal and daily total, labelled as an estimate. Keep their meal budget and show warnings if appropriate.
- The eating-out entry replaces that person's planned home-cooked portion; never count both or also require a duplicate outside-food entry.
- Exclude the replaced home-cooked portion from generated shopping requirements. Flag the resulting shopping-list diff for review rather than applying it silently.
- Snacks and drinks outside these replacement meals continue to use the existing description-and-calories log.
- Preserve eating-out entries when generating a week by default, just like other existing meal entries.
- Individual breakfast choices and eating-out replacements follow the same planned-meal date-lock rule.

### Meal edits versus saved recipes

Ingredient-quantity edits affect only that planned meal by default.

After an edit, suggest updating the saved recipe through a separate action. Include a “Don't show again” preference, with a setting to enable the prompt again.

When updating a saved recipe, select one person's edited meal variant, specify its reference serving count, and preview the changes before applying a new recipe version. Do not merge different people's substitutions into a single base recipe. Existing planned quantities remain explicit meal variants; applying recipe-quantity changes to them requires a preview. Catalogue nutrition updates still recalculate unlocked meals using their saved quantities without automatically resizing portions.

## 6. Recipes and the shared ingredient catalogue

### Nutrition

- Import a curated starter ingredient set from the UK Composition of Foods Integrated Dataset (CoFID).
- Use the official downloadable dataset and its applicable Open Government Licence attribution requirements. Retain source food identifiers and release information.
- Provide English and Spanish names for the imported starter catalogue.
- All household members can add, edit, and delete catalogue items.
- Users select catalogue ingredients and enter quantities when saving recipes.
- Calculate recipe and portion calories from ingredient nutrition values.
- Default recipe, portion, and shopping quantities to raw/uncooked weights for ingredients that will be cooked, and as-purchased quantities for ready-to-eat ingredients.
- Match nutrition data to that same ingredient state. Do not apply cooked-food calories per 100 g to a raw quantity or guess raw/cooked conversions. Cooking instructions describe preparation after ingredient quantities are measured.
- Support grams, millilitres, and ingredient-specific units such as eggs and tablespoons.
- Each supported unit needs a defined conversion for that ingredient.
- Do not assume that millilitres equal grams for every ingredient.

The selected source is UK CoFID. Its official publication includes the dataset and user guide: https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid . The cited 2021 user guide permits reuse under the Open Government Licence v3.0, excluding logos. Preserve the required attribution and check the terms of the actual release imported.

Raw/as-purchased quantities are the default. Retain explicit ingredient-state metadata and correct source matching. Exact release selection, imported coverage, and the initial recipe collection still require import/content review. Retain source identifiers and distinguish household edits from original imported values. CoFID describes the UK food supply; it is not a guarantee of matching every European ingredient or branded product.

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
- Include final ingredient amounts across every person's home-cooked breakfast, lunch, and dinner portions and substitutions. Eating-out replacements contribute no ingredient requirements.
- Combine quantities only when ingredients and units are compatible.
- Support shared checked/unchecked states and manual additions.
- No pantry inventory or automatic stock subtraction in the first version.
- If meals or portions change, indicate that list updates are available.
- Let a member review and apply changes; do not silently regenerate the list.
- Changing the shopping date range preserves checked states for surviving generated ingredients under the normal increase/decrease rules. Keep manual additions and their states; do not automatically start an unchecked shopping round.
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

Reviewed implementation approach:

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

- Today's breakfast, lunch, and dinner.
- A preview of the shared weekly menu.
- A calorie summary.
- A shortcut to the shared shopping list.

Today follows the current device timezone. The calorie summary defaults to the signed-in person, with a member selector to view another household member. Selecting another member does not grant editing rights to that person's profile or personal logs. Use a minimalistic black-and-white design with both light and dark modes. Detailed dashboard composition remains open; visual refinement can follow later.

### Confirmed mobile navigation

| Main destination | Contents |
| --- | --- |
| Dashboard | Today's meals, personal calorie summary with member selector, weekly preview, shopping shortcut, and quick food/activity logging |
| Menu | Weekly breakfast/lunch/dinner plan, generation previews, meal replacements, portions, and substitutions |
| Shopping | The one shared list, date range, update review, and offline checkbox status |
| Recipes | Starter and saved recipes, recipe editor, and ingredient catalogue management |
| Profile | Personal measurements, goal and calorie-budget settings, weight/activity history, language, and household settings |

On phones, the Menu tab displays a vertical list of seven day cards for the selected week. Each card shows breakfast, lunch, and dinner; scroll vertically through the week. Use the household's configurable Monday/Sunday week start, with Monday as the default. Meal editing, portions, and substitutions remain part of the meal-detail workflow.

Use a labelled bottom navigation on mobile, with an equivalent layout suitable for larger screens. All destinations follow the previously agreed household visibility and editing permissions; viewing a member's health history does not grant editing rights. The initial visual design is deliberately minimalistic and monochrome (black and white), with light and dark modes. More elaborate visual refinement is deferred.

### Supporting screens

These screens organize the confirmed workflows under the approved five-tab navigation. Detailed composition is produced and reviewed in the relevant milestone within the agreed minimalistic monochrome design.

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

## 11. Required verification scenarios

These scenarios guide implementation checks during the relevant milestones. No application test execution is claimed by this document.

- An unapproved Google account cannot read household information.
- A member can view another member's shared health data but cannot edit their personal logs or profile.
- Different portions and reviewed substitutions produce correct per-person calories and shopping totals.
- Quantities use the confirmed 10 g/ml, 1 g/ml, and countable-unit rounding policies; displayed quantities, stored calorie calculations, and shopping contributions agree.
- A meal can include dessert for one member and omit it for another; calories, scaled portions, and shopping totals reflect each person's selection.
- Breakfast can use different recipes for different members, with each contributing the correct ingredients to the same shopping list.
- An eating-out entry requires a manual calorie estimate, replaces only that member's home-cooked portion, avoids double counting, and produces a reviewable shopping diff.
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
- Retrying an already acknowledged operation does not overwrite a newer checkbox state.
- Shopping date-range changes retain surviving checked states under the same quantity-change rules.
- Missing meal slots produce explicitly incomplete daily projections rather than a misleading zero-calorie complete day.
- A queued checkbox change for a removed item is discarded with a notice without preventing other valid changes from synchronizing.
- Sign-out with pending shopping changes requires synchronization or explicit discard; completed sign-out clears cached household data.
- Both languages cover all first-version interface workflows.

## 12. Review outcome and delivery artifacts

The technical consistency review is complete; see [technical-review.md](technical-review.md). The [technical design](technical-design.md) defines the data model, permissions, source/version propagation, two levels of date locking, stale-edit handling, decimal quantity calculation, and idempotent offline operations.

No unresolved product decision blocks the implementation blueprint. Changing a shopping date range preserves surviving checked states, as confirmed during review. The existing stack, formulas, scope, and milestone sequence are retained.

Remaining deliverables belong to the agreed milestones:

1. The [starter food source manifest](../content/starter/source-manifest.json) now pins CoFID 2021 and records attribution/coverage gaps. Compendium activity coverage and its import manifest remain a separate delivery.
2. The [starter food pack](starter-content.md) now contains 97 ingredients, initial conversions/variety keys, 19 contextual substitution candidates, and 48 bilingual recipes including 12 breakfasts. Household product-label, reference-piece and kitchen review remain; the source/data validator has passed.
3. Minimalistic screen composition, language/status text, and light/dark accessibility.
4. Database migrations, application code, and the calculation/permission/history/offline integration checks specified in the technical design.
5. The initial owner's Google email, OAuth callback configuration, hosting accounts, and deployment configuration when setup is authorized.

These are content, design, setup, and implementation artifacts rather than a new feature questionnaire. Milestone review remains required. Starter food preparation and source/data validation are complete as a separate authorized content task; no application code, database import, hosting provisioning or application tests have been completed.

## 13. Confirmed delivery sequence

All milestones contribute to the same agreed version-one scope. Review the result with the user after each milestone before proceeding to the next. Documentation approval does not itself authorize implementation.

1. Foundation and personal calculations: authenticated invitation-only household, ownership permissions, adult profiles, both interface languages, Mifflin–St Jeor targets, screening, budget defaults/overrides, food/activity/weight records, and recalculation/maintenance review.
2. Recipes and meal planning: attributed CoFID import, ingredient editing/conversions/archiving, 40–50 bilingual starter recipes, household recipes, shared weekly plans, suggestions, proportional portions, reviewed substitutions, stale-edit handling, and immutable history.
3. Shopping and installable experience: generated shopping quantities, manual additions, reviewed updates, dashboard integration, PWA installation, offline cached views, and queued checkbox synchronization.
4. Release verification: complete representative household workflows; verify authorization, calorie and unit arithmetic, historical locking, concurrent changes, offline reconnection, English/Spanish coverage, and Android/iPhone browser and home-screen behavior. Configure hosting and a controlled first release when authorized.

Run the relevant checks during each milestone; the final phase verifies the integrated application. Do not defer permission or calculation correctness checks until release.

## 14. Outside version one

- Guest diners or guest accounts.
- Multiple independently selected recipes for one person's meal; breakfast recipes may differ between members, and one recipe may include sides and an optional dessert.
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
