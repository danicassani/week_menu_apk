# Version 3 milestone 3 — portions, activity and bounded browsing

Status: implemented for review. This milestone delivers V3-03, V3-06, V3-08, V3-09 and V3-11 under confirmed D3. Historical correction remains milestone 4. Version-four requests remain in their separate backlog. No hosted migration or deployment has been performed from this workspace.

## Serving allocation

Meal snapshots and recipe readers opened from a specific suggestion/transfer show small native SVG pies with numeric legends. A generic catalogue recipe has no household split. The reader retains the actual clicked meal, including its date and recipients, instead of finding an arbitrary first use of the recipe.

Each group represents one preparation/component of a particular recipe, its ingredients, nutrition reference state/basis/revision and effective preparation instructions. Relevant substitutions split a preparation; a substitution in the main does not split an otherwise identical side. Different breakfast recipes and optional desserts remain separate. Eating-out entries are listed with their description/calories and receive no fictional home-cooked share.

A common preparation uses each person's actual positive ingredient grams as its serving basis. This is an estimated preparation share, not a budget/calorie-share chart or cooked-yield calculation. For each included ingredient, compare the person's fraction of that ingredient against their fraction of total preparation weight. The common pie is allowed only when every difference is at most **five percentage points** after practical rounding. Otherwise, show explicitly labeled ingredient-level divisions. Invalid/missing/nonpositive quantities produce an unsupported notice, not an equal split or NaN.

Percentages use largest-remainder apportionment to whole numbers, with deterministic ties, so each visible group sums to 100 without modifying food quantities or nutrition. One-person preparations show 100%. An identity-scoped palette retains each member's assigned color across charts and roster changes within the workspace; colors also have text/emoji/name/percentage legends and visible boundaries in both themes.

Profile controls resolve membership IDs, not emoji text. Activating an avatar opens that person's name, date/meal, percentage, planned grams/calories and exact ingredient quantities/units. Escape dismisses it and returns focus; it does not navigate to Profile. Duplicate emojis remain separate identities. The planned meal's full quantities/instructions remain available in the reader.

## Activity selection and local recency

Activity type and Pace or intensity are separate required selectors. Stable local type IDs group the existing source codes; outdoor cycling/stationary bike and walking/hiking remain distinct. The intensity selector contains only that type's eligible published variants. Changing type clears incompatible codes, while a one-choice type selects its sole supported code. An edited entry takes precedence over recency. Invalid saved codes and ages outside the source's 19–59 range do not invent METs or enable unsupported saves.

The existing Compendium codes, source links, METs, metric descriptions and net-expenditure calculation are unchanged. After the activity write is acknowledged, a versioned local preference stores only its type/code. That pair is labeled Recent and appears first on reopening; unsaved selections, rejected writes and uncertain outcomes do not update it. An acknowledged save followed by failed household refresh still updates Recent.

Preferences are scoped by account/household membership and stay on that device. Explicit sign-out, observed access loss, membership replacement and account replacement clear the corresponding preference. Unavailable/invalid storage falls back to ordinary defaults. There is no recency table, database field, additional request or write, and no stored duration, weight or calorie total.

## Genuine catalogue pages

Initial browsing requests at most **50 resolved summaries**, followed by a centered outline plus to append the next page. Creation is a separate labeled action at the collection footer. Page failure preserves existing cards and offers retry; changing kind, search, archive visibility or content revision starts a new query generation and ignores older responses. Search matches both entered-language names across the complete resolved collection before limiting. IDs are deduplicated when appending.

`get_catalogue_page` applies household/private-override resolution before filtering and paging. An archived private override hides its common starter counterpart; requesting archived items returns only that resolved item. Summaries omit recipe components/instructions and ingredient conversions/source records. `get_catalogue_item` fetches the requested full item and, for recipes, its ingredient dependencies.

The live client requests the compact overload of `get_household_snapshot`, retaining saved meal snapshots and only their currently needed recipe/ingredient references. Entering the weekly planner or explicitly opening an editor/profile ingredient selector loads the complete planning graph through the existing library API. Browsing itself does not prefetch that graph. Generation and ingredient choice therefore retain complete candidate coverage instead of treating the first 50 as the available library. A complete graph is reused only at the same household revision.

The fictional preview repository is now a separate lazy module. Public starter recipes/nutrition are not imported by the live application entry. Default production service-worker precaching excludes the unused preview module and starter pack; explicit preview-enabled builds retain them for the existing offline demo. This avoids moving the former eager catalogue payload into a hidden initial public-asset fetch.

### Ordering and cursors

