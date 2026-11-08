# Version 4 — implementation milestones

Status: all four implementation milestones are complete; milestone 4 is ready for review. Delivery order for the confirmed backlog and [design](design.md). Each milestone ends with a reviewable PR, applicable migration links and verification evidence.

## 1. Quieter navigation and working target review

Deliver V4-03, V4-05, V4-06, V4-08, V4-09, V4-10, V4-11 and V4-12. Reproduce and fix the target-review defect, simplify home, lay out the five menu actions and separate eye, replace empty-slot labels and style Sync now as a button.

Acceptance:

- The signed-in person's target trigger opens a proposal or shows an actionable error; another member's selection cannot authorize personal changes. Include failed/slow proposal and explicit target/budget acceptance checks.
- Occupied cards expose the requested icon order with usable names and touch targets. Copy/paste, swaps, cancellation, erasure confirmation, eating-out readers and historical permissions retain their behavior.
- Empty slots keep Suggest beside the placeholder at 320 px, large text and both languages. Closed slots retain read-only access and the five-activation correction exception.
- Home keeps today's meals and View week without the redundant weekly preview/shopping shortcut. Navigation remains available.
- Breakfast has no allocation graphic anywhere. Lunch/dinner show one rectangular bar even with sides, meat/plant substitutions and optional desserts. Percentages and avatar details remain accessible; the aggregate is clearly labelled and exact serving quantities stay available. Test mixed/all eating-out and invalid groups, both themes and historical/draft readers.
- Historical editor actions have clear spacing/grouping in offer, edit, conflict/expiry, review and erase-confirmation states. The plain closed-day check has no checkbox/button surface or activation-induced visual changes; five deliberate activations still open the offer and keyboard-only focus remains visible.
- Increased shopping requirements uncheck without increase-specific highlights, badges, messages or announcements, including cached/offline rows. Genuine pending/error feedback stays.
- Sync now keeps the same queue behavior and communicates busy/offline state.

Review phone captures of occupied/empty/closed cards, home, target review and a shared meal with substitutions using one allocation bar, plus historical editor action footers and the unchanged closed-day check. Run relevant unit/browser and authenticated proposal-flow checks; no SQL is presumed necessary before diagnosis.

## 2. Upcoming shopping and egg units

Deliver V4-07 and V4-01 together so purchasing display uses the new authoritative contribution scope. Apply confirmed D4-02. Provide additive SQL and compatibility ordering.

Acceptance:

- Multiple future weeks contribute even when they are not loaded in Menu; today's still-open meals count and closed days never return through historical corrections.
- An older client's date-range/preview/apply actions cannot narrow the new shared list. Normal reads are no-ops after reconciliation; an empty menu leaves only manual items.
- Checked and unchecked expired contributions disappear; surviving rows, pending offline checks and increased/decreased quantities follow existing rules.
- Legacy offline caches explicitly need refresh rather than claiming complete future coverage. Upgrades retain pending intentions; reconnect acknowledges removed rows without recreating them.
- Egg display rounds aggregated compatible grams upward once, uses the configured household estimate and retains exact grams. Conversion edits change no calorie totals or past references. Two households remain isolated.
- Unknown/invalid conversions fall back to grams. Manual additions keep entered quantities. Test an increase whose displayed whole-egg count stays unchanged.

Review list captures and actual payload/query behavior across several weeks. Run domain/database/RLS and old-client contract tests, then shopping and PWA recovery suites sequentially where builds share `dist`.

## 3. Clearer ingredient names and preparation information

Deliver V4-04 and V4-13 through curated starter display names, plain serving captions and removal of the separate generic preparation block.

Acceptance:

- Catalogue, shopping and selectors agree on short names in both languages; meaningful product qualifiers remain.
- The lentil preparation/weighing disclaimer block is absent, without replacement boilerplate. Actual cooking steps and household-authored recipe instructions remain.
- Catalogue captions say Ingredients for N people / Ingredientes para N personas with correct singular/plural and base counts. Planned portions retain their actual member/meal context. Check saved, suggested, historical and offline readers.
- Private names/translations, source attribution, conversions and immutable historical snapshots survive unchanged.
- Similar display names do not merge distinct ingredient identities or shopping reference states.

Review representative eggs, nuts, pulses, carrots and sun-dried tomatoes. Verify household overrides, newly created recipes and historical readers. Do not silently replace the pinned starter release.

## 4. Pastel themes and integrated release review

Deliver V4-02 using confirmed D4-01, then complete regression across V4.

Acceptance:

- All seven colour families have light/dark counterparts and readable semantic states. Existing mode preferences survive; colour persists locally without Supabase writes.
- Check contrast, focus, charts, historical activation feedback, icons and forms across all fourteen variants. Check narrow screens, enlarged text and both languages, including offline recovery.
- Run production build, formatting, domain/database/RLS, main browser, household, PWA and mobile release suites. Keep `dist`-sharing suites sequential.
- Verify upgrade from the previous installed worker with queued shopping checks. No browser-data clearing is an acceptable upgrade strategy.

Review a theme gallery and publish exact migration/deployment ordering. Automated intercepted authentication and device emulation must be labelled. Real Google accounts in isolated households, an invited member, Realtime and physical Android/iPhone acceptance remain separate hosted release checks.
