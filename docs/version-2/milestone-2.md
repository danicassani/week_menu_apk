# Version 2 milestone 2 — shared starter content and personal presentation

Status: implemented for review. Hosted Supabase migrations and deployment have not been applied.

## Delivered

- Migration 9 installs the reviewed repository starter artifacts as a pinned, read-only common release. New households resolve it without copying starter rows into their private collections. Food, recipe and substitution reads resolve private rows first, then the common release. Existing content is conservatively preserved as private overrides, including archived items; no live household data becomes shared.
- Existing content write RPCs retain revision checks and write only private overrides. Nutrition calculations, historical snapshots and shopping reconciliation retain their existing behavior. Future starter releases need a separate reviewed adoption flow; there is no automatic update.
- Text uses relative units with 17 px Standard and 19 px Large roots. The personal setting appears under Profile → Settings. Browser zoom remains available.
- Native emoji defaults and an optional bounded picker appear on recipe/ingredient cards and in their editor. There are no photos, media buckets or external emoji assets.
- Each member can choose their own emoji avatar in Profile → Settings. Avatars appear in the member selector, header and household/profile member displays. Names remain visible.
- Presentation preferences have a separate member field/RPC, outside calorie-profile inputs. The RPC resolves the caller and validates the expected household/membership. Owners cannot use it to change another person's settings. Server validation rejects arbitrary emoji text; cached presentation is cleared by the existing scoped sign-out/revocation purge.
- Saved offline catalogue views retain content emojis and member avatars/text preferences. No new health data is added to offline storage.

## Apply after review

Apply these scripts in order as the migration administrator, after migrations 1–8:

1. [202611060009_shared_catalogue.sql](../../supabase/migrations/202611060009_shared_catalogue.sql)
2. [202611060010_presentation.sql](../../supabase/migrations/202611060010_presentation.sql)

Migration 9 contains the starter release itself; no separate import is needed. Existing household tables remain private override tables. Effective catalogue reads use unexposed `app_private` security-invoker views, honoring the underlying RLS policies. The common release has member-only SELECT and no application write grant. Historical shopping references resolve the immutable common revision too. The shopping ingredient foreign key into the private-only food table is replaced by a scoped trigger validating the resolved catalogue, so common ingredients are valid while cross-household references remain invalid. No new environment variables or paid services are needed.

Review on staging with two real households: preserve existing private edits/history, load starters in a new household, edit/archive a starter privately, choose personal presentation and exercise installed-PWA offline/sign-out behavior. Google OAuth, hosted Realtime and physical-device acceptance remain deployment checks.

## Validation

Database coverage applies the real migrations and checks common resolution in a new household with zero copied food rows, private override isolation, immutable starter writes, personal preference persistence and forged-context/invalid-payload rejection. Browser coverage exercises Large text, avatar selection and a recipe emoji on a phone viewport alongside existing menu, shopping, reading/editing and household onboarding flows. Production build, formatting and offline/PWA regression checks are run before publication.

Photos, pantry, preparation-time limits and automatic translation remain deferred. Suggestion locks, swaps, copying weeks and ratings remain the next planning milestone.
