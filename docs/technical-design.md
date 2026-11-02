# Technical design — reviewed implementation blueprint

Engineering consistency review completed; see the [review report](technical-review.md). This blueprint implements the confirmed [product specification](specification.md). It does not authorize starting a new milestone or provisioning services. Product decisions take precedence; milestone reviews remain required.

## 1. Application structure

- React and TypeScript static PWA on Cloudflare Pages.
- Supabase PostgreSQL, Google authentication, authorized database mutations, and shared-change notifications.
- Five destinations: Dashboard, Menu, Shopping, Recipes, Profile.
- English/Spanish interface dictionaries and bilingual starter content.
- Minimalistic monochrome light/dark interface.
- Service worker for the public app shell; account-isolated browser storage for explicitly loaded offline views and checkbox operations.

Separate identity/household, nutrition/conversions, targets, daily records, planning, shopping, history, and local synchronization modules. Pure calculation functions can be checked independently; the backend also validates inputs, permissions, revisions, and locks. PostgreSQL is authoritative.

## 2. Logical data model

All household records carry a household identifier. Personal records identify their subject member. Stable IDs, explicit versions, and decimal quantities prevent names, translations, or floating-point formatting from becoming identifiers.

| Entity | Responsibility |
| --- | --- |
| Household | Singleton household, exactly one owner, Monday/Sunday week start and configurable variety window |
| Approved email / membership | Verified identity, active/removed status, onboarding state, invitation/revocation information |
| Profile / profile version | Age, sex, metric measurements, dietary patterns/exclusions, language; preserve calculation inputs |
| Client timezone | Last reported IANA timezone and server observation time |
| Weight measurement | Member/date, kg, observation ordering; personal-day immutability |
| Goal / accepted target version | Calculation inputs, formula version, proposed/accepted state, effective date |
| Meal budget / override | Personal breakfast/lunch/dinner defaults and individual meal overrides |
| Ingredient / nutrition version | State, names, kcal/reference amount, original source, household changes, archive state, canonical variety key |
| Ingredient conversion | Ingredient-specific units, density/yield if needed, allowed countable-unit step |
| Substitution link | Source/alternative, culinary roles, dietary metadata, quantity conversion |
| Recipe / recipe version | Reference servings, instructions, main/sides and optional dessert groups, main/base roles, source and revision |
| Planned meal | Calendar date, breakfast/lunch/dinner slot, optional shared lunch/dinner recipe, revision |
| Meal participant | Included member, home-cooked/eating-out mode, personal breakfast or shared-meal variant, dessert selection |
| Portion ingredient | Final saved quantity/unit, conversion and nutrition references, reviewed substitution |
| Outside-food / activity entry | Personal date, description/calories or source activity/intensity/duration and calculation inputs |
| Meal-date lock | Household/date, tracked timezone inputs, UTC cutoff, irreversible lock and portion snapshots |
| Personal-day context / snapshot | Local cutoff, target/input versions, intake components, completeness, expenditure/deficit |
| Shopping list | Single list, date range, last applied contribution/content revision |
| Generated / manual item | Separate records; generated contribution identity or manual label, quantities, checked state |
| Pending local operation | Account, stable item ID, desired checked state, operation ID, local order |
| Applied checkbox operation | Unique member/operation ID, original acknowledgement, accepted item revision |
| Household change revision | Minimal authorized invalidation counter/category; no raw health payload |
| Member preference | Recipe-update prompt and display choices |

Enforce one slot of each meal type per date and one participant per member/slot. Each participant has exactly one effective mode: a home-cooked recipe/variant or an eating-out description with finite nonnegative manually entered calories. Reject blank/unknown eating-out calories. Do not count or shop for both modes.

Zero-energy nutrition is valid only when explicitly known. Missing recipe energy cannot be used as a scaling divisor. Protect historical references against cascading deletion.

## 3. Identity, authorization, and membership

| Action | Authorized actor |
| --- | --- |
| Read household meals and shared health/history | Active approved member |
| Edit unlocked shared meals, recipes, catalogue, shopping | Active member |
| Edit a profile, target, meal budget, weight, activity, outside-food log | Subject member only |
| Invite/remove members or transfer ownership | Household owner |
| Change locked historical records | Nobody through application operations |

The household owner has no override for another person's personal-write permissions.

Configure the initial owner's approved Google email during deployment. Bootstrap the singleton once with the verified identity under a transaction; later login, redeployment, or an old bootstrap email cannot undo ownership transfer. Normalize emails by trimming/case normalization without inventing Gmail dot/plus equivalence. Bind membership to the authenticated user ID.

Unapproved authenticated identities receive no household access. Approved members complete their profiles/budgets before inclusion in new meal plans; existing participant rosters are not backfilled. Replanning is an explicit preview.