New private custom items receive a real server creation time in a private, RLS-scoped chronology table. Migration backfill uses the earliest available immutable content-version event. Pinned starters and their overrides use the stable null-time fallback; legacy items without credible chronology also remain null. Editing an item preserves its position. Migration time is never presented as historical creation.

Order is creation time descending, nulls last, then ID in C collation. Cursors contain version, expected household/membership, kind/query/archive context, the first page's observation boundary and the last creation-time/ID key. They are opaque position data, not authorization credentials. Newly inserted records after that boundary are excluded from subsequent pages and appear on a refreshed first page. Context/query mismatches and malformed cursors are rejected. The server always rechecks active membership and applies RLS.

### Offline data

Additive fields on existing cache objects retain the last loaded summary pages and exact fetched details. The offline collection distinguishes saved pages from the full collection and asks for reconnection when more results or uncached details are needed. Ingredient details are read-only offline. Compact refreshes merge retained detail references rather than erasing the last loaded recipes. Existing menu snapshots, pending checks, receipts and queue generations are preserved; no IndexedDB reset or version upgrade is needed.

## Week controls and calorie help

Menu now has explicit week-navigation/range and suggestion/eraser/import groups. The eraser remains directly after Suggest week, and Only empty slots remains on its own line. Groups wrap independently on narrow screens, including 320 px and enlarged text.

The always-visible assumed-intake paragraph is replaced by an information control beside the budget pencil. It remains available when another member's pencil is hidden. Touch/click/keyboard activation exposes the complete explanation, including that empty meals make the day incomplete and budgets are not consumed calories. The preview's sample-data explanation remains available there too. Outside activation and Escape dismiss the popover; actual calorie warnings and attribution remain.

## Migration and compatibility

Apply [migration 15](../../supabase/migrations/202611070015_catalogue_pages.sql) **after successful migrations 1–14 and before deploying this client**. Only apply pending SQL.

It adds private chronology, scoped insert triggers, an invoker-security resolved browse view, bounded page/detail APIs and a compact snapshot overload. Existing resolved union-view columns are unchanged. The two-argument snapshot and full planning-library APIs remain compatible with installed older clients. New helpers use the restricted executor, explicit empty search paths, RLS and explicit grants; anonymous access is denied. The migration removes temporary schema-CREATE permission and reloads PostgREST metadata.

A frontend rollback can retain this additive backend. Existing household/member IDs, menus, calorie targets, source references and shopping data are preserved. There is no hosted configuration change or automatic SQL application in this PR.

## Verification

Checks include actual migration execution and security/grant audits; 110 additional recipes with equal creation timestamps; successive 50-item pages; inserts between page requests; whole-collection search; immutable ordering on edits; archived overrides; wrong-household and private-table access; compact versus legacy snapshots; preserved offline detail/pending-check state; allocation variants, rounding and invalid data; selector eligibility and storage isolation; UI paging failure/race handling; and authenticated activity acknowledgement versus refresh failure.

The authenticated HTTP fixture measures initial/page response sizes and asserts no `get_planning_library` request during browsing. Actual PostgreSQL/PGlite payload measurements are recorded with the final results below. These measurements describe fixtures, not production traffic or a promised free-tier household capacity.

| Check                                                      | Result                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------- |
| Full unit/database suite                                   | 145 passed                                                |
| Main browser coverage                                      | All 37 scenarios verified across full and targeted runs   |
| Authenticated-client scenarios                             | 24 passed across desktop/phone Chromium and iPhone WebKit |
| Production-built Android/iPhone release scenarios          | 22 passed                                                 |
| PWA installation/update/offline/recovery                   | 15 passed                                                 |
| Production build, formatting and local documentation links | Passed                                                    |
| Local production public-shell deployment audit             | Passed; all 15 declared public assets available           |

Actual database-fixture JSON measurements use UTF-8 byte counts: the compact snapshot is **40,195 bytes** versus **335,778 bytes** for the compatible full snapshot (about 88% smaller). It includes two referenced recipes rather than all 48. The first page of the 110-custom-recipe fixture contains exactly 50 summaries and is **10,520 bytes**. Full recipe/component/nutrition graphs are fetched only when explicitly needed.

One development-browser run verified 36 of 37 scenarios while source editing triggered a Vite remount during the shopping reload case. That unchanged case passed on its isolated rerun; the final allocation scenarios were also rerun after the palette refinement.

The device profiles are emulations; authenticated-client tests intercept test-only Supabase responses. Hosted acceptance still requires real Google accounts in isolated households, invited-member behavior, Realtime, migration rollout and physical Android/iPhone checks. Earlier failures caused by a test locator navigating only to the avatar wrapper were corrected to select its enclosing legend row; the application assertions were retained.
