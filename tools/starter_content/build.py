"""Build the reviewable starter food pack; no application or database is deployed."""
from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from urllib.request import urlopen

from cofid import PAGE, SHA256, URL, numeric, read_workbook
from ingredients import PURCHASE_FACTORS, SELECTION, UNKNOWN_ENERGY_SPICES
from recipes import blueprints

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "content" / "starter"


def write(name, value):
    DEST.mkdir(parents=True, exist_ok=True)
    path = DEST / name
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def dec(value):
    return Decimal(str(value))


def display(value):
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def patterns(classes):
    result = ["omnivore"]
    if "meat" not in classes:
        result.append("pescatarian")
        if not classes.intersection({"fish", "shellfish"}):
            result.append("vegetarian")
            if not classes.intersection({"dairy", "egg", "honey"}):
                result.append("vegan")
    return result


def prep(food):
    if food in {"chickpeas", "beans_white", "beans_kidney", "beans_blackeye"}:
        return {"kind":"dry_legume", "soak_minutes":720, "additional_cook_minutes_range":[60,120],
          "instructions":{
            "en":"Weigh dry, then soak at least 12 hours. Discard soaking water, rinse, and use plenty of fresh water. Boil vigorously for at least 10 minutes, then continue cooking until fully tender, following the packet if it requires longer. Never cook raw kidney beans only in a slow cooker. The dry weight, not the hydrated weight, is the calorie reference.",
            "es":"Pesa en seco y remoja al menos 12 horas. Desecha el agua de remojo, enjuaga y usa abundante agua nueva. Hierve enérgicamente al menos 10 minutos y continúa la cocción hasta que estén completamente tiernas, siguiendo el envase si exige más tiempo. Nunca cocines alubias rojas crudas solo en una olla de cocción lenta. La referencia calórica es el peso seco, no el hidratado."}}
    if food in {"lentils_red", "lentils_green"}:
        return {"kind":"dry_lentil", "soak_minutes":0, "additional_cook_minutes_range":[20,40],
          "instructions":{"en":"Weigh dry and rinse. Cook in plenty of water until fully tender, following the packet; red split lentils usually soften sooner than whole lentils. No cooked-weight conversion is assumed.",
          "es":"Pesa en seco y enjuaga. Cuece en abundante agua hasta que estén completamente tiernas, siguiendo el envase; las lentejas rojas partidas suelen ablandarse antes que las enteras. No se presupone ninguna conversión de peso cocido."}}
    if food in {"rice_white","rice_brown","rice_risotto","pasta","pasta_wholewheat","couscous","bulgur","quinoa","barley"}:
        return {"kind":"dry_grain", "instructions":{"en":"Weigh dry, then cook with water according to the packet until tender; rinse quinoa first. Drain only if the packet method requires it. Count the original dry quantity for calories. Serve rice promptly; cool leftovers quickly, ideally within one hour, refrigerate, use within 24 hours and reheat only once.",
          "es":"Pesa en seco y cocina con agua según el envase hasta que esté tierno; lava antes la quinoa. Escurre solo si el método del envase lo requiere. Usa la cantidad seca inicial para calcular las calorías. Sirve el arroz enseguida; enfría las sobras rápidamente, idealmente en una hora, refrigera, consume en 24 horas y recalienta una sola vez."}}
    return None