Owner transfer checks an active successor and is atomic. The sole owner cannot leave or be removed before transfer.

Member removal transaction:

1. Finalize expired meal/personal dates using pre-removal timezone inputs.
2. Revoke membership and its automatic re-entry approval.
3. Delete future-dated personal entries/settings, using that member's tracked local date at removal.
4. Remove their unlocked meal participants and mark shopping differences for review.
5. Retain past personal records, current historical references, and locked meal snapshots.

Do not cascade-delete the auth identity or shared recipes. An explicit reinvitation does not restore deleted future entries.

Enable row-level security on exposed base tables. Exposed views must honor the caller's table policies (security-invoker semantics), rather than bypassing them through a privileged view owner. Functions validate identity, membership, subject permissions, and date locks internally. Check live membership rather than trusting stale JWT role metadata, and avoid recursive membership policies. Narrow execute grants; prefer invoker permissions. Any necessary definer function has an empty fixed search path, schema-qualified references, and explicit authorization. Privileged credentials never enter the browser.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database-function security](https://supabase.com/docs/guides/database/functions).

## 4. Calorie targets and daily accounting

Use the exact confirmed Mifflin–St Jeor equations, activity multipliers, 7,700 kcal/kg approximation, logged-day formula, and screening boundaries from the specification. Version all inputs.

Accepted intake targets stay unchanged until reviewed and accepted. New weight measurements can update the editable day's expenditure estimate without accepting a new intake target or resizing meals. Retain the applicable measurement/profile inputs at the personal-day cutoff.

A recalculation uses valid metric inputs, an integer adult age, and calendar days remaining. Calculate calendar-day differences rather than milliseconds divided by 24 hours, so daylight saving does not alter the deficit. Reject non-finite/nonpositive measurements, invalid goal dates, and invalid target direction. Apply the agreed >1 kg/week and <=1,200 kcal/day checks before display rounding.

Reaching or passing goal weight offers maintenance review. An expired loss deadline requires goal/deadline revision before a new target calculation; do not divide by zero. Pending/rejected proposals leave the previous accepted target active. Acceptance includes reviewing all three personal meal budgets.

Actual weight, outside-food, and activity logs record the person's current editable day; past-day insertion is a correction and remains excluded. Future meal plans, budgets, and goals are supported. Validate nonnegative food calories, positive durations, and no more than 24 hours of total activity for one date. Source coverage gaps produce a clear unavailable estimate, not an invented MET value.

The daily intake calculation is:

- Final home-cooked portion calories OR the eating-out estimate for each participant/slot.
- Plus outside-food calories.
- Never add both meal budgets and portion calories as consumed food.

Meal-budget allocation is a separate check against the daily target. Planned meals count in full-day totals immediately, labelled as assumed intake; future dates show projections. An empty meal slot is not evidence that the meal was skipped. Show a known-calorie subtotal and mark the day's projection/deficit incomplete when a required meal is unplanned.

Logged-day expenditure uses resting estimate × 1.2 plus summed net activity energy, exactly as agreed. With no activity entries, restore the usual multiplier. This changes only that date's estimated expenditure/deficit, not the accepted intake target.

## 5. Recipes, portions, suggestions, and substitutions

Breakfast recipes are individual; lunch/dinner share a base recipe with personal variants. Each person's home-cooked meal uses one recipe, including its sides and optional personal dessert. Eating-out mode replaces only that person's recipe portion and contributes no shopping ingredients.

Suggestion pipeline:

1. Resolve the included roster, dessert selections, budgets, and individual dietary rules.
2. Select an active recipe and curated, compatible ingredient alternatives when needed.
3. Obtain review of substitutions; do not infer cooking suitability from calorie similarity.
4. Compute energy for the selected components and scale proportionally to each person's budget.
5. Apply unit-aware rounding and recompute calories from the actual saved quantities.
6. Check variety against retained neighboring meals and the entire preview.
7. Revalidate source/profile/settings/plan revisions and date locks before an atomic commit.

Generate into empty slots by default; replacing existing meals, including eating-out entries, is explicit and previewed. If no recipe fits, leave the slot unfilled, explain the gap, and suggest adding recipes. Never silently relax dietary or variety rules.

### Variety

Use explicit main/base roles and canonical ingredient keys; normalize reviewed aliases/cuts representing the same main ingredient during content preparation. Minor ingredients do not trigger the filter.

Default window: three calendar days, configurable for the household. Apply to lunch and dinner only, per selected personal variant; breakfast is exempt. One shared dish served to several people is not multiple repetitions for one person. Compare different meal slots, with a set of ingredient keys inside each portion.

