# Version 2 — specification draft

Status: implementation started following the user's instruction. Confirmed product decisions are recorded below; recommendations and unresolved choices are labelled separately. The [first milestone](milestone-1.md) implements household isolation and onboarding locally for review. Live migration, paid services and deployment are not part of this checkpoint. Version-one behavior remains the baseline except where this document explicitly changes it.

## Budget constraint

Latest menu workflow update: the user requested [preview re-rolls, week deletion and automatic shopping](menu-controls.md). Shopping now updates automatically after saved menu changes; this supersedes the previous requirement to review and apply a shopping diff. Closed days and manual shopping additions remain protected.

The user wants to remain on free tiers for now. No paid plan, billable add-on or approval of overage charges is implied. Use native emojis for recipe/ingredient illustrations and personal avatars in this revised draft; photo uploads, thumbnails and photo-provider selection are deferred. Emojis are stored as small text values and rendered with the device's existing fonts, without an image-hosting service. Database, authentication and synchronization quotas still apply.

## 1. Confirmed scope

| Area               | Version-two behavior                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access             | Any verified Google account may create a household or accept an owner-approved invitation. No deployment-time approval of new owners.                                                                         |
| Membership         | A person can belong to one active household at a time. Multiple household switching is not included.                                                                                                          |
| Isolation          | Each household has private members, health/history, content changes, plans, shopping and emoji overrides.                                                                                                     |
| Starter content    | Common starter catalogue and recipes; household edits and household-created content remain separate and private.                                                                                              |
| Readability        | Slightly larger default text and a per-person Standard / Large preference.                                                                                                                                    |
| Illustrations      | Native food emojis for recipes and ingredients. Photo uploads and thumbnails are deferred; picker/default details below are recommendations.                                                                  |
| Member avatars     | Each person can choose and change their own emoji avatar, displayed alongside their name in household views.                                                                                                  |
| Re-roll            | Re-roll a shared lunch/dinner for everyone, or the signed-in person's own breakfast.                                                                                                                          |
| Swaps              | Swap shared lunch/dinner slots between dates; each person swaps only their own breakfasts. Recalculate destination portions and revalidate constraints.                                                       |
| Suggestion locks   | Protect selected suggestions while regenerating the remaining preview. These are draft controls, distinct from immutable historical meal locks.                                                               |
| Ratings            | One editable 1–5-star rating per person per recipe, without comments. Informational only.                                                                                                                     |
| Copy previous week | Include everyone's breakfasts and shared meals, recalculate for current members/budgets/preferences, preserve occupied destination slots unless replacement is explicitly selected, and review before saving. |

Preparation-time limits and pantry management are deferred. Guests, simultaneous membership of several households and native app-store applications are not added by this draft.

## 2. Household creation, invitations and boundaries

A new signed-in user can create a household or accept an invitation. Creating a household makes that person its owner. Joining still requires the intended household owner's approval of the verified email address. Signing into Google alone does not grant access to any existing household.

There is exactly one owner per household. The existing owner-only invitation/removal/ownership-transfer rules and personal-write restrictions remain. Being an owner does not grant permission to edit another person's profile, calorie budgets, weight, activity or outside-food logs.

Enforce one active membership per authenticated account in the database, including simultaneous create/join requests. A pending invitation is not an active membership. Removal or leaving revokes access to that household; joining another household does not expose the former household's retained history there. A removed person may create or join a different household without regaining their old access.

The current live household must become the first household during migration, retaining its owner, memberships, private content, IDs/references where feasible, saved meals, history, shopping states and outstanding operation identities. Migration is additive and staged; resetting production data is not a migration strategy.

Previously recorded personal data stays attached to its original household membership. Separate the authenticated account from the membership record so a later membership cannot accidentally inherit access to old household records. Language and font-size preferences can be account-level; health and meal data remain household-scoped. An explicit data-portability feature is not specified here.

## 3. Common starter content and private changes

Maintain a read-only, versioned common starter baseline. A household can use it without copying every row. Its edits resolve through private household overrides or independent private content with clear lineage to the baseline. Editing or archiving a starter item in one household must not change another household's resolved catalogue, recipe, suggestions or nutrition.

