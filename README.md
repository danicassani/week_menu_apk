# Week Menu App

Household meal-planning PWA: individual breakfasts, shared lunches/dinners with personal portions, calorie budgets, and one shared shopping list. English and Spanish; minimalistic design with seven device-local colour families and light/dark modes.

- [Version 6: shared batch cooking](docs/version-6/README.md)
- [Version 5: scope, delivery status and activation](docs/version-5/README.md)
- [Planning change history](docs/planning-change-history.md)
- [Requested source-backed recipes and import rollout](content/expansions/README.md)
- [Current planning rules: ingredient repetition is allowed](docs/remove-repetition-rules.md)
- [Recipe Tinder, personal review progress and fast recipe vetoes](docs/recipe-review.md)
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

**Version 5** groups all changes after V4 closed at PR #34: recipe vetoes/review, simpler planning and recipe forms, sourced recipes, save repairs, calorie/budget improvements, configurable intake times and planning history. The [V5 delivery record](docs/version-5/README.md) preserves that version boundary. Concise history is integrated through PR #49; the Purchased grouping remains the separate PR #46. V4's milestone reports remain historical baseline records. V6 adds [shared batch cooking](docs/version-6/README.md), with Cocina replacing Perfil in navigation while the user emoji retains profile access. Current source requires migrations through 28 and the history retention job; source integration does not certify hosted deployment or physical-device acceptance.

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