For three days, Monday/Wednesday reuse is excluded, Monday/Thursday reuse is allowed, and lunch/dinner reuse on one date is excluded. Check across week boundaries and in both neighboring directions. A settings change never silently rewrites existing plans.

### Rounding and version propagation

For gram/millilitre quantities >=10, round to the nearest 10; smaller amounts use 1-unit precision. Countable units use sensible whole/fractional steps defined for the ingredient. Positive half-step ties round upward. Round in the chosen unit once, then convert for calorie and shopping calculations; do not round an egg fraction again in grams.

A required positive quantity that would round to zero requires explicit quantity review rather than silent omission or inflation. Persist the final practical values using decimal arithmetic. Budget overshoot after rounding is a warning and manual adjustment; never change another ingredient silently.

Differentiate two updates:

- Catalogue nutrition/conversion edits version the source and recalculate unlocked meals using their saved quantities/units. Do not resize portions to restore budgets. Shopping changes, if any, require review.
- Saved-recipe edits create a new version for future selections. Existing planned quantities/variants are meal snapshots; applying changed recipe quantities to them needs an explicit preview.

A new dietary exclusion flags incompatible unlocked meals for review without automatically applying substitutions. Locked history is preserved.

Updating a saved recipe from a meal uses the confirmed single-person variant, explicit reference servings, and preview. Do not merge several people's alternatives. The recipe-update prompt preference remains per member and can be re-enabled.

## 6. Catalogue and starter content

Seed a reviewed subset from UK CoFID, retaining original release/food codes, attribution, and household-edited versions. Use raw/uncooked weights for ingredients to be cooked and as-purchased quantities for ready-to-eat foods, consistently across recipes, portions, calories, and shopping.

Ingredient state must match the source nutrition reference. Defined density/yield conversions are required when crossing volume/mass or cooked/purchased states. Do not guess missing conversions or interpret unknown nutrition as zero. Incomplete data can remain drafts but cannot be automatically applied as fully calculated meals; show which fields are missing.

Import Compendium activity codes, pace/intensity mappings, source METs, age coverage, and attribution. Do not change published MET values or invent support for unmapped ages/activities.

Prepare 40–50 recipes spanning breakfast and European/international everyday meals, with ingredient groups, dietary/main-base metadata, substitution links, quantity steps, source/provenance, and English/Spanish content. Household-created text retains its entered language with optional manual translations.

Archiving preserves existing/historical references while preventing new selections or suggestions that depend on unresolved archived ingredients. Archive referenced recipes instead of deleting history.

Imports are reproducible setup artifacts, not mandatory live external lookups for each calculation. Source/content coverage is reviewed in its milestone; no dataset has yet been imported.

## 7. Historical integrity and timezone handling

Use two independent locks:

- Household meal-date lock: freezes all participant portions for the date, including individual breakfasts and eating-out replacements, as soon as the date ends for any tracked active member.
- Personal-day lock: closes that person's food/activity/measurement records and daily context at their own local day end.

The shared lock does not prematurely close another person's still-current personal day. A locked planned meal cannot be edited even where it is still Today.

Derive UTC cutoffs from IANA calendar midnights with daylight-saving support. Use the last online device timezone reported by each member, with server observation time; a disconnected device's new location cannot be known. The server clock determines expiry.

Before timezone/membership changes, finalize dates whose old cutoffs have passed; update only still-open cutoffs. Once locked, a date cannot reopen because of travel, member removal, or another device reporting a different zone.

Every affected backend read/mutation enforces due closures. Serialize conflicting updates consistently by household/date and member/date. Immutable ingredient/recipe/profile/target versions and portion records permit lazy snapshot materialization at the cutoff without an always-running client or exactly timed background task. A catalogue edit cannot race into expired history.

Store quantities, conversions, calories, source and formula versions, activity inputs, accepted targets, and completeness information. Backend constraints prevent indirect changes to locked history through catalogue edits, budget changes, or removal cleanup.

## 8. Shopping updates and concurrent edits

Aggregate final saved home-cooked quantities for the selected range, including individual breakfasts and selected desserts. Eating-out participants contribute no ingredients. Merge only compatible canonical identities; default to raw/as-purchased quantities, with explicit yields required for cooked-state conversion.

Review a diff before application:

| Change | Applied behavior |
| --- | --- |
| Quantity increases | Update; if checked, uncheck and highlight increase |
| Quantity decreases | Update and retain checked state |
| Ingredient no longer required | Remove generated item |
| Unchanged item | Preserve item and checked state |
| Manual addition | Preserve independently of generated contributions |

Confirmed during review: changing the date range preserves surviving generated ingredients' checked states under these same rules; it does not start a new unchecked round. Manual additions and their states remain.

