# Version 3 — milestones and verification

Status: confirmed delivery sequence. Each milestone ends with a reviewable PR, applicable migration files, verification evidence and a user review. D1–D3 are confirmed in the decision register.

## Milestone 1 — trustworthy saves and current shopping

Deliver V3-10 and V3-04 first. Fix the reported budget feedback defect with a reproduced failing test, atomic changed-budget submission, distinct commit/refresh states and safe handling of uncertain outcomes. Add authoritative expired-day shopping subtraction using the existing household cutoff rules. Preserve manual items, surviving checked rows and pending offline checks.

Required checks:

- All three budget changes commit together or none do; invalid values and a now-closed date cannot produce a partial save.
- A successful mutation followed by a failed/superseded snapshot remains reported as saved, with a separate refresh message.
- A genuine write rejection remains an error and keeps the form draft; an unknown acknowledgement is not labeled a definite rollback.
- At the exact shared cutoff, checked and unchecked expired-only products disappear; mixed past/future grams decrease correctly; manual products remain.
- Catch-up after several days, empty intervals, timezone/DST boundaries and existing sticky closures use server-authoritative results.
- Reads after the first reconciliation are no-ops, preventing Realtime loops. Pending checks for removed rows are acknowledged as removed without recreating ingredients.
- Offline projection either has complete contribution provenance or clearly requests refresh; an IndexedDB upgrade preserves pending operations.

Review the budget error/refresh interaction and an example shopping list before and after cutoff. This milestone needs migrations; provide exact files and ordering when they exist. Do not change the calorie formulas or accepted intake targets.

## Milestone 2 — swaps and the planning clipboard

Deliver V3-01, V3-02 and V3-07, following confirmed D1. Share endpoint/replanning helpers between suggestion drafts and saved menus, add copy/paste mode across tabs/weeks, and add recipe-card context actions. Preserve the review boundary and automatic shopping reconciliation.

Required checks:

- A breakfast swap between two dates affects exactly the intended recipients; test cross-member and same-day cross-member swaps with different budgets/diets.
- Swapping into an empty destination moves the source; swapping occupied targets changes both atomically. Other breakfast portions remain byte-for-byte unchanged where no recalculation is required.
- Both swap results satisfy recipe-type, participant, substitution, source-reference and full final-menu variety validation. A failure changes neither side.
- Copy never edits its source. Successful paste can be repeated; cancellation and rejected/conflicting pastes preserve the clipboard and existing menu.
- Occupied targets require explicit overwrite acceptance, including eating-out and dessert effects. A newer destination revision requires renewed review.
- Unsupported, archived or missing source recipes cannot silently become new planned meals; missing underlying restaurant recipes are explained.
- Touch long press, desktop right click and keyboard context activation offer Copy to menu; scrolling cancels the gesture and no accidental recipe opening follows it.
- The clipboard survives Catalogue-to-Menu/week navigation but clears on reload, sign-out, account/membership changes and access revocation.

Review icon states, destination review and overwrite warning on a phone. Include atomic saved-swap/paste SQL validation and two-editor tests. Test both languages and keep existing recipe readers and ordinary preview approval usable.

## Milestone 3 — clearer portions, activity selection and lighter browsing

Deliver V3-03, V3-06, V3-08, V3-09 and V3-11, following confirmed D3. Add allocation charts in real meal context, two-stage activity selection with local recency, paged catalogue browsing/footer creation actions, grouped week controls and the calorie help popover.

Required checks:

- Test allocation against real planned quantities/calories, substitutions, optional dessert, different breakfast recipes, practical unit rounding and eating-out portions. A generic unplanned recipe never invents a household split.
- Display percentages total 100 without changing food quantities. Empty/invalid groups are explicit, and serving and calorie shares cannot be mislabeled.
- Duplicate avatar emojis identify the correct membership/name/portion; charts have text alternatives and usable color contrast in both themes.
- Activity type filters the intensity choices; changing type clears incompatible codes. Single-intensity activities, unsupported ages and invalid saved codes work without invented MET values.
- Only a successful acknowledged activity save updates Recent. Two accounts/memberships on one browser remain separate; no database request/write is used for recency; unavailable device storage is harmless.
- A collection of more than 100 records initially requests at most 50 resolved results, then appends successive pages without duplicates or skipped stable results. Test equal timestamps, new inserts, old chronology fallbacks and private archived overrides of common starters.
- Search can find an item beyond the initial page. Kind/filter/query changes ignore stale responses. Load-more failures retain existing cards, and only remaining pages show the centered plus.
- Recipe/ingredient creation actions are at the collection footer; loading more is distinguishable from creation. Planning candidate coverage and ingredient selection are not restricted to the first page.
- Week navigation/range and suggestion/eraser/import stay grouped at 320 px, standard/large text, 200% browser text scaling, long labels and both languages.
- The information control appears beside the budget pencil, works when the pencil is absent for another member, opens on touch/keyboard and exposes the complete assumed-intake explanation.

Review screenshots of a real allocation with substitutions, both activity selectors, catalogue footer/pagination, narrow Menu controls and the help popover. Measure actual initial browse payload/card count so a visual-only limit cannot pass as pagination.

## Milestone 4 — historical corrections and release acceptance

Deliver V3-05 following confirmed D2, then complete integrated regression and release review. Add the closed-day check/progressive-red interaction, a server-scoped correction session, reviewable historical edits and confirmed day erasure.

Required checks:

- One activation does not unlock a day. Five deliberate activations on the same check within the agreed window offer editing. Different dates, navigation, timeout and cancellation reset the sequence. Keyboard activation works and held-key repeat cannot trigger five intentional activations.
- The normal historical lock still rejects ordinary edits. A forged, expired, replayed, wrong-date, wrong-household or revoked-membership correction session cannot apply a change.
- A successful correction changes only the selected date and allowed record classes, records its actor/before-after evidence and returns the UI to closed state.
- Confirmed erasure removes that day's meals, makes its summary appropriately incomplete, preserves other dates/catalogue/personal data and does not regenerate erased meals on reload.
- Historical profile/target/activity context and unchanged food references stay stable. Past ingredients do not reappear in shopping after a correction.
- A second editor's change triggers renewed review rather than silent historical overwrite. Failed/unknown responses reconcile without duplicate corrections or audit entries.
- Historical editing remains online; ordinary cached history stays readable offline. Sign-out/revocation clears clipboard, recent-activity preference and any correction credential with the appropriate household cache.

Complete production builds, formatting, relevant domain/database/RLS audits and all existing browser, household, PWA and release suites after their fixtures have been adapted to the version-three contracts. Suites sharing `dist` must run sequentially. Check existing PWA upgrade and legacy service-worker recovery with pending shopping intent; do not clear browser data to make an upgrade test pass.

Hosted acceptance still needs real Google accounts, two isolated households, an invited second member, Realtime observation and physical Android/iPhone checks. Automated intercepted auth and emulated devices must be labeled as such. Stay within free-tier quotas and record actual payload/query behavior; this plan does not promise a number of households the free tier will support.

## Release checklist

1. Keep the confirmed D1–D3 decisions reflected in implementation and acceptance evidence.
2. For each implementation PR, list actual migrations and compatibility order; apply only pending scripts, preserving successful existing migrations and household data.
3. Verify additive backend changes with both the matching new client and the supported previous installed client where compatibility is promised.
4. Before client release, review the agreed UI captures and the failure tests relevant to that milestone.
5. Deploy the approved client through the existing release process; verify the public built shell and the real-account/device scenarios separately.
6. If rolling back the frontend, retain compatible additive migrations and historical correction evidence. Do not restore an old client that can bypass the new historical/shopping contracts or discard pending offline intent.

For the documentation PR itself, run Markdown formatting and link checks. App build/runtime tests do not prove or implement these proposed features, so do not report them as version-three acceptance evidence.
