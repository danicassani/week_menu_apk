# Version 4 milestone 1 — quieter controls and target review

Status: implemented for review. Covers V4-03, V4-05, V4-06, V4-08, V4-09, V4-10, V4-11 and V4-12. Upcoming shopping scope/egg units remain milestone 2; recipe captions/preparation boilerplate remain milestone 3; pastel themes remain milestone 4.

## Interface changes

Occupied editable Menu cards have a bottom action row ordered pencil, dice, copy/paste, eraser and swap arrows. The recipe/recorded-meal reader uses a separate eye. Existing translated action names, recipe-title links, transfer review, cancellation, repeated pasting, explicit overwrite review and revision checks remain. Erasing a meal asks for confirmation and uses the existing meal transaction.

Empty slots show a quiet dash placeholder beside Suggest / Sugerir. Paste/swap destinations remain available when the transfer state permits them. Historical slots retain reading and the existing correction exception rather than gaining ordinary edit buttons.

The dashboard removes the weekly preview and shopping shortcut, retaining today's meals, calorie summary, View week and navigation. Sync now uses the standard button treatment and is disabled during synchronization; queue and error handling are unchanged.

The historical editor has scoped spacing for primary/cancel and destructive action groups, including conflict, expiry and confirmation states. Its closed-day check has no checkbox semantics, visible button surface, progressive-red state or click-induced appearance change. Native keyboard activation and visible keyboard-only focus remain. Five deliberate activations within the existing window still offer the server-scoped correction session; no historical authorization or SQL changes are introduced.

Shopping quantity increases still automatically uncheck through the existing canonical comparison and server/preview rules. The shared checklist renderer ignores increase flags for visual presentation, including old cached flags: no increase-specific row class, badge, message or icon. Exact quantities, pending synchronization and genuine errors remain visible.

## One allocation bar

Breakfast readers and correction reviews render no allocation graphic. Lunch and dinner render at most one rectangular segmented bar with stable member colours, percentages, names and avatar details. Main, side, dessert and substitution quantities are aggregated per person rather than producing separate pies.

The metric is explicitly overall share of planned ingredient weight. It is not calorie share, cooked yield or a universal ratio for splitting different preparations. Exact ingredient/unit quantities remain in each avatar's details and the meal reader. Eating-out portions are listed separately and excluded from the bar. Invalid home-cooked portions suppress the aggregate rather than showing a misleading partial whole. Largest-remainder percentage display sums to 100 without changing stored food quantities or nutrition. Generic catalogue recipes do not invent a household allocation.

## Target-review investigation and change

The existing proposal action used the general mutation helper's default post-operation household refresh. That delayed opening the target dialog behind an unrelated snapshot request after the proposal had already succeeded. The action now opens from the acknowledged proposal without that extra refresh. Proposal errors still use the existing actionable error display. No target is accepted by opening the dialog; acceptance retains its explicit budget review and server context checks.

This is a verified code-path correction, not a claim to have observed the user's original hosted failure. Running the regression against the original App code fails with two snapshot requests where one is expected; restoring the implementation removes the extra request. The authenticated-client regression checks that proposal review opens without another household snapshot, does not accept a target, and exposes a rejected proposal's specific validation error.

## Compatibility and verification

No migration or new environment variable is required. Existing V3 APIs, RLS, historical correction credentials, shopping receipts and offline caches remain compatible. No deployed database, Google configuration or household data is modified by this PR.

| Check                                                         | Result                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Full unit/database suite                                      | 153 passed                                                                     |
| Existing main browser suite                                   | 39 passed                                                                      |
| New V4 main browser scenarios                                 | 2 passed, both languages; also checked at 320 px with 200% text                |
| Authenticated household suite                                 | 30 passed across desktop/phone Chromium and iPhone WebKit                      |
| Full production mobile suite                                  | 30 passed; historical/V4 scenarios additionally rerun after layout refinements |
| PWA upgrade/offline/recovery suite                            | 15 passed                                                                      |
| TypeScript, production build, formatting, documentation links | Passed                                                                         |

The target-review regression deliberately failed on the original code before passing with the implementation. Final screenshots cover the icon row, single bar, enlarged text and historical editor action footer. A final geometry assertion checks that adjacent meal actions have space between their touch targets, including the copy control's wrapper. Authenticated HTTP fixtures and emulated Android/iPhone profiles do not replace real-account and physical-device acceptance.

A pre-existing database fixture used today + 14 days and the following day as if they always belonged to one shopping week. On Sunday that crossed the Monday boundary. The fixture now chooses adjacent days inside one future configured week; application date/deletion behavior is unchanged.
