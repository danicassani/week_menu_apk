# Version 3 — planning package

Status: product scope confirmed by the user, including D1–D3. All four implementation milestones are prepared for review; hosted release acceptance remains pending. Everything in this package is written in English. The application continues to support English and Spanish.

## Documents

- [Product specification](specification.md): interactions, calculations, permissions, edge cases and acceptance criteria.
- [Technical design](technical-design.md): current-code findings, data and API changes, local state, transactions and migration strategy.
- [Milestones and verification](milestones.md): delivery order, review checkpoints and release gates.
- [Milestone 4 implementation](milestone-4.md): scoped historical corrections, day erasure, audit evidence, migration 16 and release verification.
- [Milestone 3 implementation](milestone-3.md): preparation allocation, activity selectors/recency, catalogue pages, layout/help and migration 15.
- [Milestone 2 implementation](milestone-2.md): cross-person breakfast swaps, recipe copy/paste, catalogue context actions and migration 14.
- [Milestone 1 implementation](milestone-1.md): budget acknowledgements, automatic shopping expiry, migration 13 and verification.

The baseline is the current version-two application, including [subsequent menu and shopping changes](../version-2/menu-controls.md). Earlier specifications describe earlier decisions; this package supersedes them only where explicitly stated. No production deployment, database migration or historical record is changed by this documentation.

## Scope at a glance

| ID    | Change                                                                                               | Status                                                                |
| ----- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| V3-01 | Breakfast swaps in the weekly menu and suggestion preview                                            | Confirmed: cross-member and cross-date                                |
| V3-02 | Meal/individual-breakfast copy and paste icons with explicit overwrite confirmation                  | Requested                                                             |
| V3-03 | Serving-allocation percentages, small pie charts and identifiable avatar legends                     | Confirmed: serving allocation                                         |
| V3-04 | Remove expired days' ingredient contributions from shopping automatically                            | Requested                                                             |
| V3-05 | Closed-day check icon, progressively red five-activation Easter egg and day editing/erasure          | Confirmed: recorded meals only                                        |
| V3-06 | Separate activity-type and intensity selectors; most recently saved activity remembered locally      | Requested                                                             |
| V3-07 | Recipe-card long press/right click to copy into Menu and activate paste destinations                 | Requested                                                             |
| V3-08 | Catalogue creation actions at the bottom, newest 50 entries initially and centered plus to load more | Confirmed; chronological ordering uses the documented working default |
| V3-09 | Repair responsive layout of the weekly suggestion controls                                           | Requested                                                             |
| V3-10 | Fix false failure messages after personal budget changes were saved                                  | Reproduced save/refresh path; milestone 1 implemented for review      |
| V3-11 | Move the assumed-intake explanation into an information control beside the budget pencil             | Requested                                                             |

## Confirmed decisions

The user accepted all three recommendations:

| Decision | Confirmed behavior                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1       | Breakfast swaps can cross household members as well as dates. Recalculate each recipient's portions and dietary requirements.                                                                  |
| D2       | Past-day editing/erasure affects recorded planned meals, including their eating-out portions. Personal food, weight/activity logs, accepted targets and profiles are outside this exception.   |
| D3       | Charts show estimated serving allocation, with separate preparations/components when substitutions or optional food prevent one shared split. They do not show a mislabeled calorie-share pie. |

Other details are working defaults, recorded for review rather than additional blockers: newest-created-first catalogue ordering; 50 entries per page; an in-memory, reusable planning clipboard; a five-second activation window; and a ten-minute, single-date historical editing session. They can be changed during specification review without reinterpreting the explicit requirements.

## Boundaries retained

One active household per account, household isolation, owner-managed invitations, self-only personal data writes, adult profiles, metric units, source-attributed nutrition/activity estimates, existing calorie methodology and unit-aware rounding remain. Shopping keeps manual additions and its existing quantity increase/decrease rules. All new user-facing controls need both application languages and light/dark support.

Remain on the existing free-tier stack. This version adds no image uploads, external translation API, pantry, preparation-time limits, guest profiles, native app-store release or second simultaneous household membership. New small charts use native SVG and local code; recent-activity preferences create no database table or additional Supabase writes.
