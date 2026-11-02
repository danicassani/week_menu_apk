# Week Menu App — specification

Status: working draft. Confirmed decisions are recorded below. Proposed design details and unresolved questions are explicitly marked; this document is not approval to begin implementation.

Repository: danicassani/week_menu_apk

## 1. Purpose and scope

An installable web application for one household of adults, accessible from Android, iPhone, and desktop browsers over the Internet.

Suggest lunches and dinners, support individual portions and dietary substitutions, estimate personal calorie budgets and daily deficits, and generate a shared shopping list from the final plan.

The household plans meals for a fixed household size, rather than choosing attendance separately for every meal. How membership changes affect future plans remains to be specified.

## 2. Access, ownership, and visibility

- Google sign-in only.
- Access is restricted to email addresses approved by the household owner.
- One owner invites and removes members.
- All members can edit shared meals, saved recipes, the ingredient catalogue, and the shopping list.
- Each person controls edits to their own profile, calorie budgets, weight measurements, and activity logs.
- Meal portions, calorie budgets, daily totals, weight measurements, and activity logs are visible to all household members.
- Adult profiles only.
- Permission checks must be enforced by the backend, not only hidden interface controls.

Owner bootstrap, ownership transfer, removal effects, and handling personal information after removal are open decisions.

## 3. Profiles, goals, and calorie targets

### Confirmed questionnaire inputs

- Current weight.
- Height.
- Age.
- Sex as the physiological input to the calculation.
- Goal: lose weight or maintain weight.
- Target weight and target date for weight loss.
- Usual activity level: sedentary, lightly active, active, or very active.
- Individual dietary exclusions, including vegetarianism.
- Preferred interface language: English or Spanish.

Calorie targets are estimates, not guarantees of reaching a particular weight by a date.

The app estimates a daily calorie target from the questionnaire. If the goal and deadline would require excessive restriction, explain the problem and ask the person to revise their goal or deadline. Exact equations, activity factors, validation rules, and applicable exclusions require a separately reviewed calculation specification.

### Recalculation

- People can record new weight measurements and change target dates.
- When these changes affect the estimate, show a revised daily target for acceptance.
- Acceptance includes reviewing that person's lunch and dinner budgets.
- Apply accepted changes from today onward.
- Preserve past records.
- Do not silently change meal portions when recalculating targets.

### Meal budgets and food outside planned meals

- Each person sets lunch and dinner calorie budgets manually.
- People log calories consumed outside lunch and dinner, including breakfast, snacks, and drinks.
- Warn if meal budgets or portions plus other logged food exceed the daily target.
- Warnings allow manual adjustments and do not block finalizing the plan.
- Planned lunch and dinner portions count automatically toward intake without a confirmation step.
- Display clearly that these totals assume planned portions were eaten.
- Distinguish scheduled future intake from intake attributed to elapsed meals; the exact timing rule is still open.

## 4. Daily activity and calorie deficit

- Use the person's usual activity estimate until activities are logged for a date.
- Log individual activities and durations.
- Once a day has logged activities, replace that day's usual activity allowance with the logged-activity estimate.
- The override affects only that day's expenditure and deficit, not the baseline calorie target or other days.
- Estimate daily deficit as estimated expenditure minus accounted food calories.
- Do not count the same exercise in both the usual allowance and logged activities.

The detailed calculation must define resting expenditure, routine movement, net versus gross activity energy, multiple activities, and behavior after the last activity entry is removed. Activity-energy sources and estimation formulas are open.

## 5. Meal planning and suggestions

- Plan lunch and dinner.
- Generate suggestions for a whole week or an individual meal.
- Suggestions come from a starter recipe collection and household-saved recipes.
- Prioritize variety across the week, while respecting individual exclusions and calorie budgets.
- A shared meal can have different ingredient quantities for each person.
- A shared meal can have substitutions, such as tofu for one person and chicken for another.
- Suggest substitutions automatically from the ingredient catalogue.
- Require review before applying a suggested substitution.
- People can replace meals and manually edit ingredient quantities.
- Show calorie warnings and recalculate totals as quantities change.

The suggestion algorithm, definition of variety, substitution suitability rules, and behavior when no suitable recipe exists remain to be specified. AI-generated recipes are not part of the agreed first-version scope.

