# Starter food content — review overview

Prepared for the agreed household PWA. This is starter data and tooling; no application or Supabase import has been started.

- **97 CoFID-linked ingredients**, with English/Spanish names and raw/dry/as-sold states.
- **48 original bilingual recipes:** 12 breakfasts and 36 lunch/dinner options.
- **8 optional dessert templates** embedded in main recipes; selection remains per person.
- **19 context-specific substitution candidates**, each requiring review.

Browse the [full bilingual recipe book](../content/starter/recipes.md), [ingredient spreadsheet](../content/starter/ingredients.csv), [source manifest](../content/starter/source-manifest.json), and [executed validation report](../content/starter/validation-report.json).

## Reference recipe index

Values below are estimated kcal per one reference serving, before individual scaling and rounding. With-dessert totals include the selected template; household members may skip it.

| ID | English | Español | Base kcal | With dessert kcal |
| --- | --- | --- | ---: | ---: |
| b01 | Apple and ginger porridge | Gachas de avena con manzana y jengibre | 413.38 | 413.38 |
| b02 | Banana and peanut oat bowl | Bol de avena con plátano y cacahuete | 384.20 | 384.20 |
| b03 | Berry yogurt overnight oats | Avena reposada con yogur y frutos rojos | 370.20 | 370.20 |
| b04 | Pear, walnut and yogurt bowl | Bol de pera, nueces y yogur | 392.30 | 392.30 |
| b05 | Avocado and egg toast | Tostada de aguacate y huevo | 364.15 | 364.15 |
| b06 | Tomato and seed toast | Tostada de tomate y semillas | 335.05 | 335.05 |
| b07 | Spinach scramble with toast | Revuelto de espinacas con tostada | 330.15 | 330.15 |
| b08 | Mushroom and parsley omelette | Tortilla de champiñones y perejil | 315.57 | 315.57 |
| b09 | Banana oat pancakes | Tortitas de avena y plátano | 394.83 | 394.83 |
| b10 | Mango and sunflower yogurt bowl | Bol de yogur con mango y girasol | 377.40 | 377.40 |
| b11 | Cocoa banana porridge | Gachas de cacao y plátano | 394.50 | 394.50 |
| b12 | Chickpea and tomato toast | Tostada de garbanzos y tomate | 318.87 | 318.87 |
| m01 | Chickpea and spinach tomato stew | Guiso de garbanzos con tomate y espinacas | 481.39 | 588.19 |
| m02 | Ginger red-lentil dal | Dal de lentejas rojas y jengibre | 537.25 | 646.65 |
| m03 | White bean and vegetable casserole | Cazuela de alubias blancas y verduras | 447.65 | 512.59 |
| m04 | Red bean and pepper quinoa bowl | Bol de quinoa con alubias rojas y pimiento | 471.41 | 567.01 |
| m05 | Ginger tofu and pasta ribbons | Tofu al jengibre con pasta | 499.85 | 635.81 |
| m06 | Mushroom and leek barley | Cebada con champiñones y puerro | 394.41 | 438.47 |
| m07 | Roasted squash couscous | Cuscús con calabaza asada | 518.54 | 665.34 |
| m08 | Lentil and tomato spaghetti | Espaguetis con lentejas y tomate | 510.89 | 590.89 |
| m09 | Chickpea and aubergine ginger curry | Garbanzos con berenjena y jengibre | 575.01 | 681.81 |
| m10 | Eggs in tomato and pepper sauce | Huevos con salsa de tomate y pimiento | 419.81 | 529.21 |
| m11 | Lighter potato tortilla | Tortilla de patata con poco aceite | 437.62 | 502.56 |
| m12 | Spinach quinoa with almonds | Quinoa con espinacas y almendras | 415.29 | 510.89 |
| m13 | Roasted pepper and white bean pitta | Pita de pimiento asado y alubias blancas | 435.59 | 571.55 |
| m14 | Pea and mint barley bowl | Bol de cebada, guisantes y menta | 487.04 | 531.10 |
| m15 | Beef and pepper bulgur skillet | Sartén de ternera, pimiento y bulgur | 523.11 | 669.91 |
| m16 | Turkey oat meatballs with pasta | Albóndigas de pavo y avena con pasta | 525.19 | 605.19 |
| m17 | Lemon chicken with potatoes and broccoli | Pollo al limón con patata y brócoli | 444.11 | 550.91 |
| m18 | Chicken and pepper rice skillet | Arroz con pollo y pimientos | 472.99 | 582.39 |
| m19 | Pork and apple with brown rice | Cerdo con manzana y arroz integral | 513.90 | 578.84 |
| m20 | Dill salmon with potatoes and green beans | Salmón al eneldo con patatas y judías verdes | 534.97 | 630.57 |
| m21 | Cod with chickpea tomato sauce | Bacalao con salsa de tomate y garbanzos | 400.41 | 536.37 |
| m22 | Garlic prawn rice with peas | Arroz con langostinos al ajo y guisantes | 488.82 | 532.88 |
| m23 | Tuna, tomato and lemon pasta | Pasta con atún, tomate y limón | 450.50 | 597.30 |
| m24 | Sardine and tomato toast | Tostadas de sardinas y tomate | 470.99 | 550.99 |
| m25 | Beef and mushroom yogurt skillet | Ternera con champiñones y yogur | 513.92 | 620.72 |
| m26 | Turkey, spinach and quinoa bowl | Bol de pavo, espinacas y quinoa | 443.12 | 552.52 |
| m27 | Mediterranean chicken couscous | Cuscús mediterráneo con pollo | 468.34 | 533.28 |
| m28 | Pork and sweet pepper bulgur | Bulgur con cerdo y pimiento dulce | 485.71 | 581.31 |
| m29 | Salmon and tomato rice bowl | Bol de arroz con salmón y tomate | 567.37 | 703.33 |
| m30 | Cod, potato and pea tray bake | Bandeja de bacalao, patata y guisantes | 453.06 | 497.12 |
| m31 | Roasted cauliflower and lentil salad | Ensalada de coliflor asada y lentejas | 383.92 | 530.72 |
| m32 | Broccoli and sesame tofu quinoa | Quinoa con brócoli, tofu y sésamo | 507.45 | 587.45 |
| m33 | Black-eyed beans with sweet potato | Alubias carillas con boniato | 491.53 | 598.33 |
| m34 | Creamy pea and spinach pasta | Pasta cremosa con guisantes y espinacas | 461.19 | 570.59 |
| m35 | Mushroom and chickpea stuffed peppers | Pimientos rellenos de champiñones y garbanzos | 430.47 | 495.41 |
| m36 | Lentil and courgette potato pie | Pastel de lentejas, calabacín y patata | 526.85 | 622.45 |

