# Version 3 milestone 4 — historical corrections and release review

Status: implemented for review. This closes the planned V3-05 implementation scope under confirmed D2. Integrated verification results are recorded below. Hosted acceptance and physical-device verification remain separate release work. Version-four requests remain in their own backlog.

## Closed-day interaction

Menu replaces the Closed pill with a small outline check. A normal activation leaves the day closed. Five deliberate activations on the **same date within one five-second window** offer historical editing; successive activations tint the check red. Another date, timeout, week/tab navigation, dismissal and remount reset the sequence. Native button activation supports touch, mouse, Enter and Space. Repeated keyboard keydown events do not count. No animation is necessary, including for reduced-motion users.

The offer explains the scope and must be accepted before requesting a server credential. The tap sequence is an Easter egg, not authorization. Reading historical recipes still works normally.

## Online correction and review

An accepted offer requests a ten-minute server session for one household, membership and closed date. Its opaque random token remains in component memory. It is never placed in URLs, browser preferences, IndexedDB, the planning clipboard or offline queues. Cancellation/unmount requests invalidation; reload or connection loss discards the local credential. Server expiry remains authoritative if cancellation cannot reach the server.

The editor covers that date's breakfast, lunch and dinner. It supports individual quantities, recipe choices, optional dessert, per-person eating-out descriptions/required calorie estimates and removal of individual meals. Changes remain a draft until Review correction, then Confirm historical correction. New meal slots require recorded historical participant and calorie context; they cannot silently import today's household roster or targets. Missing context leaves existing quantities available for manual review and blocks automatic scaling or adding an unsupported slot.

Recipe changes use the recorded profile, or the inputs of an accepted target effective on that date where a personal profile snapshot is absent. Existing recorded budgets remain authoritative. New meals use a retained date-specific budget override or frozen personal-day target. Accepted targets, profiles, personal food/weight/activity logs and their immutable personal-day snapshots are never rewritten by this API.

For a retained recipe/component/ingredient/unit, quantity edits use its **recorded** grams-per-unit and energy-per-100 g values. The server ignores client-supplied calories and nutrition metadata. Unchanged portions are retained exactly; new recipe/ingredient references are resolved from the scoped catalogue with appropriate recipe, conversion, source and historical diet checks. Current catalogue edits do not retroactively rewrite old lines. The correction does not enforce variety against neighboring historical days: its scope is correcting what was recorded, without modifying other dates or representing the correction as a new suggestion.

Before commit the editor shows the corrected serving allocations and exact quantities. Erase this day's meals has a separate confirmation naming the date and affected slots/participant counts. It deletes all recorded meals and eating-out portions for that date. The date stays closed and becomes incomplete in its assumed-intake summary; removed meals do not regenerate on reload.

## Server boundary, concurrency and audit

[Migration 16](../../supabase/migrations/202611070016_historical_corrections.sql) adds the dedicated APIs:

- `begin_historical_correction`: verifies current household/editor context, closed date and expected household revision; returns the canonical date's meals and a ten-minute credential.
- `apply_historical_correction`: verifies context again, credential/date/expiry/revision and a maximum of three unique meal slots; normalizes all changes before applying the selected date atomically.
- `cancel_historical_correction`: invalidates only that editor's credential.
- `get_historical_corrections`: returns household-scoped date/actor/time/action and before/after evidence, excluding credentials and replay payloads.

Ordinary future-edit APIs retain their existing closed-day rejection. There is no global unlock, client bypass flag, RLS disable or historical cross-date swap. Session and audit tables use forced RLS with the restricted executor; no direct authenticated/anonymous access. All helper search paths are explicit and temporary schema-CREATE permission is revoked.

A household transaction lock serializes editors. Any intervening revision requires Reload for review; the local draft remains visible until explicitly reloaded. The planning gate now keeps mounted editors during compact-to-full library refresh, so a Realtime/foreground refresh cannot silently discard a historical draft. Reloading replaces it with the server's current recorded day and a new credential.

