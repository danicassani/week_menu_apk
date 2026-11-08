# Version 4 — design and decisions

Status: implementation design prepared from the thirteen [backlog requests](README.md). D4-01 and D4-02 are confirmed by the user. The baseline is the merged V3 milestone-four implementation, ending at migration 16. This document does not claim a deployment or implemented V4 behavior.

## Confirmed decisions

- **D4-01:** theme colour stays on this device alongside the existing light/dark preference. No Supabase preference column or extra write is needed.
- **D4-02:** use the starter egg piece-weight estimate as an editable household default, labelled as an estimate. Aggregate compatible grams first and round the purchasing requirement upward to whole eggs.

Working defaults: today's still-open meals count as upcoming; the eye sits beside a meal's title, separately from its five bottom actions; theme selection lives in Profile settings. These choices follow the existing requests and can be adjusted during milestone review.

## Menu, dashboard and target review

Keep one bottom row on occupied editable meal cards: pencil, dice, copy/paste, eraser, vertical swap arrows. Reuse the existing outline icons and transfer state machine. Extract action rendering if needed so copy and swap can be placed without duplicating their state or review dialogs. The eye is a separate read-only action near the title. Retain clickable recipe names. Eating-out portions use the existing recorded-meal reader rather than inventing a recipe.

Each icon needs a translated accessible name and tooltip, visible focus and a practical touch target. At 320 px and enlarged text, keep the order and allow wrapping instead of clipping. Preserve individual breakfast destinations, reusable clipboard behavior, explicit overwrite acceptance and two-editor review. An eraser removes only its meal using the existing confirmation; it never means erase week or historical day.

Empty editable slots show `— — —` beside Suggest / Sugerir. Give the slot a meaningful accessible date/meal description. Closed slots keep normal edit actions hidden, with reading and the V3 five-activation historical correction workflow intact. Copying readable historical recipes into future meals remains supported.

Remove only the dashboard's weekly preview and shopping shortcut. Keep View week, today's meals, calorie information and all navigation tabs. Give Sync now a button appearance while preserving its existing pending/offline/busy and queue semantics.

Reproduce the target-review defect before changing its logic. `openTarget` currently depends on the selected member being the signed-in person and delegates to the asynchronous proposal flow. Trace the actual dashboard/profile trigger, ownership guard, proposal response, busy state and dialog lifecycle. These are investigation points, not a confirmed diagnosis. A failed proposal must show an actionable error; accepting a revised target still requires explicit review of target and budgets. No automatic acceptance or calorie-formula change.

## One allocation bar per shared meal

V4-10 supersedes V3's visual presentation of separate preparation pies. No allocation graphic appears for breakfast, including readers, suggestion previews and historical correction review. Individual quantity information remains available.

Lunch and dinner show at most one horizontal rectangular bar, segmented by member, aggregating their home-cooked portions across mains, sides, optional dessert and substitutions. Keep stable membership-based colours, visible percentages, an accessible text legend and avatar activation identifying the person and exact quantities. No component or substitution creates an additional chart. A generic unplanned catalogue recipe still has no invented household allocation.

Working calculation for implementation review: use each member's total positive recorded ingredient grams divided by all home-cooked ingredient grams for that meal. Label it **share of total planned ingredient weight**, not a calorie share or a guide to dividing every preparation. Raw ingredient mass is not cooked yield, and distinct tofu/chicken portions do not become a common preparation merely because they share a bar. Retain exact per-person/component quantities as the practical serving instructions; explain that the combined percentage is an overall summary only.

Exclude eating-out portions from the bar and list them separately. All-eating-out or invalid/zero-mass meals show an explanation instead of fabricated segments. Optional dessert affects only its recipient's recorded totals. Whole display percentages should sum to 100 through the existing deterministic apportionment, without changing any quantities, nutrition, recipes or saved snapshots. Keep the aggregation metric a documented working choice until reviewed with representative meal captures.

## Historical editor layout and unchanged activation icon

V4-11 supersedes the V3 progressive-red discovery interaction. Keep the shared five-activation counter and time/date/navigation reset rules, but remove its visual progress states and visible button treatment. The check remains a keyboard-operable named action internally, without checkbox semantics, a checked/pressed state, colour changes, click animation or persistent touch focus decoration. Keyboard-only focus must remain visible for navigation accessibility; clicking/tapping leaves the icon visually unchanged until the fifth activation opens the offer. This presentation change never becomes a server authorization mechanism.

Audit historical editor action containers rather than globally changing every Button style. Group review/save as primary, cancellation separately and destructive erasure with deliberate separation. Use consistent gap and wrapping, including offer, stale/expired, unknown-acknowledgement, review and erase-confirmation states. Maintain keyboard order, busy guards and confirmation boundaries. Capture the full dialog top and action footer at narrow widths and enlarged text.

## Quiet shopping increases

V4-12 removes increase-specific presentation across online and offline checklists: no highlighted row, increase badge, message, tooltip or live announcement. Continue displaying the current required quantity and automatically unchecking increased requirements. Keep genuine errors, synchronization/pending feedback and ordinary quantity labels.

Do not remove backend increase comparison merely to remove a highlight: it drives unchecking and must still handle increases whose rounded egg count is unchanged. Audit any stored increase metadata, projections and cached flags so an older row cannot revive removed presentation. An additive backend change is only needed if investigation shows the shared contracts require it; preserving unused flags for older clients can be compatible. Final new-client rendering must be quiet regardless of such flags.

## One authoritative upcoming shopping list

The current reconciliation function retains a stored start/end interval; merely removing the selectors would leave later plans excluded. Replace the backend requirement scope with all household meal plans that still pass the authoritative shared-day cutoff. Do not limit it to the displayed week, the viewer's timezone date, the first 50 catalogue items or a browser-loaded subset of plans.