Preserve nutrition sources, units, reference states, recipe versions and historical snapshots. Global starter changes must not silently rewrite a household's private edits or recorded history. A release/update policy for new starter versions still needs agreement; review-and-apply updates with private changes preserved is the recommended default.

New household content stays in its entered language, with optional manual English/Spanish translations as before. Shared starter content is bilingual. Starter emoji defaults belong to this common baseline; a household's emoji changes remain private overrides.

## 4. Text and accessibility

Increase the default text slightly and add a per-person Standard / Large choice. Both settings must honor browser zoom and OS text scaling, preserve visible keyboard focus and work in monochrome light/dark modes and both languages.

Recommended starting values, not yet confirmed: 17 px body text for Standard and 19 px for Large, using relative units and readable line spacing. Avoid fixed-height labels/cards and do not shrink text to fit. Check 200% text scaling, long Spanish ingredient names, forms, date controls, navigation, recipe quantities and dialogs on Android/iPhone-sized layouts. Numerical text must remain selectable/readable and warnings must not depend on color alone.

## 5. Emoji illustrations and avatars

The user proposed emojis as a lightweight alternative to actual pictures after discussing free-tier limits. This revised draft uses native emojis for recipe/ingredient illustrations and defers photo uploads, thumbnail generation, starter-photo sourcing and media-provider selection. No media bucket, image-processing service or externally downloaded emoji font/image pack is needed for this approach. See [media-storage.md](media-storage.md) for the current direction and deferred photo research.

Recommended behavior for review:

- Assign starter items suitable food emojis, for example oats 🥣, eggs 🥚, rice 🍚 or salad 🥗. Use a generic food/plate fallback when no specific match exists.
- Offer a small curated emoji picker when creating or editing a household recipe/ingredient, including items carried over from version one. Keep one selection per item, with a usable default so choosing an emoji is optional.
- Apply the same content-edit permissions and household isolation as other recipe/ingredient fields. Editing a starter item's emoji creates a private override and never changes other households' defaults.
- Store the selected native emoji as bounded plain text from the allowed set. Some emojis contain several Unicode code points; do not validate by assuming one JavaScript character. Never use the emoji as an item identifier or insert user-provided HTML/image URLs.
- Preserve full translated recipe/ingredient names. Adjacent emojis are decorative for assistive technology; picker controls have meaningful English/Spanish accessible names. An emoji must not be the only source of nutritional, dietary or warning information.
- Render using device fonts and include the text value in existing offline catalogue/recipe views. Appearance can differ between Android, iPhone and desktop; retain a text/neutral-icon fallback for unsupported glyphs.

Preserve the verified canonical-URL and legacy-worker recovery behavior when modifying presentation/offline views. The earlier compression, upload-eligibility and private-media requirements remain research for a future photo feature, not version-two implementation work.

### Personal emoji avatars

Confirmed addition: each person can choose an emoji as their avatar. Only that person can change it; household ownership does not grant permission to edit another member's avatar.

Recommended behavior for review:

- Offer an optional choice during onboarding and an editable avatar field in the person's profile/settings, with a neutral default when no emoji is selected.
- Reuse the lightweight curated picker, with avatar choices such as faces, animals, plants and food rather than restricting it to food emojis.
- Show the avatar beside the person's name in the member selector, household member list and personal meal/portion displays. Keep names visible so duplicate emoji choices do not make people ambiguous; emojis need not be unique.
- Store a bounded native emoji text value on the household member profile, following existing self-edit and household-read permissions. Validate changes on the server; a supplied member ID must not allow editing someone else's avatar.
- Apply the same Unicode validation, device-font rendering, accessible picker labels and unsupported-glyph fallback as recipe/ingredient emojis. Treat an avatar beside a name as decorative, and give avatar-only controls an accessible name identifying the person.
- Include avatars in the existing authorized offline member view and purge them with the rest of that household's cached data on sign-out or revoked access. Existing historical retention and membership boundaries still apply.

## 6. Suggestions, re-rolls and locks

All changes happen in an editable preview, before saving. Re-rolling a shared lunch/dinner chooses a compatible shared base recipe and generates current personal portions/substitutions for its participants. Re-rolling breakfast changes only the signed-in person's breakfast. Whole-week generation and copying can still include everyone's breakfasts: the user explicitly chose this distinction.