A successful correction consumes its session and records a single date-scoped audit event with actor membership, time, action and before/after meals. A repeated identical submission recovers the recorded acknowledgement without applying twice, even after another household revision. Reusing that credential for a different submission is rejected. Lost acknowledgements keep the original payload frozen in memory and expose Check correction result. Rejected writes keep the draft; a successful acknowledgement followed by a failed snapshot uses the existing Saved, refresh needed state.

Expired sessions are cleaned lazily on the next begin operation in that household; beginning replaces the editor's previous live session. Correction evidence and acknowledgements are retained with household history rather than automatically expiring. Evidence is limited to the affected date (at most three meals), not duplicated full household/profile snapshots. This history consumes database space as corrections accumulate; no new scheduler, storage bucket or paid service is introduced.

## Derived history and shopping

The canonical meal plans and `meals` summary projection change together on snapshot reads; personal-day snapshots contain profile/target/entry context rather than a second meal total. Both readers therefore see the corrected assumed intake, while frozen expenditure/target context stays stable.

Shopping reconciliation runs within the correction transaction. The sticky closed-day filter remains active, so correcting or erasing history never reintroduces those ingredients. Manual shopping items and surviving future contributions keep their existing rules. Shopping is the only editable offline domain; ordinary cached historical meals remain readable offline.

## Rollout and compatibility

Apply **only pending** [migration 16](../../supabase/migrations/202611070016_historical_corrections.sql), after successful migrations 1–15 and before deploying this client. The migration is additive: installed previous clients keep their existing snapshot, ordinary planning and shopping contracts. They cannot perform corrections, and ordinary historical locks remain enforced. A frontend rollback can retain the migration and audit evidence.

The authenticated concurrency fixture observes two explicit session starts (initial and renewed review), followed by two identical apply requests for one lost acknowledgement and exactly one committed correction. Normal save uses one begin RPC and one apply RPC, plus the existing snapshot/library refresh calls; local tap counting makes no requests. These are fixture observations, not a production traffic or free-tier capacity guarantee.

No hosted SQL, merge, deployment or live household modification is performed by this implementation. Real Google accounts in two isolated households, an invited second member, actual Realtime observation and physical Android/iPhone installation/update behavior remain required for hosted release acceptance. Browser interception and device emulation below are explicitly automated fixtures.

## Verification

| Check                                                               | Result                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Full unit/database suite                                            | 152 passed                                                                  |
| Final actual-migration/RLS and history regression rerun             | 19 passed                                                                   |
| Main Chromium browser suite                                         | 39 passed                                                                   |
| Authenticated-client fixture suite                                  | 27 passed on desktop/phone Chromium and iPhone WebKit                       |
| Production-built mobile release suite                               | 26 passed; four historical cases additionally rerun on built mobile clients |
| Production PWA/offline/update/recovery suite                        | 15 passed                                                                   |
| TypeScript, production build, formatting, local documentation links | Passed                                                                      |
| Local production public-shell audit                                 | Passed; all 15 declared public assets available                             |

The initial browser run still asserted the removed Locked text; it was updated to the accessible Closed day check. The comprehensive historical workflow reached its final reload assertion after the original 30-second timeout under concurrent browser load; its limit is now 45 seconds, matching the production suite. The fresh full main suite then passed all 39 scenarios. Assertions were retained for correction, erasure, locked ordinary controls and no regeneration.

Review captures are produced by the release scenarios in both languages/themes for emulated Android and iPhone, and uploaded by the existing CI artifact step. They show the clearly labeled historical editor, retained budget context and explicit review. A final phone capture caught the generic notice style arranging historical guidance in narrow columns; the dedicated historical notice now stacks that content, and both language flows were rerun. No external images or chart service are used.

The checks exercise actual migrations and RLS/grant audits; forged, expired, wrong-date and cross-household credentials; revoked access; normal closed-day API rejection; immutable historical source references; audited/idempotent application; conflict/review behavior; confirmed erasure and no regeneration; local-only credentials and unchanged PWA pending-shopping/update recovery behavior.
