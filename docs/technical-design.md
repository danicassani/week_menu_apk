# Technical design — review draft

This document proposes engineering details for the confirmed [product specification](specification.md). It is not an instruction to start implementation. Product decisions take precedence; details labelled as proposals remain reviewable.

## 1. Application structure

- React and TypeScript client, built as a static application for Cloudflare Pages.
- Five main destinations: Dashboard, Menu, Shopping, Recipes, Profile.
- English and Spanish interface dictionaries, with per-member preference.
- Minimalistic monochrome black-and-white interface with both light and dark modes; visual elaboration is deferred.
- Supabase PostgreSQL as the authoritative store, Google authentication, backend authorization, and shared-change notifications.
- Backend database functions for multi-record mutations that must succeed or fail together.
- A service worker for the app shell and browser storage for explicitly cached content and pending checkbox operations.

Proposed module boundaries:

| Module | Responsibility |
| --- | --- |
| Identity and household | Access, invitations, owner transfer, membership |
| Nutrition | Ingredient versions, conversions, recipe calories |
| Targets | Mifflin–St Jeor, activity factors, goal screening, accepted targets |
| Daily records | Budget overrides, outside food, weight and activity logs |
| Planning | Suggestions, meal participants, portions, substitutions, previews |
| Shopping | Aggregation, update diffs, manual items, checked states |
| Local persistence | Offline views, queued checkbox state, synchronization |
| History | Date locking and immutable calculation snapshots |

Calculations use pure, independently testable functions where possible. Backend validation independently enforces permissions, input validity, revisions, and date locks.

## 2. Proposed logical data model

Breakfast planning uses individual member recipe choices, budgets, portions, suggestions, and shopping contributions. Lunch and dinner use a shared base recipe with personal variants. Any member can instead have an eating-out replacement for a meal, requiring a description and manual calorie estimate.

All household-owned records carry a household identifier. Personal records also carry their subject member identifier. Use stable IDs and revisions; do not link records by translated labels.

| Entity | Important fields and behavior |
| --- | --- |
| Household | Owner member; exactly one owner; configurable Monday/Sunday week start, default Monday; provisioned for this one-household application |
| Approved email / invitation | Normalized email, status, issuer, accepted member |
| Membership | Auth user, active/removed status, onboarding status, joined/removed timestamps |
| Member profile | Age, sex, height, dietary patterns, excluded ingredient IDs, preferred language |
| Client timezone | Last reported IANA zone and observation time; confirmed source for server-side date locking |
| Weight measurement | Member, date, kilograms; immutable after the person's day closes |
| Goal and target version | Goal weight/date, calculation inputs/version, proposed/accepted status, effective date |
| Default meal budgets | Member's breakfast, lunch, and dinner defaults, versioned by effective date |
| Meal-budget override | Member, planned meal, calorie budget |
| Ingredient / ingredient version | Canonical identity, raw/cooked state, bilingual names, kcal per reference amount, source identifiers, revision, archive status |
| Ingredient conversion | Ingredient, unit, grams or compatible reference quantity; no global density assumption |
| Substitution rule | Source/alternative ingredient, culinary role, dietary eligibility, proposed starting conversion |
| Recipe / recipe version | Names/instructions, reference servings, ingredient quantities grouped into main/sides and optional dessert, main/base ingredient-role metadata, dietary metadata, source/provenance, revision |
| Planned meal | Calendar date, breakfast/lunch/dinner slot, optional shared base recipe for lunch/dinner, revision and lock information |
| Meal participant | Included member, budget snapshot, home-cooked/eating-out mode; individual breakfast recipe or lunch/dinner variant; per-person dessert inclusion; required description and calorie estimate for eating out |
| Portion ingredient | Actual quantity, unit/conversion reference, ingredient nutrition version, reviewed substitution status |
| Outside-food entry | Member, date, description, kcal |
| Activity entry | Member, date, source activity code, pace/intensity, source MET, duration, weight/calculation inputs |
| Daily snapshot | Intake components, estimated expenditure/deficit, accepted target, assumptions and formula versions |
| Shopping list | The single list, selected date range, applied source-plan revision |
| Generated shopping item | Canonical ingredient/unit identity, quantity, source contribution references, checked state |
| Manual shopping item | Member-entered label/quantity, stable separate ID, checked state |
| Member preference | Recipe-update prompt, display preferences |
| Pending local operation | Authenticated account, stable item ID, desired checked state, operation ID, local order |