def substitutions():
    rules = []
    def add(identifier, source, target, ratio, recipes, en, es):
        rules.append({"id":identifier,"from_ingredient_id":source,"to_ingredient_id":target,
          "initial_target_grams_per_source_gram":ratio,"ratio_basis":"editorial_starting_amount_not_nutritional_equivalence",
          "allowed_recipe_ids":recipes,"requires_review":True,"recalculate_calories_and_portions":True,
          "instruction_override":{"en":en,"es":es}})
    add("s01","chicken","turkey",1,["m17","m18","m27"],"Use boneless skinless turkey light meat; cook to the listed safe poultry temperature.","Usa carne blanca de pavo sin piel ni hueso y cocina hasta la temperatura segura indicada para aves.")
    add("s02","turkey","chicken",1,["m16","m26"],"Use chicken light meat, finely minced for meatballs; cook to the safe poultry temperature.","Usa carne blanca de pollo, picada finamente para las albóndigas; cocina hasta la temperatura segura para aves.")
    add("s03","chicken","tofu",1.3,["m18","m27"],"Omit the raw-chicken frying step. Cook vegetables first, then gently fold in source-matching plain steamed tofu and heat through. Review texture and portion size.","Omite el paso de freír pollo crudo. Cocina primero las verduras y añade con cuidado tofu natural al vapor que corresponda a la referencia; calienta bien y revisa textura y ración.")
    add("s04","turkey","tofu",1.3,["m26"],"Cook the carrot first; gently warm source-matching steamed tofu with the spinach instead of frying raw turkey.","Cocina primero la zanahoria; calienta con cuidado tofu al vapor que corresponda a la referencia con las espinacas, en lugar de freír pavo crudo.")
    add("s05","pork","tofu",1.3,["m19","m28"],"Cook fruit/vegetables first. Add plain steamed tofu near the end, gently; do not apply the raw-pork searing step.","Cocina primero la fruta y las verduras. Añade con cuidado tofu natural al vapor al final; no apliques el paso de dorar cerdo crudo.")
    add("s06","salmon","cod",1,["m20","m29"],"Use boneless cod; adjust cooking time to thickness and check the safe core temperature. This is not an equal-calorie swap.","Usa bacalao sin espinas; adapta el tiempo al grosor y comprueba la temperatura interior segura. El cambio no aporta las mismas calorías.")
    add("s07","cod","salmon",1,["m21","m30"],"Use boneless salmon and cook through; recalculate the higher-fat ingredient's calories before portion review.","Usa salmón sin espinas y cocina completamente; recalcula las calorías de este ingrediente más graso antes de revisar la ración.")
    add("s08","cod","tofu",1.2,["m21","m30"],"Cook the sauce/vegetables first, then add plain steamed tofu gently and heat through; do not treat tofu as raw fish.","Cocina primero la salsa o las verduras y añade con cuidado tofu natural al vapor; calienta bien y no trates el tofu como pescado crudo.")
    add("s09","salmon","tofu",1.2,["m20","m29"],"Cook the accompaniments first and gently heat plain steamed tofu separately; replace the fish-baking step.","Cocina primero las guarniciones y calienta con cuidado tofu natural al vapor aparte; sustituye el paso de hornear el pescado.")
    add("s10","prawns","tofu",1.2,["m22"],"Warm plain steamed tofu gently with the cooked rice/peas instead of frying raw prawns.","Calienta con cuidado tofu natural al vapor con el arroz y los guisantes cocidos en lugar de freír langostinos crudos.")
    add("s11","beef","lentils_green",0.45,["m15","m25"],"The replacement quantity is DRY lentils. Cook them separately until tender, then fold into the finished vegetable sauce; omit raw-mince browning.","La cantidad de sustitución es de lentejas SECAS. Cuécelas aparte hasta que estén tiernas e incorpóralas a la salsa de verduras terminada; omite el dorado de carne cruda.")
    add("s12","tuna","chickpeas",0.5,["m23"],"The quantity is DRY chickpeas. Complete soaking and boiling first, then use the cooked chickpeas in place of drained tuna.","La cantidad es de garbanzos SECOS. Completa primero el remojo y la cocción y usa los garbanzos cocidos en lugar del atún escurrido.")
    add("s13","sardines","chickpeas",0.5,["m24"],"Prepare the dry chickpeas fully, mash with the listed lemon, then use as a toast topping instead of sardines. This does not preserve fish nutrients.","Prepara completamente los garbanzos secos, machaca con el limón indicado y úsalos sobre la tostada en lugar de sardinas. No conserva los nutrientes del pescado.")
    add("s14","milk","soy_milk",1,["b01","b03","b09"],"Replace by weighed grams, not an assumed equal volume. The soy drink must match the unsweetened fortified source entry.","Sustituye por gramos pesados, sin presuponer un volumen igual. La bebida de soja debe corresponder a la referencia enriquecida y sin azúcar.")
    add("s15","egg","tofu",1.5,["b07","b08"],"Make a tofu scramble, not a set omelette: cook vegetables first, fold in crumbled plain steamed tofu and heat through.","Prepara un revuelto de tofu, no una tortilla cuajada: cocina primero las verduras, añade tofu natural al vapor desmenuzado y calienta bien.")
    add("s16","rice_white","rice_brown",1,["m02","m09","m18","m22"],"Swap dry weights and follow the brown-rice packet's longer cooking time.","Sustituye los pesos en seco y sigue el mayor tiempo de cocción indicado en el envase del arroz integral.")
    add("s17","pasta","pasta_wholewheat",1,["m16","m23"],"Swap dry weights and follow the replacement packet's cooking instructions.","Sustituye los pesos en seco y sigue las instrucciones de cocción del envase de la pasta elegida.")
    add("s18","peanut_butter","almond",1,["b02"],"Use finely chopped almonds as a topping rather than a spread; this is not a nut-free alternative.","Usa almendras picadas como cobertura en lugar de una crema; no es una alternativa sin frutos de cáscara.")
    add("s19","walnut","pumpkin_seed",1,["b01","b04"],"Replace the topping by weighed grams and review exclusions for the replacement ingredient.","Sustituye la cobertura por gramos pesados y revisa las exclusiones del ingrediente alternativo.")
    return rules