## What was checked

The validator compares selected nutrition/factor rows to the complete checksum-pinned CoFID workbook, recomputes recipe/component calories, checks bilingual fields and links, validates conversions and dietary metadata, and probes seven-day lunch/dinner feasibility under the three-day main/base ingredient rule for omnivore, vegetarian and vegan selections. The probe assumes required product-label conditions are met.

The reference mains include 20 intended vegetarian-compatible choices, of which 17 are vegan-compatible before optional dessert and subject to ingredient-label conditions. Context-specific substitutions provide additional candidates, not guaranteed equal-nutrient replacements.

## Review notes

- **Not kitchen-tested:** recipe text, quantities and cooking methods need household taste/practicality review. Data consistency checks are not a cooking trial.
- **Dry pulses:** some dishes need overnight soaking and earlier cooking. Finishing times explicitly exclude those stages; they suit advance preparation.
- **Source-specific tofu:** the source entry is steamed plain tofu, not every firm tofu brand. Match the product or update nutrition values.
- **Units:** source-backed volume conversions are provided where available; egg/slice reference weights remain clearly marked as estimates needing household confirmation.
- **Diet labels:** tags describe intended ingredient forms. Product-label conditions must be checked; these are not allergen guarantees.
- **Coverage gaps:** seven spices with unknown source kcal and the ambiguous 13-669 food code are excluded, never silently treated as zero or overwritten.
- **Scope:** the pack covers food content. The Compendium activity catalogue is a separate delivery item.

## Files and reproduction

See the [pack README](../content/starter/README.md) for file formats, conventions and rebuild commands, and [NOTICE](../content/starter/NOTICE.md) for CoFID attribution and recipe authorship.

Application code, database migrations, household profiles, deployment and application tests remain outside this content task.
