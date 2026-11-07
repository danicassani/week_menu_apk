# Version 3 — product specification

Status: draft for review. See [D1–D3](README.md#decisions-awaiting-an-answer) before treating the conditional sections as final. This document specifies behavior; it does not claim these features already exist.

## 1. Product direction

Make the weekly menu easier to rearrange and reuse, show how much each person should receive, keep shopping relevant as dates pass, and reduce friction in catalogue browsing and activity logging. Preserve compact icon controls, readable meal names, explicit review of destructive changes, household privacy and automatic shopping reconciliation.

Four existing distinctions remain important:

- A breakfast belongs to one recipient; a lunch/dinner is a shared slot with individual portions and substitutions.
- Suggestion previews are drafts. Saved menu operations change the shared household plan only after review/confirmation.
- A copy retains a source and creates/replaces a destination. A swap changes both endpoints.
- A normally closed historical day is distinct from a temporarily authorized correction session. A suggestion padlock is a separate draft-regeneration control.

## 2. Meal swaps — V3-01

Expose the up/down swap icon on individual breakfasts in the saved weekly menu as well as the suggestion preview. Existing preview-only controls are insufficient for this request. Shared lunch/dinner swap behavior remains available.

Select a source, highlight it, and change compatible destinations to a clear swap-target state. An occupied destination exchanges choices; an empty destination moves the choice and leaves the source empty. Activating the selected source again or the cancel action exits swap mode. Copy and swap modes are mutually exclusive; changing modes must not apply a pending operation.

Under proposed D1, an endpoint is `(date, meal type, recipient)` for breakfast. The recipient can differ between endpoints, including two people on the same day. Only those individuals' breakfasts change. Other breakfast portions in either day's breakfast plan remain unchanged. If D1 is declined, destinations are limited to the selected member's other breakfast dates.

Rebuild each moved choice for its new recipient and date: accepted budget/override, dietary pattern, ingredient exclusions, compatible reviewed substitutions, optional components and practical quantity rounding. Exchange recipe choices rather than gram quantities, old calorie budgets, personal settings or eating-out descriptions. Never swap a breakfast wholesale with a shared meal; recipe-based copy/paste is a separate operation.

Validate both endpoints against the complete resulting menu, including retained neighboring days and the configured lunch/dinner variety window. Breakfast remains exempt from that window. Shared lunch/dinner recipes must support the destination meal type. A locked preview endpoint cannot be changed without unlocking it. Changing membership, source recipes or budgets invalidates the old preview and requires renewed review.

In a suggestion preview the swap updates the draft only. For saved meals, show the two resulting choices/portions before applying them in one transaction. A conflict leaves both endpoints unchanged. Historical sources may be read/copied, but ordinary swaps cannot move content into or out of closed days; the correction workflow below is intentionally narrower.

## 3. Planning clipboard and paste — V3-02

Use matching outline Copy and ClipboardPaste icons. A saved or suggested shared meal copies its shared recipe choice and relevant optional-component preferences. A breakfast copies the selected person's choice. The original meal is unchanged.

After copying:

1. Retain one clipboard item and show a compact copied-item indicator with a cancel action.
2. Replace other meal copy controls with paste controls, including empty destinations. Keep the selected source identifiable; its selected control can cancel copying.
3. Show incompatible destinations disabled with an explanation. Do not silently convert an unsupported recipe to another meal type.
4. Keep the clipboard through week navigation and a successful paste so one choice can be reused. Cancel, sign-out, account/household changes and app reload clear it.

The clipboard is internal application state. It requires no operating-system clipboard access or browser permission. It does not contain other households' content and is not synchronized to another device.

Pasting is a planning operation, not a raw snapshot duplication. Resolve the source recipe and calculate current destination portions, substitutions and calories. Do not copy profiles, calorie targets, weight/activity/outside-food logs, checked shopping states or historical gram quantities. Preserve per-person optional choices where there is an unambiguous matching source preference; otherwise show the applicable recipe defaults in the destination review.

A breakfast destination affects only the selected recipient. A shared destination generates portions for the eligible household roster. A recipe can be pasted across breakfast/shared categories only if its declared supported meal types include the destination; the selected destination determines recipients. Compatibility of recipe type alone does not waive diet or nutrition validation.

An occupied destination always requires an overwrite warning and explicit acceptance. Identify the date, meal and affected recipient(s). Explain when replacing the meal also replaces an eating-out record or dessert choice. Cancelling leaves source and destination untouched and retains the clipboard. Even an apparently identical choice must not overwrite without this acceptance.

For previews, acceptance changes the draft; final week approval still saves it. For saved menus, a destination review shows recipe, recipients, portions and warnings, then applies only that destination. Revalidate its revision after confirmation; do not overwrite a second editor's newer changes using an earlier confirmation.

Respect recipe archives, dietary exclusions, nutrition/conversion requirements and existing variety rules. A conflict is explained and the paste remains unapplied; do not silently reroll nearby meals. An eating-out source is copyable only through a recoverable underlying recipe. A bare restaurant description/calorie estimate is not an ingredient recipe. Historical recipe references may supply a readable source, but an archived/unavailable current recipe cannot become a new selectable meal without review/restoration.

## 4. Copy a catalogue recipe into Menu — V3-07

Long-press a recipe card on touch, or right-click it on desktop, to open a compact context menu containing Copy to menu. A normal click continues opening the read-only recipe view. Scrolling or moving the pointer cancels the long press; releasing after the context action must not also open the recipe.

Offer the same action from the recipe reader and through keyboard context-menu activation so the gesture is not the only access path. A working timing default is a 500 ms press with a small movement tolerance. No automatic copy occurs just because a card received focus.

Copy to menu loads a recipe reference into the same planning clipboard, closes the context/reader overlay, navigates to Menu and exposes paste targets. It does not choose a meal/date automatically. Navigate to the currently selected week where possible, otherwise the current configured calendar week. A recipe copied from the catalogue starts with its normal component defaults; personal quantities are calculated at the chosen destination.

Archived recipes can still be read but cannot start a new planning copy. An unavailable source, membership change or failed destination validation produces an actionable message while preserving the current menu. Copying a recipe is different from duplicating it as a new catalogue recipe; catalogue duplication is not included here.

## 5. Portion allocation charts — V3-03

Add a small pie chart and percentages to the recipe/meal view when a specific planned or draft meal supplies participant and portion context. Place a legend beside it on wider layouts; wrap below only when needed on narrow screens. Each slice has a distinct accessible color and a legend entry associating that color with the participant's profile emoji and percentage.

The generic catalogue recipe has no date, participants or budgets. It must not pretend that its reference servings already represent a household allocation. Copying it into a meal supplies that context; alternatively a clearly labeled serving preview may select an existing meal. No fabricated household percentage appears on an unplanned recipe.

Activating an avatar in the allocation legend opens a small popover identifying the full member name, meal/date, percentage and that person's indicated portion/calories. Duplicate emojis remain separate entries keyed by membership ID. The avatar action identifies the person; it does not unexpectedly navigate away to Profile. Show an accessible name containing the person's name, even when the visual legend uses only an emoji.

### D3 proposal: serving allocation

A percentage describes a share of a common preparation, not automatically a share of all calories or all food mass in a multi-component meal. Show separate allocation groups when people use different recipes, substitutions or optional components. For example, a tofu preparation and chicken preparation cannot be combined into a single serving pie; dessert has its own group and excludes people skipping it.

For an identical preparation, derive an estimated serving allocation from its planned portion quantities. For genuinely proportional portions, normalized portion factors give the same shares as ingredient mass. Example: two portions of the same preparation scaled toward 600 and 400 kcal are approximately 60% and 40%, subject to practical rounding. Do not divide budgets alone when variants have different energy density.

Show actual ingredient quantities alongside the guide. Independent ingredient/unit rounding can prevent one exact percentage from describing every ingredient. If quantities are not sufficiently proportional to represent one shared batch, show component/ingredient-specific allocations rather than an exact-looking combined pie. The implementation must define and test its proportionality/rounding tolerance, document the basis and label estimated shares. Do not infer cooked grams or cooking yield from raw ingredient weights.

A person eating out has no home-cooked ingredient allocation. Show their eating-out description/calories separately; do not assign them a fictitious share of the prepared batch. An unplanned person is not a zero-calorie serving. A group with one participant may show 100%; a group without positive quantities has no pie.

### D3 alternative: calorie shares

If the user selects calorie shares instead, use each included portion's recorded/planned `kcal` divided by the sum of those portions' `kcal`, and label the chart Calorie share. Never call that percentage a serving/weight split. Clearly state whether eating-out portions are excluded from the preparation chart; their calories remain in daily totals.

### Shared presentation rules

Use native SVG with a small stable household palette that works in light/dark modes. Keep member-to-color mapping stable within the household/session and across associated charts. Pair color with emoji, identity and numeric text so color is not the only key. Pie slices can delegate interaction to the adjacent legend; the numeric/identity table remains usable by screen readers and without the graphic.

Calculate with full precision. Round display percentages consistently and use an apportionment method so visible slices sum to 100%; never modify ingredient quantities or nutrition totals just to make displayed percentages add up. Zero, missing or invalid denominators must produce an explicit empty/unsupported state rather than NaN, Infinity or invented equal portions.

## 6. Shopping automatically drops expired-day contributions — V3-04

The selected shopping interval remains visible and persistent. Within it, only non-expired planned home-cooked portions contribute generated ingredients. When a date passes the household's existing shared closure boundary, remove that date's contribution regardless of whether its products were checked.

Retain the current rule: a shared date becomes closed as soon as that date has ended for any active household member, using the server's accepted timezones and cutoff rules. All clients use the same authoritative boundary. The signed-in viewer must not produce a different shared shopping list merely by being in another timezone.

Reaggregate ingredient quantities across the remaining eligible dates. Example: 300 g of tomatoes belong to a now-closed day and 200 g to tomorrow. The generated row becomes 200 g; it is not deleted wholesale. If its only 300 g contribution expired, remove the row whether checked or unchecked. Preserve checked state for a surviving decreased/equal quantity, following the existing rule; a decrease does not create an increased-quantity warning. Future increases still uncheck/highlight normally.

Keep manual additions, including checked ones, because they are independent of meal dates. Do not erase historical meal recipes, nutrition references or calorie intake to clean shopping. Correcting a past meal later must not put its expired ingredients back into today's list.

Reconcile on authoritative shopping/snapshot reads and menu mutations, and refresh visible clients at the next relevant cutoff or foreground/reconnect. Opening the app after several days must remove every expired contribution in one reconciliation. The feature must not depend on a browser tab remaining open overnight or a paid background job.

Offline, hide/subtract expired contributions only when the cached data has sufficient date/source information. If that provenance is unavailable, show that the offline list needs a refresh instead of claiming stale totals are current. Preserve queued checks; removed generated IDs are discarded through the existing removed-item acknowledgement behavior, while surviving IDs retain valid pending intents. Reconcile with the server when connectivity returns.

## 7. Closed-day check and historical editing — V3-05

Replace the Closed text pill in Menu day headers with an outline check control. Its accessible label/title still identifies a closed day. Normal closed-day recipe reading remains available, with editing actions hidden until the exception below is accepted.

Five consecutive activations on the same check offer Edit this recorded day. Each activation makes the check progressively redder. A working default is five activations within five seconds, resetting after inactivity, activation of another day, week navigation or dismissal. Keyboard activations count too; repeated keydown auto-repeat does not count as separate deliberate activations. Respect reduced-motion preferences and keep a visible focus state.

The fifth activation opens an offer; it does not itself change records. Accepting opens a clearly marked historical edit session for that date. Cancelling resets the counter/color and leaves the day untouched. The Easter egg is a discovery interaction, not an authorization credential.

### Proposed D2 boundary: recorded meals only

Allow authorized household meal editors to correct the selected date's breakfasts, lunch and dinner, including per-person portions, recipe choices, optional components and recorded eating-out descriptions/calorie estimates. Any active household meal editor may invoke this workflow, consistent with existing shared-meal permissions. Personal profiles, accepted targets/budgets and outside-food/weight/activity logs remain under their existing self-only rules and outside this exception.

Show an eraser within the historical editing UI. Erase this day's meals requires explicit confirmation identifying the date and affected recorded meals. It removes all that day's planned meal slots, including eating-out portions inside them, but not recipes, catalogue ingredients, personal logs, household membership or any other date. An empty corrected day becomes incomplete in its calorie summary.

Use the historical accepted target/budget context to explain the recorded day, not a silently substituted current calorie target. Preserve existing saved recipe/nutrition snapshots for unchanged portions. New corrected quantities/recipes capture their own correction snapshot and recalculate the affected recorded meal totals. Keep a record of who corrected/erased what and when. A corrected calorie summary changes historical assumed intake; it does not retroactively accept a weight target or change current budgets/activity estimates.

Editing is online and explicitly scoped to one household, date and editor. The normal historical lock remains closed for every other operation. A working session duration is ten minutes, ending on save/erase, cancellation, expiry, sign-out, membership loss or reload. Another editor's change requires a fresh review before saving. Show that the edited day is historical and return to the normal closed state afterward. A day erased through this workflow must not regenerate its deleted historical meals on the next snapshot.

Ordinary week deletion remains limited to editable dates. Unlocking one past day does not authorize erasing other historical dates. Do not automatically adjust future meals or re-add expired shopping contributions. Cross-date swaps involving history are outside this limited correction workflow; users can read/copy a historical recipe into a new future meal through the ordinary clipboard.

If D2 includes personal logs instead, a separate design revision is required for personal-day snapshots, self-only log correction, MET/weight context, recalculation and eraser scope. Do not infer that selecting an historical shared day authorizes editing another person's health logs.

## 8. Activity selection and local recency — V3-06

Replace the single long activity/intensity list with two selectors: Activity type, then Pace or intensity. Types are distinct meaningful activities such as Walking, Running, Cycling, Stationary bike and Strength training. The second selector contains only the selected type's supported source-coded choices. Changing type resets an incompatible intensity; submitting requires a valid final activity code and duration.

Retain published Compendium codes, age limits, MET values, attribution, metric labels and the existing net-activity expenditure formula. This is a selection improvement, not a new calculation method or expansion to unsupported ages. An activity with one supported intensity still has a clearly selected one-option intensity control; do not invent extra choices.

After a successful activity save, remember the selected type and source-coded intensity as the most recent option on that device. Put that type first, mark it Recent, and put the saved intensity first in its own selector. Reopening may preselect this valid pair; editing an existing entry always selects that entry's actual saved code instead of the recent preference. Remaining options keep a predictable localized order without duplicates.

Store this tiny preference in application/device storage, scoped to the authenticated account and household membership. Do not add a database recency field/table, request or write. Do not derive recency from a failed submission or an unsaved selection. Do not remember weight, expenditure totals, a copied description or duration as part of this preference. Clear it with household/account data on explicit sign-out or access revocation; separate users sharing a browser must not inherit one another's recent exercise. If storage is unavailable or the stored code is no longer eligible, use ordinary selector defaults without blocking logging.

## 9. Catalogue layout and pagination — V3-08

Move New recipe and New ingredient out of the catalogue header to the footer of their corresponding collection. The bottom action remains after the currently loaded cards and load-more control, including an empty-result collection. Keep its label explicit: the centered plus loads more results and must not be confused with creating a recipe/ingredient.

Initially load at most 50 resolved household-visible results for the selected collection. A centered outline plus below the grid loads the next 50, appending without a full reset or scroll jump. Use the accessible label Load 50 more recipes/ingredients, loading/disabled feedback and an end-of-results state. Remove the plus when no page remains. A loading failure preserves existing cards and offers retry.

Working ordering default: newest-created first, with a stable ID/source tie-breaker. Editing an existing item does not pretend to create a new one. Prefer real server creation metadata; legacy records without a recoverable creation time and pinned starter records require a documented stable fallback. Do not invent historical creation timestamps or rely on array order/revision as chronology.

Search and archived visibility apply to the whole resolved collection before pagination. Changing search/filter/kind resets to the first page and a new query context. Do not search only the first 50 cards. An archived private override must continue hiding its starter counterpart unless archived items are requested. A newly created matching item becomes visible near the start; editing/deleting invalidates the affected cursor/query safely without duplicating cards.

This is genuine browse pagination: the catalogue should not download every full recipe/ingredient and merely render the first 50. At the same time, planners, ingredient selectors, recipe dependencies and source validation must not mistake the first page for the complete available catalogue. Historical/offline readers retain their existing exact references. Offline catalogue browsing shows cached pages and clearly indicates when more results need connectivity.

## 10. Weekly controls and calorie information — V3-09 / V3-11

Review the Menu suggestion-controls container rather than assuming a specific unseen layout defect. Use two deliberate control groups: week navigation/range, then Suggest week, eraser and week import. Keep the eraser immediately after Suggest week; keep Only empty slots on its own aligned line. On desktop groups may share a row. On phones they wrap as groups with consistent spacing, readable dates, usable icon targets and no overflow, overlap or isolated icons. Preserve Monday/Sunday configuration, current copy/paste status and existing suggestion review behavior.

Replace the always-visible assumed-intake paragraph with an information icon beside the personal-budget pencil. The information control is available even when viewing another household member's summary and their pencil is hidden. Tapping/clicking or keyboard activation opens a tooltip/popover containing:

> Planned meals count as assumed intake. Empty slots make the day incomplete; budgets are not consumed calories.

The content must not require hover. Support dismissal outside/Escape and return focus appropriately. The preview household can show its existing sample-data explanation through the same control. Removing the paragraph must not remove actual over-budget or missing-data warnings elsewhere. Keep source attribution and calorie-summary completeness indicators.

## 11. Personal budgets falsely reported as failed — V3-10

Reproduce and fix the case where one or more personal meal budgets persist but the app reports that they could not be saved. The current code awaits a shared refresh after mutation and processes both failures through one catch; that is a candidate mechanism, not a confirmed production diagnosis. The three budget fields currently also invoke separate per-meal writes, so partial completion needs explicit handling.

The intended result is one coherent saved set of changed daily budgets. Validate every changed field first, commit the set atomically and return a commit acknowledgement. An acknowledged successful save must remain successful if a later refresh fails or is superseded. Show a separate non-destructive message when the display could not refresh, with a refresh action; do not tell the user their committed budgets failed.

A rejected mutation keeps the draft and reports why it was not applied. A timeout with no trustworthy acknowledgement is an unknown outcome, not proof of rollback; refresh/reconcile before encouraging a duplicate write. Keep retries safe. Clearing a field/restoring defaults and changing only one of the three meals retain their current meanings. Existing planned portions still require manual review after a budget change.

## 12. Acceptance overview

| ID    | Minimum user-visible acceptance                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| V3-01 | Swap/move breakfasts in saved and draft menus; recompute destination portions; preserve uninvolved people; resolve D1.         |
| V3-02 | Copy changes destination icons to paste; occupied targets require acceptance; cancelling/conflicts preserve data.              |
| V3-03 | Correctly labeled percentages, pie and avatar legend; duplicate emojis identify the right person; resolve D3.                  |
| V3-04 | Midnight/cutoff removes checked and unchecked expired gram contributions, preserving future/manual requirements.               |
| V3-05 | Five deliberate check activations progress red, offer editing and enable a scoped confirmed eraser; resolve D2.                |
| V3-06 | Two relevant selectors, valid source codes and a recent successfully saved local-only preference.                              |
| V3-07 | Long press/right click/keyboard Copy to menu navigates and exposes compatible paste targets without accidental recipe opening. |
| V3-08 | Footer creation actions; 50 actual initial results; plus appends; whole-collection search and stable ordering.                 |
| V3-09 | Week controls remain grouped and usable on narrow phones, large text and both languages.                                       |
| V3-10 | Saved budgets never receive a false rollback message merely because subsequent refresh failed.                                 |
| V3-11 | The information icon beside the pencil reveals the complete assumed-intake explanation on touch and keyboard.                  |

Detailed verification and rollout checkpoints are in [the milestone plan](milestones.md). Implementation of conditional behavior waits for D1–D3; independent documentation and design can continue.