Preserve other suggestions when re-rolling a single slot. Do not silently relax exclusions, unit conversions or the configured rolling main/base ingredient window. If no alternative exists, retain the previous suggestion and explain the gap, suggesting more recipes or explicit rule review.

A locked suggestion is protected from regeneration. Do not silently change it to resolve conflicts elsewhere. If current budgets, membership, diets, source content or neighboring plans invalidate the preview, require review; a suggestion lock does not override server constraints. Scope a breakfast lock to the participant and date, and a shared lock to the shared slot. Keep these controls in the draft; they do not make a saved meal permanently uneditable or replace historical locks.

Recommended initial UX: re-roll controls per meal, a lock/unlock control, and an explicit option to regenerate unlocked suggestions. Re-roll should not immediately return the same effective recipe/variant when a valid alternative exists. The implementation must bound retries rather than loop indefinitely.

## 7. Moving and swapping suggestions

Offer a destination picker that works on touch devices; drag-and-drop is optional polish. Allow shared lunches/dinners to move or swap with compatible shared slots. A breakfast can move or swap only within the signed-in person's breakfast slots; do not exchange breakfast with a shared slot.

Recompute each resulting portion using the destination date's accepted meal budget and override. Check recipe meal-type compatibility, current participants, dietary exclusions, reviewed substitutions, per-person dessert selection and the full variety window on both sides of the move, including adjacent weeks and retained saved meals.

Validate a swap atomically against the resulting plan, not against the old positions being replaced. If a move conflicts with a locked suggestion, require explicit unlocking/review rather than silently replacing it. Historical dates remain read-only. Show conflicts and keep the draft available for adjustment; do not silently reroll unrelated meals to make a swap fit.

## 8. Copying previous weeks

Choose a source and destination week and build a new preview. Copy meal choices as planning inputs, not historical portion quantities or nutrition totals. Include everyone's breakfasts and shared lunches/dinners, using the current active/onboarded roster and each destination date's meal budgets, overrides and dietary preferences.

Preserve existing destination meals by default. Replacement requires an explicit choice and a preview. Source days and recorded history are never changed. Recheck variety against destination neighbors and the copied week as a whole; an invalid source choice produces a review issue, not a silently substituted recipe.

For a source eating-out portion:

1. Recover the underlying home-cooked recipe when a retained reference exists, including the shared base recipe where applicable.
2. Restore a home-cooked portion, select/review current compatible substitutions and rescale it to that person's destination meal budget.
3. If no recipe can be recovered, leave that participant's portion unplanned and highlight it for review. Do not invent a recipe from restaurant text or scale a bare calorie estimate as if it had ingredient quantities.

Version one explicitly clears a portion's `recipe_id` and `recipe_snapshot` when it becomes eating out. Some old individual breakfasts therefore have no recoverable recipe; copying must surface that gap. For version two, retain a separate immutable underlying-recipe reference when switching modes so future copying can recover it. Existing shared recipe references may be sufficient for a shared slot, but they are not a substitute for missing individual breakfast provenance.

Preserve source per-person dessert choices where still applicable and show the current result in the preview. New members have no historical personal choice; their defaults need to be resolved visibly. Outside-food, weight and activity logs are not copied. Copying does not automatically accept a new calorie target, alter personal budgets or apply shopping-list changes. After saving the copied plan, reconcile shopping automatically using the configured date range.

## 9. Ratings

Store one current integer 1–5-star rating per authenticated person, household and recipe, with membership context for authorization/provenance. Rejoining must not create duplicate current ratings for the same person and recipe. Each person edits their own rating; household ownership does not confer the right to overwrite another person's stars. No comments, rating-based ranking, automatic exclusions or changes to random suggestion probabilities.

Recommended presentation: show the signed-in person's stars and household average/count, with unreviewed recipes clearly distinct from a zero rating. Household ratings of common starter recipes must not become global cross-household ratings. Final decisions on average display and historical/former-member ratings can be resolved in the UI/data review without adding a recommendation engine.

## 10. Required engineering changes

