- [Recipe Tinder, personal review progress and fast recipe vetoes](docs/recipe-review.md)

# Week Menu App

Household meal-planning PWA: individual breakfasts, shared lunches/dinners with personal portions, calorie budgets, and one shared shopping list. English and Spanish; minimalistic design with seven device-local colour families and light/dark modes.

- [Household recipe vetoes](docs/recipe-vetoes.md)
- [Version 4 milestone 4: themes and release review](docs/version-4/milestone-4.md)
- [Version 4 requested backlog](docs/version-4/README.md)
- [Product specification](docs/specification.md)
- [Version 2 specification draft](docs/version-2/specification.md)
- [Version 4 milestone 3: clear ingredient names and recipe readers](docs/version-4/milestone-3.md)
- [Version 4 milestone 2: upcoming shopping and egg units](docs/version-4/milestone-2.md)
- [Version 4 milestone 1: quieter controls and target review](docs/version-4/milestone-1.md)
- [Version 3 milestone 4: historical corrections and release review](docs/version-3/milestone-4.md)
- [Version 3 milestone 3: portions, activity and catalogue pages](docs/version-3/milestone-3.md)
- [Version 3 milestone 2: meal transfers and recipe clipboard](docs/version-3/milestone-2.md)
- [Version 3 planning package and confirmed decisions](docs/version-3/README.md)
- [Version 2 milestone 1: household isolation and onboarding](docs/version-2/milestone-1.md)
- [Version 2 milestone 4: release verification and hosted acceptance](docs/version-2/milestone-4.md)
- [Version 2 milestone 3: preview locks, swaps, week copies and ratings](docs/version-2/milestone-3.md)
- [Version 2 milestone 2: shared starters, text sizes and emojis](docs/version-2/milestone-2.md)
- [Version 2 emoji illustrations and deferred photo research](docs/version-2/media-storage.md)
- [Reviewed technical blueprint](docs/technical-design.md)
- [Technical-review findings](docs/technical-review.md)
- [Starter-content overview](docs/starter-content.md)
- [Bilingual starter recipe book](content/starter/recipes.md)
- [Starter food pack, source notice and rebuild instructions](content/starter/README.md)

Version 4's four implementation milestones are complete for review, including quieter meal controls, upcoming shopping/egg units, clearer recipe content and local themes. The existing deployment uses Supabase Google auth, isolated households, personal calorie profiles, shared planning and offline shopping checks. See the release report for migration prerequisites and the remaining hosted/physical-device acceptance.

```sh
npm ci
npm run dev
```

Choose **Explore the preview** for a temporary sample household, or follow the [Supabase setup instructions](docs/setup.md) to connect your project. The fictional preview retains its menu/catalogue/shopping simulator within the current tab for offline reloads; health logs stay in memory. Exiting clears its saved data.

- [Milestone 1 review and scope boundaries](docs/milestone-1.md)
- [Run, configure and verify the app](docs/setup.md)
- [Activity source and age-coverage notes](docs/activity-sources.md)

Checks: `npm run build`, `npm test`, `npm run test:browser`, and `npm run test:pwa` (Chromium required). Milestone 4 adds Chromium/WebKit release checks and a public deployment audit; signed-in and physical-device acceptance remains pending.

- [Milestone 2 review and database rollout](docs/milestone-2.md)
- [Milestone 3 review, offline behavior and migration](docs/milestone-3.md)
- [Milestone 4 verification and live acceptance](docs/milestone-4.md)
