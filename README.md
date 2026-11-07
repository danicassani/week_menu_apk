# Week Menu App

Household meal-planning PWA: individual breakfasts, shared lunches/dinners with personal portions, calorie budgets, and one shared shopping list. English and Spanish; minimalistic light/dark design.

- [Product specification](docs/specification.md)
- [Version 2 specification draft](docs/version-2/specification.md)
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

Milestones 1–3 are implemented: responsive bilingual light/dark interface, Supabase Google-auth/household permissions, adult profiles, calorie-target review, three meal budgets, food/activity/weight logs, editable household content reviewed menu planning, shared shopping, installation and offline viewing/checklists. The household has an initial deployment; the new planning migrations and frontend rollout are documented separately. The agreed four milestones each end with a user review.

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
