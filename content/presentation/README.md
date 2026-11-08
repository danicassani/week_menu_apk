# Presentation overlays

These are read-only V4 display rules, separate from the pinned starter release in `content/starter`. They change no ingredient identity, nutritional value, reference state, quantity, source attribution or historical record.

- `ingredient-names.json`: curated bilingual short names with exact original names. Each language is projected only when both identity and its original name match. Keep meaningful product qualifiers; never use a blanket word-removal rule on private content.
- `recipe-display.json`: generated recognized starter IDs, exact generic preparation notes to hide, and exact original numbered steps whose references to the removed panel need self-contained cooking directions. Private notes/methods and unknown recipe identities are preserved.

Run `node scripts/build-content-display.mjs` from the repository root to reproduce the recipe overlay and **pending** migration 18's search aliases. Curated ingredient labels are the input; original starter recipes supply the exact matching guards. Do not rewrite an already applied SQL migration when changing these labels later: publish a new additive migration and compatible frontend together.

Coverage includes frontend/SQL parity, private overrides, serving captions, historical/offline readers and unchanged source content. See [the milestone report](../../docs/version-4/milestone-3.md).
