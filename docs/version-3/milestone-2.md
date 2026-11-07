# Version 3 milestone 2 — meal swaps and the planning clipboard

Status: implemented for review. This milestone delivers V3-01, V3-02 and V3-07 under confirmed D1. Allocation charts, activity selection, catalogue pagination and historical correction remain in milestones 3–4. No hosted SQL, merge or deployment has been performed from this workspace.

## Swapping and moving

The outline up/down arrow now works in both suggestion previews and saved menus. Select a source, then its destination; select the source again or use the cancel action to exit. Copy and swap modes are mutually exclusive.

Breakfast endpoints include a person as well as a day. They can cross people, dates or both, including two people on the same day. Use the household-member selector to choose a different recipient in the saved Menu; suggestion previews show every recipient together. Shared lunch/dinner endpoints exchange the whole shared recipe choice. Breakfast/shared swapping is incompatible; recipe copy/paste can cross these categories only when the recipe explicitly supports the destination meal type.

An empty destination moves the choice and empties the source. Other people's breakfasts remain unchanged. Empty saved cards become destinations while a transfer is active. Missing suggestion endpoints appear in an **Empty destinations** section while selecting a destination. Preview locks continue protecting their specific recipient or shared slot.

Each destination is rebuilt using its current accepted target, date-specific budget, dietary pattern, exclusions, compatible substitutions, optional dessert choice and practical unit rounding. Swapping exchanges choices, not original gram quantities or restaurant descriptions. Cross-person breakfast swaps carry the selected breakfast's dessert preference to the new recipient. A copy retains preferences only for matching recipients; unmatched recipients use recipe defaults, shown during review.

Draft swaps change only the preview; final week approval is still required. Saved swaps show both resulting meals and personal portions before one atomic apply. All results must satisfy the full final-menu variety window, including retained neighboring days. A failure changes neither endpoint. Historical days remain read-only for ordinary transfers; they may supply a copyable recipe reference.

## Copy, paste and overwrite review

The outline Copy control appears on existing meals. Copying selects that source and changes other editable cards to ClipboardPaste controls. Incompatible destinations are disabled. Unavailable or archived source recipes remain readable but cannot start a new transfer. An eating-out source needs a recoverable underlying recipe; a description and calorie estimate alone are insufficient.

The copied-item banner names the recipe and offers cancellation. The clipboard survives tab changes, week navigation and successful pastes, so the same recipe can be reused. It exists only in workspace memory and clears on reload, sign-out, account/membership changes or access loss. It uses neither the operating-system clipboard nor persistent browser storage. The selected Menu week is also retained across tab navigation.

Every paste opens a destination review with its date, meal, recipients, recalculated calories, ingredient quantities and substitutions. Occupied targets require **Replace and paste**, including apparently identical choices. The warning explicitly includes replacing eating-out entries and dessert choices. Cancel leaves the current menu and clipboard intact. A breakfast paste changes only that recipient; a shared paste resolves the current eligible household roster.

A newer household revision or recipe reference invalidates an old review. A rejected destination selection shows its error inside the suggestion dialog or saved-menu transfer banner. A rejected apply retains the review and shows its error; refresh/reselection is required after a conflict. An uncertain response is labeled as uncertain and disables repeat application from that review. Close it and use the existing Refresh action to reconcile before deciding whether another operation is needed. Acknowledged commits keep the milestone-one saved-versus-refresh behavior. Transfers are online operations and are not added to the offline shopping queue.

## Catalogue context actions

A stationary 500 ms touch press opens the recipe's context dialog. Movement beyond 8 px, scrolling, pointer cancellation and unmounting cancel the timer. The resulting release/click does not also open the recipe reader. Desktop right-click, Context Menu key and Shift+F10 offer the same action. Ordinary click still opens the read-only reader, which also includes **Copy to menu** as a discoverable alternative.

Copy to menu stores the current recipe reference, closes the overlay and navigates to the selected Menu week. It does not choose or save a destination. Archived recipes remain viewable but their copy action is disabled. Ingredient cards keep their ordinary read/edit behavior; they are not meal clipboard sources.