The version-one baseline uses boolean singleton keys, a global household lock/revision, auth-ID-based member records and account-only offline cache keys. The [first milestone](milestone-1.md) now implements the household/membership migration and permission refactor locally. Live production has not been migrated by this work.

- Introduce household and membership identifiers and enforce one active membership per account. Derive the authorized context on the server.
- Scope all private reads/writes, revisions, row locks, invitation approvals, meal/personal date cutoffs, saved content, ratings, shopping items and operation receipts to the correct household/membership.
- Enforce relationship ownership through constraints and backend validation, including supplied recipe/ingredient IDs and private emoji overrides. Test reads, direct REST access and privileged functions, not just UI visibility.
- Enforce self-only avatar edits and household-scoped visibility, including direct API writes and owner attempts to change another person's avatar.
- Publish and subscribe only to the authorized household's invalidation row. Do not broadcast raw health records.
- Key offline views and operation envelopes by account, household and membership. Never replay an old household's queued check into a newly joined household. Keep explicit sync/discard handling for sign-out/voluntary departure and purge revoked household data when detected.
- Build the common baseline from the versioned starter artifacts, never by publishing the current live household's content tables. Classify existing edits/custom items as private; keep ambiguous provenance private rather than leaking it into the common catalogue.
- Keep common starter content read-only for ordinary household users, with versioned private overrides and immutable historical references.
- Make the existing household migration and old/new client compatibility an explicit rollout design. Block public household creation until the isolation migration and server functions are ready; do not expose a partially isolated deployment.
- Apply server-side validation/CAS to preview commits and swaps, including stale membership, budgets, content and locks.

These requirements are being delivered through the reviewed milestones below. See each checkpoint for its implemented scope and verification limits.

## 11. Verification and proposed sequence

Review after each proposed milestone:

1. Multi-household migration, onboarding and isolation, including the existing production household and hostile cross-household request tests.
2. Versioned starter resolution/private overrides, font settings, accessible native emoji illustrations and personal emoji avatars.
3. Re-rolls, draft locks, swaps, copying weeks and informational ratings, with server-authoritative preview validation.
4. Integrated release tests: two independent households and multiple members, stale/forged IDs, membership transitions with offline queues, private emoji overrides, self-only avatar edits and offline display, text scaling, English/Spanish, Android/iPhone and installed-PWA updates.

Preserve all version-one calculation, date-locking, shopping reconciliation and browser-recovery regressions. Test creation/join races and cross-household content edits. Implementation is authorized; each milestone retains the agreed review checkpoint before proceeding to the next.

## 12. Decisions still open

- Review the proposed curated emoji picker, defaults and fallback presentation. Photo hosting, upload limits, compression and starter-photo licensing are deferred to a future version. No overage billing has been approved.
- Exact Standard/Large text sizes, starter-release adoption policy and rating summary details.
- Final technical design and the staged rollout/review sequence.

## 13. Deferred to the next version: automatic translation

Recorded on 6 November 2026: the user deferred Google Cloud Translation integration to the next version. Current content editing keeps one primary language with optional manual translations; no translation API or billing setup is required for this release.

The future feature should:

- Translate recipe/ingredient names, recipe component names and instructions between English and Spanish when new or changed text is saved. Preserve quantities, units and nutrition data.
- Store translations for reuse, mark automatically translated text and allow manual corrections without silently overwriting them later.
- Keep translation requests authenticated and household-scoped, with the API credential stored only as a server secret, never in frontend `VITE_` variables or Git.
- Enforce a shared monthly character limit below the free allowance, with concurrency-safe accounting and request limits. Save original content even when translation is unavailable or the allowance is exhausted.
- Review source-language handling, stale translations after source edits, concurrency and provider attribution before implementation.

Candidate provider: Google Cloud Translation Basic (v2), which supports API keys. Pricing checked on 6 November 2026: the first 500,000 characters per month are covered by a recurring $10 credit shared across Basic/Advanced eligible usage; standard NMT usage beyond that costs $20 per million characters. Billing must be enabled. Recheck pricing before implementation; no paid usage or provisioning is authorized by this backlog entry.

Sources: [pricing](https://cloud.google.com/translate/pricing), [setup and billing](https://cloud.google.com/translate/docs/setup), [authentication](https://cloud.google.com/translate/docs/authentication).
