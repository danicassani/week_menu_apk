# Starter food content / Contenido alimentario inicial

This is a source-backed, desk-validated food pack for review and a future database importer. It does not deploy an application or import data into Supabase.

- **97 ingredients** linked to the official UK CoFID 2021 workbook.
- **48 newly authored bilingual recipes:** 12 individual breakfast options and 36 lunch/dinner options.
- **8 optional dessert templates**, embedded in the main-meal recipes and selectable per person.
- **19 context-specific substitution candidates**, always requiring review and recalculation.
- Source-supported unit conversions, raw source snapshots, coverage gaps, and validation results.

Start with the [recipe book](recipes.md), [recipe index](recipe-index.json), and [validation report](validation-report.json). The [content review overview](../../docs/starter-content.md) summarizes readiness and limits. Read the [source notice](NOTICE.md).

## Files

| File | Purpose |
| --- | --- |
| `ingredients.json` | Bilingual identities, raw/dry/as-sold state, source energy, optional macros, conversions, variety keys, label conditions |
| `ingredients.csv` | Spreadsheet-friendly export of the same ingredient identities and nutrition |
| `cofid-source-rows.json` | Exact selected worksheet cells/rows, including source qualifiers and purchase-yield references |
| `recipes.json` | Structured original recipes, component quantities, methods, source-derived reference calories, preparation, intended dietary compatibility |
| `recipes.md` | Generated human-readable English/Spanish recipe book |
| `recipe-index.json` | Compact review listing with base/optional-dessert calories |
| `substitutions.json` | Starting ratios, permitted recipe contexts, bilingual method changes, mandatory review |
| `source-manifest.json` | Pinned source URL/checksum, release/licence, counts, excluded data, conventions |
| `safety-notes.json` | Common bilingual preparation guidance and official references |
| `validation-report.json` | Executed source/data checks and three-day variety feasibility probes |

## Quantity and calorie contract

All reference recipes describe **one serving before personal scaling and rounding**. Use raw edible weights, dry pulse/grain weights, or the explicitly described ready-to-use product. Exclude egg shells, fruit stones/peel, bones and other inedible material from nutrition weight. Weigh drained canned foods after draining. Oil and dressings are explicitly included.

Dry legumes must be soaked/cooked using the listed preparation. The calorie reference stays their original dry weight. Finishing times exclude soaking and prerequisite cooking; a batch-prepared ingredient is not an additional ingredient quantity. The dal cooks its lentils within the main method rather than twice.

Calories are calculated from CoFID's published kcal field, not reconstructed from a different macro-energy convention. Macro values marked `N`, `Tr`, or missing stay `null`; original qualifiers are preserved in the source snapshot. Known zero energy is different from missing energy.

The source describes **steamed plain tofu at 73 kcal/100 g**. It must not silently stand in for arbitrary firm tofu products. Use a source-matching product or edit nutrition values for the actual product. The same source-descriptor matching applies to extra-lean mince, turkey light meat and other branded/variable foods.

### Unit conversions

- Every ingredient has defined grams and kilograms.
- Milk and soya drink have source-specific gravity values; their `ml`, metric 5 ml teaspoon, and metric 15 ml tablespoon conversions use those values as approximate density references.
- A missing oil/juice density is **not** assumed to equal water. Those reference recipes use grams.
- Egg/slice piece weights are explicitly marked editorial reference estimates requiring household confirmation; they are not active conversions and not claimed as CoFID measurements. Weighed grams work immediately.
- Typical whole-fruit edible fractions are preserved from the paired CoFID Factors records. They can support **estimated** gross purchase amounts. Calorie weight remains edible; package quantities and waste are not secretly mixed into nutrition quantities.

At planning time apply the approved rounding rule in the chosen unit, then calculate calories and shopping contributions from those actual saved quantities. Reference recipe calories are not a promise that a later rounded personal portion hits its budget exactly; existing warnings and manual editing still apply.

## Dietary compatibility and substitutions

Patterns are derived for the listed ingredient forms, both without dessert and with dessert. They are **intended compatibility**, not certification of every commercial product or allergen safety. Product-dependent records carry label conditions, and recipes preserve those required checks. A household must confirm the actual product matches before relying on a conditional pattern.

Ingredients tagged `main` or `base` drive the configurable lunch/dinner variety window; support ingredients and breakfast do not. White/brown rice share `rice`, pasta types share `pasta`, and bread/pitta share `bread`. Distinct dry pulse types have explicit keys; whole/split lentils share `lentil`. These are editable editorial classifications, not metadata published by CoFID.

Substitution ratios are editorial starting quantities, not nutritional equivalence or physical cooking yields. Each candidate includes a method change: for example, dry lentils replacing mince must be cooked separately, and steamed tofu is not cooked as raw poultry. Recalculate calories, portions, dietary conditions and variety after review.

## Source exclusions

Seven common spices have `N` for kcal in this release, including cinnamon, cumin, paprika, black pepper, turmeric, oregano and chilli powder. They are recorded as coverage gaps rather than imported with zero calories. The starter recipes use covered fresh herbs, fresh chilli, garlic and ginger instead. A household can later add verified product data.

The official workbook also uses **13-669** for both roasted aubergine and raw watercress. Neither is selected. The importer excludes ambiguous codes instead of silently overwriting a row, and the manifest records the collision. Every selected record is identified by pinned workbook, code, original name and worksheet row.

## Rebuild and validate

Python standard library only; no application dependencies are required.

```sh
python tools/starter_content/build.py --download
python tools/starter_content/validate.py --workbook .cache/cofid-2021.xlsx --self-check
```

For an existing official workbook:

```sh
python tools/starter_content/build.py --workbook /path/to/cofid-2021.xlsx
python tools/starter_content/validate.py --workbook /path/to/cofid-2021.xlsx --self-check
```

The importer rejects a different source checksum rather than silently changing the release. Generated recipe/nutrition artifacts are deterministic. The validation report records whether it was checked against the complete source workbook. `--self-check` also confirms that deliberately damaged copies (wrong source energy, missing translations, unknown ingredients, invented density, unreviewed swaps, enabled desserts and a wrong source fingerprint) are rejected. An offline validation without `--workbook` checks packaged snapshots only.

## Review limits

The recipes have **not been kitchen-tested**. Source, references, translation presence, calorie arithmetic, component integrity and variety feasibility have been checked. The feasibility menus are data probes, not personalized or nutritionally balanced prescriptions. Actual product-label confirmation, cooking practicality and taste remain part of household review.

This food pack does not include the separate Compendium activity catalogue, a live application, household profiles, or a Supabase import.