### Meal edits versus saved recipes

Ingredient-quantity edits affect only that planned meal by default.

After an edit, suggest updating the saved recipe through a separate action. Include a “Don't show again” preference, with a setting to enable the prompt again.

How a recipe-update action handles person-specific substitutions and quantities remains open.

## 6. Recipes and the shared ingredient catalogue

### Nutrition

- Import a starter ingredient set from an established nutrition dataset.
- All household members can add, edit, and delete catalogue items.
- Users select catalogue ingredients and enter quantities when saving recipes.
- Calculate recipe and portion calories from ingredient nutrition values.
- Support grams, millilitres, and ingredient-specific units such as eggs and tablespoons.
- Each supported unit needs a defined conversion for that ingredient.
- Do not assume that millilitres equal grams for every ingredient.

The imported dataset, permitted reuse, source attribution, raw/cooked food distinctions, and initial recipe collection are open decisions. Retaining source identifiers and distinguishing imported data from household edits is a proposed design requirement.

### Edits, archiving, and history

- Editing nutrition values updates recipes and future meals that use the ingredient.
- Preserve the values recorded for past days.
- Deleting an ingredient archives it: hide it from new selections while keeping existing references.
- The treatment of remaining meals today, as distinct from future days and past days, needs an explicit cutoff rule.

### Language

The app supports English and Spanish, selectable per person. Provide starter content in both English and Spanish. Household-created content stays in its original language, with optional manual translations. Automatic translation through an external service is outside the agreed scope.

## 7. Shared shopping list

- Choose a date range and generate one shared list.
- Include final ingredient amounts across every person's portions and substitutions.
- Combine quantities only when ingredients and units are compatible.
- Support shared checked/unchecked states and manual additions.
- No pantry inventory or automatic stock subtraction in the first version.
- If meals or portions change, indicate that list updates are available.
- Let a member review and apply changes; do not silently regenerate the list.

The review must eventually define handling for checked items, removed ingredients, changed quantities, and manual additions. Whether multiple lists can coexist is open.

## 8. Offline behavior

- View the last loaded menu, recipes, and shopping list offline.
- Allow shopping items to be checked and unchecked offline.
- Synchronize those checkbox changes after reconnection.
- Other edits require an Internet connection.
- Show when displayed information is cached and when checkbox changes are pending.

For a shared shopping checkbox, the last change accepted by the server wins, including a queued offline change. Preserve the final local checked/unchecked intent rather than replaying an ambiguous toggle. Stale-list handling and local-cache behavior on logout or member removal remain open. Offline caches cannot be remotely erased from a disconnected device.

### Timezones

Shared menu entries belong to a calendar date: Friday lunch stays on Friday for every member, regardless of timezone. Each person's current device timezone determines their Today view and local day boundaries. Meals are not shifted to different calendar dates by timezone conversion. Historical snapshot cutoffs under different local day boundaries still need an explicit rule.

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

## 10. Proposed primary screens

These screens organize the confirmed workflows; layouts and navigation are not yet approved.

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
- Ingredient edits update future plans without changing past recorded totals.
- Archiving an ingredient preserves existing recipes and meals.
- Accepting a new target includes budget review and leaves past targets intact.
- Logging activity replaces only the selected day's usual activity allowance.
- Menu edits produce a reviewable shopping-list change rather than overwriting the list.
- Offline checkbox changes persist through an app restart and synchronize after reconnection.
- Both languages cover all first-version interface workflows.

## 12. Remaining decisions before implementation

1. Nutrition dataset, starter recipes, activity dataset, and licensing.
2. Calorie-estimation methodology and goal-validation rules.
3. Exact rules for activity overrides and personal portion suggestions.
4. Today's time cutoffs, historical snapshots under individual device timezones, and correction of past records.
5. Shared-edit conflicts beyond shopping checkboxes, stale-list handling, and local-cache lifecycle.
6. Owner lifecycle, fixed household size after membership changes, and removed-member data.
7. Bilingual starter-content coverage and the optional manual-translation workflow.
8. Shopping-list update details and number of active lists.
9. Screen/navigation approval and development phases.

Confirmed requirements above remain valid while these details are resolved.