Introduce an explicit upcoming-scope contract. Existing date-range RPCs used by older clients must not silently narrow the shared list after rollout. Preserve their signatures where feasible, validate their arguments and route legacy range application to the authoritative upcoming reconciliation; document the intentional semantic change. Audit preview/apply and read paths as well as menu-write triggers, rather than repairing only one button. Add scope metadata for new clients; retained start/end fields can describe observed contributing bounds, not an editable filter. Empty generated requirements must be valid and preserve manual additions.

Use one server transaction and existing household serialization to reconcile menu writes, expiration and read repair. Preserve row identity, compatible reference-state grouping, surviving checked flags, increased-quantity unchecking without increase-specific highlights or messages, removed-row acknowledgements and manual items. Reads with unchanged requirements must remain no-ops to avoid Realtime loops.

Offline scope must be explicit. A cache from an older range-based client is not proof that all upcoming contributions are present. Mark that cache as requiring refresh; do not claim a complete future list. After a complete upcoming observation, use complete per-date contribution provenance for offline expiry. Preserve existing queued checks, generations and receipts during any additive cache upgrade. Do not clear IndexedDB or require browser-data deletion.

Measure the server work for meals spanning many weeks and avoid per-day RPCs or hidden full recipe-library fetches. Add indexes only when the query plan justifies them. No paid scheduler is necessary: existing authoritative reconciliation and foreground/cutoff refresh remain the mechanism.

## Eggs as purchasing units

Canonical meal and shopping requirements remain precise edible grams. A purchasing conversion is separate from recipe quantity conversion: enabling an estimated egg display must not make an unconfirmed editorial conversion an authoritative recipe/nutrition measurement.

Use an explicit ingredient identity/purchasing-unit mapping, not a substring test on translated names. Read the actual starter editorial value during implementation; do not invent a universal egg weight. Store a household override with a positive grams-per-egg value and show its estimated status and edit action. Keep household isolation, source attribution and existing catalogue permissions.

For each compatible aggregated row, `purchase eggs = ceil(required edible grams / configured edible grams per egg)`. Keep the exact grams available as secondary information. For example, a 125 g requirement at an explicitly configured 50 g estimate displays three eggs; neither number is a universal conversion claim.

Changing the display conversion must not change meal nutrition, ingredient IDs or historical references. It must refresh the purchasing display online/offline consistently. Continue using canonical quantity increases to trigger existing uncheck rules, without increase-specific highlights or messages even if a whole-egg display count happens to stay the same. Zero generated contribution removes the generated row; manual items keep their entered quantities. Unsupported conversions fall back visibly to grams.

## Clear ingredient names without losing preparation meaning

Create a curated English/Spanish display-name mapping for starter identities. Preserve meaningful qualifiers such as sun-dried tomatoes and distinguish nutritionally different records whose shorter names would collide. Household-created names and private overrides remain authored text; do not regex-strip their words.

Retain original source names, reference state, edible/raw/drained basis, nutrition revisions and conversions. V4-13 removes the separate generic preparation block from readers, including automatically derived dry/raw/cooked-weight boilerplate. Keep actual cooking steps within the recipe instructions. Historic recorded snapshots retain their recorded labels and preparation information; do not rewrite them through a catalogue migration.

Prefer a presentation mapping over changing the pinned starter dataset or reimporting copies into every household. Do not automatically insert replacement preparation notices from the ingredient catalogue. Retain household-authored recipe instructions.

## Plain recipe serving captions

V4-13 replaces the reference-serving jargon with Ingredients for N people, correctly pluralized in English and Spanish using the actual recipe reference-serving count. This is display wording only: retain `reference_servings` and all scaling inputs internally. Do not change a multi-serving recipe into a one-serving recipe to match a caption.

Planned readers show the actual meal/member context and recorded quantities. Audit catalogue, suggestion, saved, historical and offline recipe readers so generic preparation boilerplate does not reappear through another rendering path. Hiding that block does not delete immutable source data or the actual numbered cooking instructions. Review the reported lentil pie specifically, plus a multi-serving recipe and a household-authored recipe.

## Fourteen theme variants

Add a validated local colour-family preference: white, blue, pink, violet, green, yellow or orange. Default to white; retain the existing `week-menu-theme` light/dark value and current system-derived initial choice. Use a separate versioned storage key for colour. Invalid/unavailable storage falls back safely. A device preference can remain on the device across sign-out and contains no household or health data.

Define semantic CSS tokens for backgrounds, surfaces, text, borders, controls, selected states, focus, warnings and charts. Each family has independently checked light/dark values. Pastel surfaces need dark readable foregrounds, not pastel text everywhere. Preserve status distinctions and make charts understandable without colour alone.

Theme controls belong in Profile settings with accessible names/selected state. Keep the header mode toggle. Verify 4.5:1 normal-text contrast and applicable 3:1 large-text/control/focus contrast, both languages, enlarged text, dialogs, offline pages, disabled states and the visually unchanged historical check. Use local CSS/SVG; no image service, font service or paid dependency.

## Rollout boundary

Use additive reviewed migrations for upcoming shopping and purchasing settings if needed. Assign filenames when the implementation is concrete; apply only pending scripts after migrations 1–16 and before the corresponding client. Test old installed clients against the new backend, including their legacy range actions, queued checks and worker upgrades.

This design changes no OAuth, tenancy, accepted calorie methodology, membership permissions or personal health-data persistence. Translation APIs, pantry, photos, guests and simultaneous household memberships remain outside V4. Each milestone ends with a PR and review evidence; hosted SQL and deployment are separate release steps.
