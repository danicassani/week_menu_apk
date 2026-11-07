# Version 3 — planning package

Status: product and technical specification draft. Implementation has not started. Three product questions have been sent to the user; their proposed defaults remain explicitly unconfirmed below. Everything in this package is written in English. The application continues to support English and Spanish.

## Documents

- [Product specification](specification.md): interactions, calculations, permissions, edge cases and acceptance criteria.
- [Technical design](technical-design.md): current-code findings, data and API changes, local state, transactions and migration strategy.
- [Milestones and verification](milestones.md): delivery order, review checkpoints and release gates.

The baseline is the current version-two application, including [subsequent menu and shopping changes](../version-2/menu-controls.md). Earlier specifications describe earlier decisions; this package supersedes them only where explicitly stated. No production deployment, database migration or historical record is changed by this documentation.

## Scope at a glance

| ID    | Change                                                                                               | Status                                                           |
| ----- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| V3-01 | Breakfast swaps in the weekly menu and suggestion preview                                            | Requested; cross-member scope pending D1                         |
| V3-02 | Meal/individual-breakfast copy and paste icons with explicit overwrite confirmation                  | Requested                                                        |
| V3-03 | Serving-allocation percentages, small pie charts and identifiable avatar legends                     | Requested; percentage meaning pending D3                         |
| V3-04 | Remove expired days' ingredient contributions from shopping automatically                            | Requested                                                        |
| V3-05 | Closed-day check icon, progressively red five-activation Easter egg and day editing/erasure          | Requested; record scope pending D2                               |
| V3-06 | Separate activity-type and intensity selectors; most recently saved activity remembered locally      | Requested                                                        |
| V3-07 | Recipe-card long press/right click to copy into Menu and activate paste destinations                 | Requested                                                        |
| V3-08 | Catalogue creation actions at the bottom, newest 50 entries initially and centered plus to load more | Requested; chronological ordering detailed as a proposed default |
| V3-09 | Repair responsive layout of the weekly suggestion controls                                           | Requested                                                        |
| V3-10 | Fix false failure messages after personal budget changes were saved                                  | Reported bug; cause requires reproduction                        |
| V3-11 | Move the assumed-intake explanation into an information control beside the budget pencil             | Requested                                                        |

## Decisions awaiting an answer

| Decision | Question                                                     | Recommended default, not yet accepted                                                                                                                                 |
| -------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1       | Can breakfast swaps cross household members as well as days? | Yes: swap individual breakfast choices between compatible recipients/dates; recompute each recipient's portions and restrictions.                                     |
| D2       | What may the past-day edit/eraser change?                    | Planned meals only, including recorded eating-out portions. Personal outside-food, weight/activity logs, profiles and accepted targets remain outside this exception. |
| D3       | What does a pie-chart percentage mean?                       | Estimated serving allocation within the same preparation, with separate charts for substitutions/components that cannot be served from the same batch.                |

The alternatives asked were: same-person-only breakfast swaps; extending historical correction to personal logs; or showing calorie shares instead of serving shares. These are materially different product behaviors. They must be resolved before their dependent implementation is treated as approved.

Other details are working defaults, recorded for review rather than additional blockers: newest-created-first catalogue ordering; 50 entries per page; an in-memory, reusable planning clipboard; a five-second activation window; and a ten-minute, single-date historical editing session. They can be changed during specification review without reinterpreting the explicit requirements.

## Boundaries retained

One active household per account, household isolation, owner-managed invitations, self-only personal data writes, adult profiles, metric units, source-attributed nutrition/activity estimates, existing calorie methodology and unit-aware rounding remain. Shopping keeps manual additions and its existing quantity increase/decrease rules. All new user-facing controls need both application languages and light/dark support.

Remain on the existing free-tier stack. This version adds no image uploads, external translation API, pantry, preparation-time limits, guest profiles, native app-store release or second simultaneous household membership. New small charts use native SVG and local code; recent-activity preferences create no database table or additional Supabase writes.
