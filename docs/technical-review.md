# Technical-design review

Scope: the current product specification and technical design in this repository. This is a document/architecture review, not a code audit or application-test result.

Outcome: engineering review complete. The reviewed blueprint is consistent enough to begin the first milestone when implementation is requested. No application code, database migrations, source imports, service provisioning, or browser tests were performed.

- [Product specification](specification.md)
- [Reviewed implementation blueprint](technical-design.md)

## 1. Product decision resolved during review

Changing the shopping list's date range preserves checked states for generated ingredients that remain, using the existing increase/decrease rules. Manual additions and their states are always retained. The user explicitly chose this over starting a new unchecked shopping round.

This decision is reflected in list identity, revision, and offline-operation handling.

## 2. Findings and resolutions

| Finding | Resolution in the blueprint |
| --- | --- |
| One shared lock could accidentally close another member's still-current personal day | Separate household meal-date locks from personal-day contexts/snapshots |
| A catalogue nutrition edit could conflict with saved portions and history | Version source data; recalculate unlocked saved quantities without resizing; preserve locked inputs |
| Editing a saved recipe could erase another person's planned ingredient edits | New recipe version for future selections; explicit preview before replacing existing planned quantities |
| An unfilled meal could look like a completed zero-calorie meal | Show known-calorie subtotal and incomplete/provisional projection |
| Budgets and meal calories could be counted twice | Separate allocated budgets from intake; recipe/eating-out mode is mutually exclusive |
| Removing a member or changing a timezone could reopen an expired date | Enforce old cutoffs before metadata changes; locks are irreversible |
| Owner bootstrap could reclaim ownership after a transfer | One-time singleton bootstrap; login/redeployment does not reassign an existing owner |
| Removal could leave an approved identity able to rejoin automatically | Revoke membership and its re-entry approval atomically; reinvitation is explicit |
| Retrying an offline checkbox write could overwrite a newer state | Deduplicate operation IDs and return the original acknowledgement without reapplying |
| Date-range changes could accidentally reset checked items or lose manual entries | Same reviewed diff across ranges; stable surviving item IDs and independent manual items |
| Nutrition/volume/cooked-state or countable-unit rounding could produce incorrect calories | Explicit state/conversion metadata, decimal arithmetic, one rounding pass, final saved values used downstream |
| Small required quantities could round to zero silently | Flag for explicit review rather than silently omit or inflate ingredients |
| Broad database functions or raw change streams could bypass intended sharing | Explicit permissions and narrow function grants; minimal authorized revision notifications followed by protected reads |
| Browser background execution or storage could be assumed permanent | Foreground resume/reconnect synchronization; storage/quota handling and no promise of permanent offline copies |

These resolutions implement the agreed scope. They do not add guest handling, pantry inventory, native applications, AI recipes, or extra households.

## 3. Consistency checks

Reviewed the following design paths end to end:

- Personal breakfast recipe → rounded portion → calorie subtotal → shared shopping contribution.
- Shared lunch/dinner → per-member substitution and optional dessert → one effective portion per person.
- Eating-out replacement → manual calorie estimate → original portion excluded from totals and shopping.
- Weight update → proposed intake-target review → budget review → no silent target acceptance or portion resize.
- Logged activity → replacement expenditure for that date → unchanged accepted intake target.
- Catalogue edit → unlocked nutrition recomputation → locked meal snapshot unchanged.
- Owner transfer/removal → permissions and future-entry cleanup → historical references preserved.
- Meal edit → shopping preview → current checked-state handling → outbox synchronization after reconnection.

The three-day variety contract is now explicit: lunch/dinner only, breakfast exempt, household-configurable, cross-week checks, canonical main/base keys, and no automatic relaxation on failure.

## 4. Arithmetic spot checks

These calculations verify the documented equations only. They are not medical recommendations or application tests.

Synthetic profile: male, 70 kg, 175 cm, age 35, active multiplier 1.55.

| Calculation | Result |
| --- | ---: |
| Mifflin–St Jeor resting estimate | 1,623.75 kcal/day |
| Usual expenditure: resting × 1.55 | 2,516.8125 kcal/day |
| Approximate planning deficit: 4 kg × 7,700 / 56 days | 550 kcal/day |
| Illustrative proposed intake: usual expenditure − deficit | 1,966.8125 kcal/day |
| Net activity: 30 minutes at 4 MET and 70 kg | 105 kcal |
| Logged-day expenditure: resting × 1.2 + 105 | 2,053.5 kcal/day |
| Logged-day deficit for an assumed 1,900 kcal intake | 153.5 kcal/day |

The four-kilogram example means a 70 kg starting weight and 66 kg target over 56 calendar days. Its nominal loss rate is 0.5 kg/week. It passes the two agreed arithmetic screens, which does not establish individual suitability.

Boundary contracts for implementation checks:

- Exactly 1 kg/week passes the rate limit; more than 1 fails.
- Exactly 1,200 kcal/day fails the intake screen; evaluate before formatting.
- A same-day/past loss deadline cannot enter division.
- Rounding examples: 264 g → 260 g; 15 ml → 20 ml; 3.4 g → 3 g.
- A required positive quantity rounding to zero requires explicit quantity review.
- A three-day window rejects Monday/Wednesday reuse but permits Monday/Thursday.
- Calendar-day differences remain correct across daylight-saving transitions.

## 5. Concurrency and offline scenario review

| Scenario | Required outcome |
| --- | --- |
| A recipe is changed while another member edits it | Reject stale save; retain draft for comparison |
| A quantity increases while its item is checked | Apply reviewed increase, uncheck, highlight |
| A queued offline check is accepted after that increase | It can recheck the item under the agreed server-order rule |
| A previously accepted operation is retried after another change | Return original acknowledgement without changing current state |
| A removed item's offline change arrives | Notice and discard; continue other valid changes |
| The date range changes but an ingredient survives | Preserve state unless increased, using the latest checked state |
| A generated item is removed and later recreated | New stable ID; an old queued change cannot attach by label |
| A member is revoked before reconnection | Backend rejects access; client stops syncing and clears caches on detection |
| The app has not run at the date cutoff | Backend locking/version rules still prevent historical mutation |
| One member's day has ended while another's has not | Meals locked for all; the latter's personal logs can still be recorded |
| The user signs out offline with pending changes | Explicit discard permits local sign-out/cache clearing; no false claim of remote revocation |

These are design expectations, not executed multi-client tests.

## 6. Backend reference checks

Consulted primary Supabase documentation:

- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Database-function permissions](https://supabase.com/docs/guides/database/functions): table policies alone are insufficient for privileged functions; execution and internal authorization require deliberate configuration.
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes): deletion-event limitations mean raw delete filtering cannot be the household access boundary.

The blueprint uses minimal revision notifications and authoritative protected refetches instead of relying on complete or durable change events.

No service security configuration was changed or verified against a deployed application.

## 7. Remaining delivery work

There is no outstanding product question from this review. The following are implementation or content artifacts, not another feature-definition exercise:

- Select source release manifests and document import coverage/attribution.
- Prepare the CoFID subset, conversions, main/base keys, curated substitutions, and bilingual recipes.
- Resolve actual source activity coverage without inventing MET mappings.
- Produce minimal screen composition and accessible status text within approved navigation/themes.
- Supply the owner's Google email and hosting/OAuth configuration at setup.
- Implement migrations, database policies/functions, calculations, and client flows.
- Run the milestone-specific verification scenarios on code, including real Android/iPhone browser and installed-PWA behavior.

Milestone reviews remain in place. This review completes the authorized technical-design review and does not itself start milestone 1.