def build(workbook):
    source = read_workbook(workbook)
    proximates, factors = source["1.3 Proximates"], source["1.2 Factors"]
    ingredients, snapshots = [], {}
    for identifier, code, en, es, state, variety, category in SELECTION:
        p, f = proximates[code], factors[code]
        cells, fcells = p["cells"], f["cells"]
        kcal = numeric(cells.get("M"))
        if kcal is None:
            raise ValueError(f"Unknown energy for selected food {identifier} {code}")
        conversions = [{"unit":"g","grams_per_unit":1,"basis":"mass_definition"},
                       {"unit":"kg","grams_per_unit":1000,"basis":"mass_definition"}]
        density = numeric(fcells.get("I"))
        if density is not None and density > 0:
            conversions += [{"unit":unit,"grams_per_unit":factor*density,
                            "basis":"cofid_specific_gravity_approximate_g_per_ml","source_column":"I",
                            "source_value":fcells["I"]} for unit,factor in [("ml",1),("metric_tsp",5),("metric_tbsp",15)]]
        item = {"id":identifier,"name":{"en":en,"es":es},"state":state,"quantity_basis":"edible_reference_weight",
          "food_class":category,"variety_key":variety,"dietary_patterns":patterns({category}),
          "nutrition_per_100g":{"energy_kcal":kcal,"protein_g":numeric(cells.get("J")),"fat_g":numeric(cells.get("K")),
            "carbohydrate_g":numeric(cells.get("L")),"fibre_aoac_g":numeric(cells.get("Z"))},
          "conversions":conversions,"default_unit":"g","source":{"dataset":"cofid_2021","food_code":code,
            "original_name":cells["B"],"proximates_row":p["row"],"factors_row":f["row"],
            "energy_cell":f"M{p['row']}","raw_energy_value":cells["M"]},
          "shopping_policy":"exclude_cooking_water" if identifier=="water" else "include",
          "preparation":prep(identifier)}
        if identifier in PURCHASE_FACTORS:
            purchase_code = PURCHASE_FACTORS[identifier]
            pf = factors[purchase_code]
            fraction = numeric(pf["cells"].get("H"))
            if fraction is None or not 0 < fraction <= 1:
                raise ValueError(f"Missing source edible factor for {identifier}")
            item["purchase_yield_reference"] = {"source_food_code":purchase_code,"source_food_name":pf["cells"]["B"],
              "edible_fraction":fraction,"basis":"cofid_factors_edible_proportion_typical_not_exact", "source_cell":f"H{pf['row']}"}
            snapshots[purchase_code] = {"factors":pf,"proximates":proximates[purchase_code]}
        if identifier in {"egg","bread"}:
            item["reference_piece_conversion"] = {"unit":"reference_egg" if identifier=="egg" else "reference_slice",
              "grams_per_unit":50 if identifier=="egg" else 40,"quantity_step":0.25,
              "status":"editorial_estimate_requires_household_confirmation","source":"not_a_cofid_piece_weight",
              "note":{"en":"Use weighed edible grams until your egg or slice size is confirmed; these reference weights are not universal.",
                      "es":"Usa gramos comestibles pesados hasta confirmar el tamaño de tus huevos o rebanadas; estos pesos de referencia no son universales."}}
        if identifier == "tofu":
            item["source_match_note"] = {"en":"The source describes plain STEAMED tofu (73 kcal/100 g), not every firm tofu brand. Use a matching product or replace its nutrition values before planning.",
              "es":"La referencia describe tofu natural AL VAPOR (73 kcal/100 g), no cualquier tofu firme comercial. Usa un producto equivalente o actualiza sus valores antes de planificar."}
        if identifier in {"bread","pitta","peanut_butter","soy_milk","tofu","coconut_milk","soy_sauce","yogurt"}:
            item["dietary_label_condition"] = {
              "for_patterns":["vegetarian"] if identifier=="yogurt" else ["vegan"],
              "status":"requires_actual_product_label_confirmation",
              "requirement":{"en":"Choose a source-matching product whose label confirms the selected dietary pattern; generic nutrition data do not certify every brand.",
                             "es":"Elige un producto que corresponda a la referencia y cuya etiqueta confirme el patrón alimentario elegido; los datos genéricos no certifican todas las marcas."}}
        ingredients.append(item)
        snapshots[code] = {"proximates":p,"factors":f}
    lookup = {x["id"]:x for x in ingredients}
    recipes = blueprints()
    for recipe in recipes:
        base_classes, all_classes = set(),set()
        without,with_dessert = Decimal(0),Decimal(0)
        prep_items = {}
        for component in recipe["components"]:
            total, classes = Decimal(0),set()
            keys = set()
            for line in component["ingredients"]:
                food = lookup[line["ingredient_id"]]
                total += dec(line["quantity"])*dec(food["nutrition_per_100g"]["energy_kcal"])/100
                classes.add(food["food_class"])
                if line["variety_role"] in {"main","base"}:
                    keys.add(food["variety_key"])
                if food["preparation"]:
                    mode="within_main_method" if recipe["id"]=="m02" and food["id"]=="lentils_red" else "separate_before_finishing"
                    prep_items[food["id"]] = {"ingredient_id":food["id"],"mode":mode,**copy.deepcopy(food["preparation"])}
            component["reference_energy_kcal"] = display(total)
            component["reference_energy_kcal_exact"] = str(total.normalize())
            component["dietary_patterns"] = patterns(classes)
            component["variety_keys"] = sorted(keys)
            with_dessert += total
            all_classes |= classes
            if not component["optional"]:
                without += total
                base_classes |= classes
        recipe["reference_energy_kcal"] = {"without_optional_dessert":display(without),"with_optional_dessert":display(with_dessert)}
        recipe["reference_energy_kcal_exact"] = {"without_optional_dessert":str(without.normalize()),"with_optional_dessert":str(with_dessert.normalize())}
        recipe["dietary_patterns"] = {"without_optional_dessert":patterns(base_classes),"with_optional_dessert":patterns(all_classes)}
        recipe["ingredient_preparation"] = list(prep_items.values())
        recipe["dietary_label_checks"] = {}
        for variant in ["without_optional_dessert","with_optional_dessert"]:
            ids={line["ingredient_id"] for c in recipe["components"] if not c["optional"] or variant=="with_optional_dessert" for line in c["ingredients"]}
            recipe["dietary_label_checks"][variant]=[{"ingredient_id":i,**copy.deepcopy(lookup[i]["dietary_label_condition"])} for i in sorted(ids) if "dietary_label_condition" in lookup[i]]
        recipe["finishing_times_exclude_soaking_and_prerequisite_cooking"] = True
        classes = all_classes
        recipe["safety_note_ids"] = ["weigh_and_prepare"]
        if any(lookup[l["ingredient_id"]]["food_class"] in {"meat","fish","shellfish","egg"} and lookup[l["ingredient_id"]]["state"]=="raw_edible" for c in recipe["components"] for l in c["ingredients"]):
            recipe["safety_note_ids"].append("cook_thoroughly")
        if any(lookup[l["ingredient_id"]]["variety_key"]=="rice" for c in recipe["components"] for l in c["ingredients"]):
            recipe["safety_note_ids"].append("rice_storage")
    gaps=[]
    for code in UNKNOWN_ENERGY_SPICES:
        p=proximates[code]
        gaps.append({"food_code":code,"source_name":p["cells"]["B"],"energy_source_value":p["cells"].get("M"),
          "reason":"unknown_energy_not_imported_as_zero","source_row":p["row"]})
    write("ingredients.json",{"schema_version":"1.0.0","ingredients":ingredients})
    with (DEST/"ingredients.csv").open("w",encoding="utf-8",newline="") as output:
        writer=csv.writer(output,lineterminator="\n")
        writer.writerow(["id","name_en","name_es","source_food_code","source_food_name","state","variety_key","kcal_per_100g","protein_g","fat_g","carbohydrate_g","fibre_aoac_g","source_energy_cell"])
        for f in ingredients:
            n=f["nutrition_per_100g"]
            writer.writerow([f["id"],f["name"]["en"],f["name"]["es"],f["source"]["food_code"],f["source"]["original_name"],f["state"],f["variety_key"],n["energy_kcal"],n["protein_g"],n["fat_g"],n["carbohydrate_g"],n["fibre_aoac_g"],f["source"]["energy_cell"]])
    write("cofid-source-rows.json",{"dataset":"cofid_2021","workbook_sha256":SHA256,"rows":snapshots})
    write("recipes.json",{"schema_version":"1.0.0","recipes":recipes})
    write("substitutions.json",{"schema_version":"1.0.0","rules":substitutions()})
    write("source-manifest.json",{"pack_version":"1.0.0","source":{"id":"cofid_2021","release":"2021","publication_url":PAGE,
      "download_url":URL,"sha256":SHA256,"worksheets":["1.2 Factors","1.3 Proximates"],
      "licence":"Open Government Licence v3.0","licence_url":"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"},
      "recipe_text":{"origin":"newly_authored_for_this_repository","third_party_recipe_text_copied":False,
                     "new_blanket_repository_licence_added":False,"kitchen_tested":False},
      "coverage":{"ingredient_count":len(ingredients),"recipe_count":len(recipes),"breakfast_count":sum(r["meal_types"]==["breakfast"] for r in recipes),
                  "main_meal_count":sum(r["meal_types"]==["lunch","dinner"] for r in recipes),"substitution_count":len(substitutions()),
                  "excluded_unknown_energy_spices":gaps,
                  "excluded_ambiguous_source_codes":{sheet:{code:[{"row":r["row"],"name":r["cells"]["B"]} for r in rows] for code,rows in conflicts.items()} for sheet,conflicts in source["_ambiguous_rows"].items()},
                  "scope":"food_content_only_activity_catalogue_is_a_separate_delivery"},
      "quantity_conventions":{"nutrition_reference":"100 g edible ingredient in the stated raw/dry/as-sold/prepared state",
        "cooking_water":"zero-energy water may be added as needed; not a shopping requirement",
        "piece_weights":"editorial reference estimates; require household confirmation before count-based planning",
        "recipe_reference":"reference amounts before personal scaling and unit-aware rounding",
        "purchase_yields":"source typical edible proportions; gross purchased weight is an estimate, not nutrition weight"}})
    book = ["# Starter recipe book / Recetario inicial", "", "48 original bilingual reference recipes. Amounts are for one reference serving, before personal scaling and rounding.",
      "Pesos para una ración de referencia, antes del ajuste personal y el redondeo.",
      "", "Weights are raw edible/dry, or the explicitly stated ready-to-use product. Dry pulses need the prerequisite soaking/cooking shown below; finishing times do not include that preparation.",
      "Los pesos son en crudo comestible/seco o del producto preparado indicado. Las legumbres secas requieren el remojo y la cocción previa que figuran en cada receta; los tiempos finales no incluyen esa preparación.",
      "", "Calories are CoFID-based estimates, not laboratory analyses of finished dishes. Recipes are desk-validated, not kitchen-tested. Complete shared preparations once; main/side methods refer to those same quantities, not extra food. Intended dietary tags require matching product labels where specified. See [README](README.md) and [NOTICE](NOTICE.md).", ""]
    for r in recipes:
        book += [f"## {r['id']} — {r['name']['en']} / {r['name']['es']}","",
          f"Base: **{r['reference_energy_kcal']['without_optional_dessert']:.2f} kcal**; with optional dessert / con postre opcional: **{r['reference_energy_kcal']['with_optional_dessert']:.2f} kcal**.",
          f"Hands-on / preparación activa: {r['active_prep_minutes']} min; finishing cook / cocción final: {r['finishing_cook_minutes']} min. Prerequisite cooking is additional.",
          "", "Patterns without dessert / patrones sin postre: " + ", ".join(r["dietary_patterns"]["without_optional_dessert"]), ""]
        if r["ingredient_preparation"]:
            book += ["### Preparation / Preparación", ""]
            for p in r["ingredient_preparation"]:
                mode="Within the main method; do not pre-cook separately. / Dentro del método principal; no precocines por separado." if p["mode"]=="within_main_method" else "Complete before finishing. / Completa antes de la cocción final."
                book += [f"- **{lookup[p['ingredient_id']]['name']['en']} / {lookup[p['ingredient_id']]['name']['es']}:** {mode} {p['instructions']['en']} {p['instructions']['es']}"]
            book += [""]
        for c in r["components"]:
            book += [f"### {c['name']['en']} / {c['name']['es']}"+(" — optional per person / opcional por persona" if c["optional"] else ""), "",
              "| Ingredient / Ingrediente | Quantity / Cantidad |", "| --- | ---: |"]
            for l in c["ingredients"]:
                f=lookup[l["ingredient_id"]]
                book.append(f"| {f['name']['en']} / {f['name']['es']} | {l['quantity']} g |")
            book += [""]
            for i,s in enumerate(c["instructions"],1):
                book += [f"{i}. {s['en']} / {s['es']}"]
            book += [""]
        if "cook_thoroughly" in r["safety_note_ids"]:
            book += ["Cook raw animal ingredients thoroughly: use a core of 75°C for 30 seconds (or an equivalent safe combination). / Cocina completamente los ingredientes animales crudos: 75 °C en el centro durante 30 segundos, o una combinación segura equivalente.", ""]
    (DEST/"recipes.md").write_text("\n".join(book).rstrip()+"\n",encoding="utf-8")
    summary = [{"id":r["id"],"en":r["name"]["en"],"es":r["name"]["es"],"meal_types":r["meal_types"],"base_kcal":r["reference_energy_kcal"]["without_optional_dessert"],"with_dessert_kcal":r["reference_energy_kcal"]["with_optional_dessert"],"base_patterns":r["dietary_patterns"]["without_optional_dessert"]} for r in recipes]
    write("recipe-index.json",{"recipes":summary})
    overview=["# Starter food content — review overview","",
      "Prepared for the agreed household PWA. This is starter data and tooling; no application or Supabase import has been started.","",
      f"- **{len(ingredients)} CoFID-linked ingredients**, with English/Spanish names and raw/dry/as-sold states.",
      "- **48 original bilingual recipes:** 12 breakfasts and 36 lunch/dinner options.",
      "- **8 optional dessert templates** embedded in main recipes; selection remains per person.",
      "- **19 context-specific substitution candidates**, each requiring review.","",
      "Browse the [full bilingual recipe book](../content/starter/recipes.md), [ingredient spreadsheet](../content/starter/ingredients.csv), [source manifest](../content/starter/source-manifest.json), and [executed validation report](../content/starter/validation-report.json).", "",
      "## Reference recipe index","",
      "Values below are estimated kcal per one reference serving, before individual scaling and rounding. With-dessert totals include the selected template; household members may skip it.","",
      "| ID | English | Español | Base kcal | With dessert kcal |","| --- | --- | --- | ---: | ---: |"]
    for r in recipes:
        n=r["reference_energy_kcal"]
        overview.append(f"| {r['id']} | {r['name']['en']} | {r['name']['es']} | {n['without_optional_dessert']:.2f} | {n['with_optional_dessert']:.2f} |")
    overview += ["", "## What was checked", "",
      "The validator compares selected nutrition/factor rows to the complete checksum-pinned CoFID workbook, recomputes recipe/component calories, checks bilingual fields and links, validates conversions and dietary metadata, and probes seven-day lunch/dinner feasibility under the three-day main/base ingredient rule for omnivore, vegetarian and vegan selections. The probe assumes required product-label conditions are met.","",
      "The reference mains include 20 intended vegetarian-compatible choices, of which 17 are vegan-compatible before optional dessert and subject to ingredient-label conditions. Context-specific substitutions provide additional candidates, not guaranteed equal-nutrient replacements.","",
      "## Review notes", "",
      "- **Not kitchen-tested:** recipe text, quantities and cooking methods need household taste/practicality review. Data consistency checks are not a cooking trial.",
      "- **Dry pulses:** some dishes need overnight soaking and earlier cooking. Finishing times explicitly exclude those stages; they suit advance preparation.",
      "- **Source-specific tofu:** the source entry is steamed plain tofu, not every firm tofu brand. Match the product or update nutrition values.",
      "- **Units:** source-backed volume conversions are provided where available; egg/slice reference weights remain clearly marked as estimates needing household confirmation.",
      "- **Diet labels:** tags describe intended ingredient forms. Product-label conditions must be checked; these are not allergen guarantees.",
      "- **Coverage gaps:** seven spices with unknown source kcal and the ambiguous 13-669 food code are excluded, never silently treated as zero or overwritten.",
      "- **Scope:** the pack covers food content. The Compendium activity catalogue is a separate delivery item.","",
      "## Files and reproduction", "",
      "See the [pack README](../content/starter/README.md) for file formats, conventions and rebuild commands, and [NOTICE](../content/starter/NOTICE.md) for CoFID attribution and recipe authorship.","",
      "Application code, database migrations, household profiles, deployment and application tests remain outside this content task."]
    (ROOT/"docs"/"starter-content.md").write_text("\n".join(overview)+"\n",encoding="utf-8")
    print(json.dumps({"ingredients":len(ingredients),"recipes":len(recipes),"substitutions":len(substitutions()),"unknown_energy_gaps":len(gaps)}))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook",type=Path)
    parser.add_argument("--download",action="store_true")
    args=parser.parse_args()
    workbook=args.workbook or ROOT/".cache"/"cofid-2021.xlsx"
    if args.download:
        workbook.parent.mkdir(parents=True,exist_ok=True)
        with urlopen(URL,timeout=60) as response:
            workbook.write_bytes(response.read())
    if not workbook.exists():
        parser.error("Supply --workbook or --download")
    build(workbook)


if __name__=="__main__":
    main()