All transfer controls use the existing Lucide outline icons with translated accessible names, selected states, tooltips and at least 44 px targets. Destination reviews and context actions support English/Spanish and the existing light/dark themes.

## Database design and rollout

Apply [migration 14](../../supabase/migrations/202611070014_meal_transfers.sql) **after successful migrations 1–13 and before deploying this client**. Apply only the pending migration; do not replay successful scripts or delete existing household/browser data.

The additive public APIs are `preview_meal_transfer` and `apply_meal_transfer`, both requiring the expected household and membership. Requests contain endpoints, recipe IDs/revisions and optional dessert preferences. They do not contain authoritative calorie values, ingredients, recipient rosters or arbitrary replacement plan batches.

The server resolves the private/common catalogue, substitutes compatible ingredients, performs proportional unit-aware rounding and captures trusted nutrition references. It preserves unrelated personal breakfasts without recalculating them. Review returns the changed slots, occupancy, household revision and a fingerprint of the request and server-built result. Apply holds the existing household transaction lock, revalidates the revision and complete result, checks explicit overwrite acceptance, commits all affected slots and reconciles shopping once. A moved source with no remaining portions is deleted; a partially populated breakfast plan remains. Suggestion drafts retain an explicit empty source slot until final week approval; the existing reviewed batch API now deletes that slot atomically with the destination instead of retaining the old saved source.

Helpers retain the existing executor/RLS model, an empty search path and explicit function grants. Only the context-checking API helpers are callable by authenticated clients. Lower-level recipe/portion/patch helpers are private; anonymous access is denied. The migration removes its temporary schema-CREATE grant and notifies PostgREST to reload the schema. Existing households, IDs, historical records and earlier API signatures are retained. An older frontend can continue using the additive backend; rolling back the frontend does not require deleting migration 14.

## Verification

Domain and PostgreSQL/PGlite checks cover same-day/cross-date/cross-person swaps, occupied/empty targets, unchanged uninvolved breakfasts, current budgets, exclusions/substitutions, optional dessert, raw-weight nutrition references, kg/volume/piece conversions and practical rounding. They also cover whole-menu variety rejection, missing/archived recipes, closed days, stale recipe/household revisions, forged fingerprints, replay rejection, explicit overwrite, automatic shopping and household/anonymous/private-helper permissions. Repository checks verify expected-context arguments and uncertain/missing-migration responses.

Browser checks exercise draft and saved transfers, overwrite cancellation/acceptance, repeat paste, tab/week retention, reload clearing, right-click, keyboard activation, touch press and gesture cancellation. Production-built Android Chromium and iPhone WebKit profiles check both languages/themes, icon target sizes, overflow and context-to-Menu navigation. Screenshots are produced as test artifacts. Existing planning, household, shopping, PWA update/offline and recovery checks remain required.

Verification results:

| Check                                                     | Result                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full unit/database suite                                  | 131 passed                                                                                                                                       |
| Final targeted repository/domain regression checks        | 16 passed                                                                                                                                        |
| Main browser suite                                        | 30 passed, followed by 7 transfer checks including 2 additional regressions                                                                      |
| Authenticated-client browser scenarios                    | 21 passed across desktop/phone Chromium and iPhone WebKit                                                                                        |
| Production-built Android/iPhone release scenarios         | All 18 scenarios verified across the full run and targeted reruns; final transfer/device and English week-copy checks passed together (6 checks) |
| PWA offline, update and recovery scenarios                | 15 passed                                                                                                                                        |
| Production build, formatting and documentation link paths | Passed                                                                                                                                           |

Concurrent browser runs exhausted time budgets in the longer iPhone scenario and one reload scenario. Both passed when the suites ran sequentially, without changing assertions or time limits. Screenshots are generated into Playwright's per-test artifact directory for portable CI collection; local review captures were also inspected in both themes.

Automated device profiles are emulations, and authenticated-client tests intercept test-only Supabase responses. Hosted acceptance still requires real Google sessions, two isolated households, an invited second member, Realtime/two-editor observation and physical phones after migration 14 and the approved client rollout.