Constraints enforce one breakfast, one lunch, and one dinner slot per date, unique meal participants, valid conversions, positive durations/quantities where required, and the agreed single shopping list. Each participant has exactly one effective meal mode: a home-cooked recipe/variant or an eating-out entry with required description and finite nonnegative manually entered calories. Blank or unknown calories are rejected. Do not count both modes or generate ingredients for eating-out participants. Zero or missing recipe energy cannot be used as a divisor when scaling portions.

## 3. Authorization and owner lifecycle

- Database policies require an active viewer membership for all household access.
- Shared recipes, catalogue items, and unlocked plans are editable by active members.
- Personal profiles and logs are household-readable but owner-editable only.
- Removed members lose server access. Their retained historical records remain readable by active household members.
- Only the owner changes approved emails and membership or transfers ownership.
- Transfer ownership in one transaction, to another active member, before the owner leaves.
- Confirmed bootstrap: configure the initial owner's approved Google email during deployment. Never give ownership to the first arbitrary visitor.
- When removing a member, delete future-dated personal entries/settings while retaining historical records and calculation references. Remove their unlocked planned portions under the existing rule and flag shopping changes for review. Perform cleanup transactionally without cascading into immutable historical records.
- Unapproved Google identities receive no household data access, even if the authentication provider creates an identity record.
- Keep privileged credentials on trusted backend/setup paths. Browser configuration must not contain privileged database credentials.
- Invitations are approved-email entries; sending invitation emails is not an agreed feature and is not required for access.

## 4. Targets, budgets, and daily accounting

Use the confirmed equations and constants in the product specification, with explicit formula-version identifiers.

1. Validate metric profile and goal inputs.
2. Compute resting energy and usual daily expenditure.
3. For loss, compute the agreed approximate planning deficit; maintenance uses zero.
4. Apply the confirmed rate and intake screening to unrounded results.
5. Present a proposed daily target and breakfast/lunch/dinner budget review.
6. Persist acceptance as a new effective version from today, preserving historical versions.

Recording weight does not silently accept a target. Reaching the goal offers maintenance review. A rejected or pending target leaves the last accepted target active.

Default meal budgets apply unless the individual meal has an override. A person's home-cooked meal uses one recipe, which can include sides and an optional dessert. Breakfast recipes are selected individually; lunch and dinner have a shared base recipe with per-member variants. Dessert inclusion is chosen per person. Suggested portions proportionally scale all components selected for that person toward the applicable meal budget. Skipped dessert ingredients contribute no energy or shopping quantities for that person. Later manual quantity edits stay manual; budget or target changes show mismatches without silently resizing saved portions.

### Confirmed time-display convention

Count the day's planned breakfast, lunch, and dinner toward its daily total as soon as planned, clearly labelled as assumed intake. Do not introduce unrequested meal-time schedules. Future dates show projected totals. Outside-food entries add to the applicable person's day. This is the confirmed full-day accounting convention.

### Eating-out replacements

An eating-out entry is part of the planned meal participant, not an extra outside-food log. Its manual estimate replaces the corresponding recipe energy in the day's total. Label it as estimated, apply the existing budget warnings, and exclude its recipe ingredients from shopping aggregation. Leave other members' recipe portions unchanged.

Changing a participant to eating out updates the plan revision and makes shopping changes available for review. Generation preserves existing eating-out entries unless the user explicitly chooses replacement and reviews the preview. The same meal-date lock applies to individual breakfasts and eating-out replacements.

### Activity

Use the confirmed logged-day formula and the Compendium activity codes without changing source MET values. Sum additional activity energy for that date; use the usual multiplier when no activity entries remain. Logged activity changes expenditure and deficit only, never the accepted intake target.

Use source-appropriate age coverage. Do not silently map an unsupported age or activity to an unrelated source entry. Exact release selection and any coverage gaps must be recorded during import review.

## 5. Meal suggestions and substitutions

Proposed deterministic, non-AI approach:

- Start from active starter and saved recipes.
- Check each included member's patterns and excluded ingredient IDs against the recipe components selected for that member, including dessert only when selected.
- Where needed, find catalogue substitution candidates with compatible culinary roles and explicit dietary metadata.
- Never treat equal calories as proof of equivalent cooking behavior or nutritional composition.
- Present substitutions and their quantities for review before applying.
- Confirmed variety filter: for lunch and dinner, reject a suggestion that repeats a main/base ingredient within any rolling three-calendar-day window. Breakfast is exempt. Make window length configurable at household level, default three days.
- Tag main/base roles per recipe ingredient rather than treating every use as a primary role. Check the selected per-person variant so the same shared recipe served to several members is not treated as several repeats.
- Check both neighboring directions and retained plans outside the generated week. Changing week start does not reset the ingredient window. Do not silently rewrite existing meals to satisfy a new setting.
- Confirmed no-match behavior: if no suitable candidate exists, explain the gap, leave the slot unfilled, and suggest adding more recipes. Do not relax enforced rules silently.
- Preserve existing meals by default; replacing them is an explicit generation option with a preview.
- Preview application checks that source recipe, profile, and plan revisions have not changed.

A proposed substitution remains pending until reviewed. Do not include unreviewed alternatives in an applied shopping-list update.

### Proposed quantity precision and recipe updates

The user requests practical rounding to tens. Unit-specific handling needs clarification: a proposed interpretation is nearest 10 g/ml for suitable quantities, retaining useful precision for small ingredients and countable units rather than rounding eggs to multiples of ten. Store calculation precision separately from display formatting, but calculate calories from the same practical quantities actually saved and shown. Show budget mismatches after rounding. Unit conversions remain required.

When updating a saved recipe from a personal meal variant, select one person's edited variant and an explicit reference serving count, preview the change, and apply it as a new recipe version. This review flow is confirmed. Do not merge different people's substitutions into a single ambiguous base recipe.

## 6. Catalogue, conversions, and source imports

- Seed a reviewed subset from UK CoFID; retain release, food codes, attribution, and original values.
- Use raw/uncooked weights by default for ingredients that will be cooked, and as-purchased quantities for ready-to-eat foods, consistently across recipe inputs, portions, calorie calculation, and shopping.
- Keep explicit ingredient-state metadata and raw/cooked variants as distinct identities where source values differ. Use nutrition values matching the selected state; do not substitute cooked values for raw weights. If a recipe explicitly requires a state conversion, require a defined yield rather than guessing.
- Household edits create a new nutrition version rather than erasing the imported source.
- Translate starter names and recipe content into English and Spanish; household text can have optional manual translations.
- Import Compendium codes, intensity descriptions, MET values, source/release references, and attribution.
- Record provenance and permitted reuse of every starter recipe; independently authored recipes are an option.
- Explicitly define ingredient-specific unit conversions. Unsupported conversions require user input instead of guessing.
- Archiving prevents new ingredient selections but preserves existing references.
- A catalogue change updates unlocked meal nutrition and flags shopping differences where relevant, without changing locked records.

Imports are reproducible setup artifacts, not live external API dependencies for every meal calculation. No source dataset has been imported yet.

## 7. Date locking and historical integrity

Confirmed rule: a shared meal date locks for everyone as soon as it has ended for any active household member. Personal records become read-only after the owner's local date ends.

Proposed enforcement:

- Use server time and member-reported IANA timezone identifiers; never trust a submitted date-is-editable boolean.
- Confirmed timezone policy: use the last online device timezone reported by each member. A server cannot know an offline device's current timezone or travel location.
- Shared date cutoffs use the earliest relevant member midnight. Once a date is locked, timezone changes or membership changes cannot reopen it.
- Check locks during every backend mutation, including indirect changes through nutrition edits and membership changes.
- Keep immutable recipe/ingredient versions and portion snapshots for locked dates. A later shared recipe edit cannot rewrite history.
- Changes to current/future meal rosters never add a new member retroactively. Removing a member affects only unlocked plans.
- Transactions that lock or update a date must serialize appropriately, so a catalogue edit cannot race a history snapshot.

Stored snapshots preserve quantities, calories, conversions, substitutions, calculation inputs, and source/formula versions. Materializing a snapshot is a technical operation, not a user correction.

## 8. Shopping and concurrent changes

Generate contributions from saved, reviewed home-cooked portion quantities across the selected date range, including individual breakfast recipes. Skip eating-out participants entirely; their manual calorie estimates are not ingredient requirements. Merge only identical compatible ingredient identities. Default to raw/as-purchased shopping quantities; explicit cooked-state entries stay separate unless a defined yield conversion permits aggregation into the corresponding purchased ingredient.

