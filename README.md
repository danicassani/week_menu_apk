# Week Menu App

Household meal-planning PWA: individual breakfasts, shared lunches/dinners with personal portions, calorie budgets, and one shared shopping list. English and Spanish; minimalistic light/dark design.

- [Product specification](docs/specification.md)
- [Reviewed technical blueprint](docs/technical-design.md)
- [Technical-review findings](docs/technical-review.md)
- [Starter-content overview](docs/starter-content.md)
- [Bilingual starter recipe book](content/starter/recipes.md)
- [Starter food pack, source notice and rebuild instructions](content/starter/README.md)

Milestone 1 is implemented: responsive bilingual light/dark interface, Supabase Google-auth/household permissions, adult profiles, calorie-target review, three meal budgets, and food/activity/weight logs. Services have not been provisioned or deployed. The agreed four milestones each end with a user review.

```sh
npm ci
npm run dev
```

Choose **Explore the preview** for a temporary sample household, or follow the [Supabase setup instructions](docs/setup.md) to connect your project. Preview data stays in memory and is discarded on reload or exit.

- [Milestone 1 review and scope boundaries](docs/milestone-1.md)
- [Run, configure and verify the app](docs/setup.md)
- [Activity source and age-coverage notes](docs/activity-sources.md)

Checks: `npm run build`, `npm test`, and `npm run test:browser` (Chromium required). Meal planning, generated shopping and offline installation are the following milestones.