Check source plan/catalogue and range/content revisions before applying a preview. At commit, read current checked states under a lock; checkbox revisions are separate from source-content revisions. A stale content preview must refresh. Stable item IDs survive compatible identity matches across ranges; deleted/recreated items get new IDs.

Recipe and meal edits use revision checks. A stale save is rejected with the editor's draft retained for review; no last-write overwrite of recipe/meal edits.

## 9. Offline synchronization, caches, and realtime

Queue set-checked intent, not toggle commands. Keep local order and a unique member/operation ID. The backend records the acknowledgement atomically with the item change. Retries return the original acknowledgement without reapplying state; otherwise an old retry could overwrite a newer operation.

The last change accepted by the server wins. A quantity increase unchecks an item, but a later accepted offline check can recheck it under that same agreed rule. No hidden conflict exception is added.

Discard removed-item operations with a notice and continue valid operations. Never recreate deleted items or remap by label. Keep newer local intent pending when an older operation is acknowledged; refetch authoritative state after synchronization.

Cache only the shell and explicitly loaded menu/recipes/shopping views, isolated by account. Do not generically cache authenticated API traffic or promise offline health-log editing. Browser storage is evictable; handle quota/availability errors visibly. Updates and storage migrations preserve pending operations.

On sign-out with pending changes, offer reconnect/sync or explicit discard. Completed sign-out clears the account's cached household data, pending operations, and local session; offline sign-out cannot promise immediate remote session revocation. On detected removal, stop syncing and clear household caches; offline copies cannot be erased remotely.

Sync on foreground reconnection, resume, and opening. Background browser execution is an optimization, not a guarantee. Initial installation/cache population requires an online load.

### Authorized refresh notifications

Publish only minimal household revision updates with active-membership access checks; fetch current records through authorized reads. Do not publish raw health-record deletion payloads. Relevant changes increment the revision in the same transaction. Realtime is a hint, not a durable change log: refetch on resume/reconnect and before applying previews.

Supabase documents limitations for Postgres delete events, so deletion-event filtering must not be the access-control boundary. Check function permissions and long-lived sessions as well as table policies. Reference: [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

## 10. Screen and browser contract

Dashboard opens after setup, defaults to the signed-in person's calorie summary, and has a member selector. Switching the displayed member does not grant personal-write permissions.

Mobile Menu uses seven vertically stacked day cards, each with breakfast/lunch/dinner, following the configured Monday/Sunday week start (Monday default). Shared calendar dates stay fixed across timezones. Show eating-out estimates and dessert choices per person.

Recipes includes catalogue management; Profile includes personal targets, measurements, history, language, and relevant settings. Use textual statuses, icons, and visible focus states so warnings, pending synchronization, and missing data remain clear in black/white light/dark modes.

Configure static SPA route fallback, approved OAuth callback destinations, and a redirect flow tested in both mobile browsers and installed PWAs. Do not allow arbitrary callback redirects. Version the app shell and handle updates without losing queued edits. Detailed composition is a milestone artifact; visual elaboration is deferred.

## 11. Delivery and verification

Follow the four approved milestones with user review after each. Verify permissions/calculations as soon as implemented; do not postpone them to the final release phase.

Required integration coverage:

- Unauthorized/removed identities, direct database/function access, cross-person writes, owner transfer and one-time bootstrap.
- Formula and screening boundaries, calendar days across daylight saving, unit conversions, rounding, and partial daily totals.
- Individual breakfasts, shared personal variants, optional dessert, eating-out replacement, and no double counting.
- Rolling ingredient windows across weeks, substitutions, and empty-slot fallback.
- Independent meal/personal-day locks, indirect catalogue updates, travel, and member removal.
- Shopping range changes, manual items, increase/decrease rules, stale previews, and stable identities.
- Lost acknowledgements, duplicate retries, local-operation order, removed items, revocation, sign-out, and offline app restart.
- English/Spanish, keyboard/screen-reader essentials, Android Chrome, iPhone Safari, and home-screen sign-in/cached use.

The [review report](technical-review.md) records design scenarios and arithmetic checks. These are not passing application tests; application code, migrations, imports, provisioning, and browser tests have not started.

## 12. Review outcome and delivery artifacts

No unresolved product question blocks this blueprint. The shopping date-range behavior was confirmed during the review.

Still to produce in the relevant milestones: exact source release manifests and coverage, conversion/variety/substitution metadata, bilingual starter recipes, actual screen composition, database migrations, implementation tests, and deployment configuration. The initial owner's email and hosting/OAuth accounts are setup inputs needed later.

No new feature scope, stack, calorie formula, or paid service was introduced. Application implementation remains a separate next step under the approved milestone process.