The reviewed update is a diff against the last applied generated list:

- Increase: update the quantity; if checked, uncheck and highlight the increase.
- Decrease: update the quantity and retain checked state.
- No longer required: remove the generated entry.
- Unchanged: retain the item and its checked state.
- Manual entry: always preserve independently of generated entries.

Applying a preview checks the list/plan revisions; an outdated preview must be refreshed. Generated item IDs remain stable for surviving identities.

For recipes and planned meals, reject stale writes and retain the editor's draft for comparison; do not overwrite the newer saved revision.

## 9. Offline behavior and checkbox ordering

Cache the shell, last loaded menu/recipes, and current shopping list for the signed-in account. No offline profile, calorie, recipe, menu, or nutrition editing is promised.

Queue explicit set-checked operations, not toggle operations:

- Include a unique operation ID, stable item ID, and desired checked state.
- Preserve each device's local order and use idempotent server handling for retries.
- The last operation accepted by the server wins, including queued offline operations.
- Revalidate active membership on reconnection.
- Confirmed stale-item rule: if an item was removed while offline, discard its checkbox operation with a visible notice and continue synchronizing other valid operations. Never resurrect deleted items or apply a label match to a different item. A replacement with a new stable ID does not inherit the removed item's queued operation.
- Always show pending/error state until an operation is acknowledged.

Confirmed sign-out lifecycle: isolate caches by account. If checkbox edits are pending when sign-out is requested, warn and let the person reconnect to synchronize or explicitly discard the changes before signing out. Completed sign-out clears that account's cached household data and pending operations. Do not silently lose pending changes or keep them for a later sign-in.

Confirmed revocation lifecycle: on detected membership revocation, stop syncing and clear local household caches. Previously downloaded data on a disconnected device cannot be remotely erased.

## 10. Screen flows

~~~mermaid
flowchart TD
    A[Google sign-in] --> B{Approved member?}
    B -->|No| C[Access unavailable]
    B -->|Yes| D{Setup complete?}
    D -->|No| E[Profile and target / budget review]
    E --> F[Dashboard]
    D -->|Yes| F
    F --> G[Menu]
    F --> H[Shopping]
    F --> I[Recipes and ingredients]
    F --> J[Profile and history]
    G --> K[Suggestion / substitution preview]
    K --> L[Manual portion edits]
    L --> M[Save unlocked meal]
    M --> N[Shopping changes available]
    N --> H
~~~

On phones, the Menu destination uses seven vertically stacked day cards, each showing breakfast, lunch, and dinner, with vertical scrolling. The household can start the planning week on Monday or Sunday; Monday is the default. Changing the week start affects the view and generation range, not existing meal calendar dates. Each person's home-cooked meal has one recipe, with any included sides and a per-person optional dessert. Breakfast recipes are individual; lunch and dinner have a shared base recipe. Show eating-out replacements per member with their manually entered calorie estimates.

Every main destination remains available through the approved navigation. Selecting another member changes the displayed summary without changing personal-write permissions.

## 11. Delivery and verification

Follow the approved four milestones in the product specification, with a review after each milestone before proceeding.

Meaningful checks include:

- Formula arithmetic, screening boundaries, budgets, net activity, and ingredient conversions.
- Database authorization using owner/member/removed/unapproved identities.
- Atomic ownership transfer and lock enforcement for indirect mutations.
- Two-member stale-edit and timezone-boundary scenarios.
- Shopping diff and stable-ID behavior, including manual additions.
- Offline app restart, retry, reversed arrival order, removed items, and revoked membership.
- English/Spanish workflows, small-screen accessibility, Android Chrome and iPhone Safari installation/cached access.

Start these checks with the relevant milestone. Actual implementation test results will be recorded when code exists; documentation review is not a passing application test.

## 12. Review boundaries

The product requirements, five tabs, stack, formulas, and milestone order are confirmed. This document's engineering defaults and explicitly proposed edge-case behavior are not yet approved as a whole.

The timing convention, device-timezone reporting policy, recipe-update preview, and membership-revocation cache cleanup are confirmed. Stale offline-item handling and the sign-out lifecycle are confirmed. Exact dataset coverage and recipe content will be concrete import artifacts reviewed in the relevant milestone.
