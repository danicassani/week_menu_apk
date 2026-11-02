"""Validate source traceability and cross-record food content, not an application."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
import shutil
import tempfile
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from cofid import SHA256, numeric, read_workbook

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "content" / "starter"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def D(n):
    return Decimal(str(n))


def grams(line, foods):
    units={c["unit"]:D(c["grams_per_unit"]) for c in foods[line["ingredient_id"]]["conversions"]}
    require(line["unit"] in units,"Unknown/unconfirmed unit: "+str(line))
    return D(line["quantity"])*units[line["unit"]]


def energy(lines, foods):
    return sum((grams(l,foods)*D(foods[l["ingredient_id"]]["nutrition_per_100g"]["energy_kcal"])/100 for l in lines),D(0))


def expected_patterns(classes):
    # Deliberately validate the semantic dietary predicate independently of builder code.
    forbidden={"vegan":{"meat","fish","shellfish","dairy","egg","honey"},
               "vegetarian":{"meat","fish","shellfish"},"pescatarian":{"meat"},"omnivore":set()}
    return {p for p,banned in forbidden.items() if not classes & banned}


def trial_menu(recipes, diet):
    candidates=[r for r in recipes if r["meal_types"]==["lunch","dinner"] and diet in r["dietary_patterns"]["without_optional_dessert"]]
    by_id={r["id"]:r for r in candidates}
    keys={r["id"]:set(k for c in r["components"] if not c["optional"] for k in c["variety_keys"]) for r in candidates}
    for seed in range(500):
        rng=random.Random(seed); chosen=[]; use=Counter()
        for slot in range(14):
            blocked=set()
            for previous,identifier in enumerate(chosen):
                if slot//2-previous//2 < 3:
                    blocked |= keys[identifier]
            valid=[r for r in candidates if not keys[r["id"]]&blocked]
            if not valid:
                break
            rng.shuffle(valid)
            valid.sort(key=lambda r:use[r["id"]])
            identifier=valid[0]["id"];chosen.append(identifier);use[identifier]+=1
        if len(chosen)==14:
            # Separate, pairwise verification of the resulting full rolling-window plan.
            for i,a in enumerate(chosen):
                for j,b in enumerate(chosen[:i]):
                    if i//2-j//2 < 3:
                        require(not keys[a]&keys[b],f"Variety failure {diet} {i} {j}")
            return {"dietary_pattern":diet,"recipe_ids":chosen,"distinct_recipes":len(set(chosen)),
                    "assumption":"Listed ingredient forms and required product-label conditions are satisfied.",
                    "method":"content feasibility probe, not a production planner or nutritionally balanced prescription"}
    raise ValueError(f"No seven-day starter feasibility plan found for {diet}")


def validate(workbook=None):
    ingredients=json.loads((PACK/"ingredients.json").read_text())["ingredients"]
    recipes=json.loads((PACK/"recipes.json").read_text())["recipes"]
    rules=json.loads((PACK/"substitutions.json").read_text())["rules"]
    manifest=json.loads((PACK/"source-manifest.json").read_text())
    snapshot=json.loads((PACK/"cofid-source-rows.json").read_text())
    safety={n["id"]:n for n in json.loads((PACK/"safety-notes.json").read_text())["notes"]}
    require(all(n.get("en") and n.get("es") and n.get("source_urls") for n in safety.values()),"Incomplete common preparation note")
    foods={x["id"]:x for x in ingredients}; by_id={x["id"]:x for x in recipes}
    require(len(foods)==len(ingredients),"Duplicate ingredient ID")
    require(len(by_id)==len(recipes),"Duplicate recipe ID")
    require(40<=len(recipes)<=50,"Starter recipe count outside agreed range")
    require(manifest["source"]["sha256"]==SHA256==snapshot["workbook_sha256"],"Source fingerprint mismatch")
    source=read_workbook(workbook) if workbook else None
    energy_qualifiers=[]
    for f in ingredients:
        code=f["source"]["food_code"]
        require(code in snapshot["rows"],"Missing raw source row "+code)
        p=snapshot["rows"][code]["proximates"]; facts=snapshot["rows"][code]["factors"]
        if source:
            require(p==source["1.3 Proximates"][code],"Source proximates changed "+code)
            require(facts==source["1.2 Factors"][code],"Source factors changed "+code)
        require(p["cells"]["B"]==facts["cells"]["B"]==f["source"]["original_name"],"Source-name mismatch "+code)
        require(f["source"]["energy_cell"]==f"M{p['row']}","Source cell mismatch "+code)
        raw=p["cells"]["M"]
        require(numeric(raw) is not None,"Unknown kcal imported "+code)
        require(D(f["nutrition_per_100g"]["energy_kcal"])==D(numeric(raw)),"Energy mismatch "+code)
        require(f["name"]["en"] and f["name"]["es"],"Missing ingredient language")
        for field,column in [("protein_g","J"),("fat_g","K"),("carbohydrate_g","L"),("fibre_aoac_g","Z")]:
            require(f["nutrition_per_100g"][field]==numeric(p["cells"].get(column)),"Nutrient qualifier/value lost "+code)
        units={c["unit"] for c in f["conversions"]}
        require(len(units)==len(f["conversions"]) and {"g","kg"}<=units,"Invalid unit list "+code)
        for c in f["conversions"]:
            require(D(c["grams_per_unit"])>0,"Nonpositive conversion")
            if c["unit"] in {"ml","metric_tsp","metric_tbsp"}:
                factor={"ml":1,"metric_tsp":5,"metric_tbsp":15}[c["unit"]]
                require(numeric(facts["cells"].get("I")) is not None,"Unsupported density conversion")
                require(abs(D(c["grams_per_unit"])-D(facts["cells"]["I"])*factor)<D("0.000001"),"Unsupported density conversion")
        if "reference_piece_conversion" in f:
            require("requires_household_confirmation" in f["reference_piece_conversion"]["status"],"Piece assumption hidden")
            require(f["reference_piece_conversion"]["unit"] not in units,"Unconfirmed piece unit active")
        if "purchase_yield_reference" in f:
            y=f["purchase_yield_reference"];row=snapshot["rows"][y["source_food_code"]]["factors"]
            require(D(y["edible_fraction"])==D(row["cells"]["H"]),"Purchase factor mismatch")
            if source:
                require(row==source["1.2 Factors"][y["source_food_code"]],"Source purchase factor changed")
    with (PACK/"ingredients.csv").open(newline="",encoding="utf-8") as handle:
        csv_rows=list(csv.DictReader(handle))
    require(len(csv_rows)==len(ingredients),"Ingredient CSV row count")
    for row in csv_rows:
        f=foods[row["id"]]
        require(row["name_es"]==f["name"]["es"] and row["source_food_code"]==f["source"]["food_code"],"CSV identity mismatch")
        require(D(row["kcal_per_100g"])==D(f["nutrition_per_100g"]["energy_kcal"]),"CSV energy mismatch")
    # Independently inspected source cells catch wrong energy-column selection.
    for identifier,kcal in {"olive_oil":899,"rice_white":351,"egg":131,"milk":46,"chicken":106,"tofu":73}.items():
        require(D(foods[identifier]["nutrition_per_100g"]["energy_kcal"])==kcal,"Source spot check "+identifier)
    refs=Counter(); main_classes=Counter(); scaled_warning_count=0; zero_review_count=0
    for r in recipes:
        require(r["reference_servings"]==1,"Unexpected serving basis")
        require(r["name"]["en"] and r["name"]["es"],"Missing recipe language")
        require(not r["provenance"]["copied_recipe_text"],"Missing original-content declaration")
        ids=[c["id"] for c in r["components"]]
        require(len(ids)==len(set(ids)) and "main" in ids,"Duplicate/missing component")
        all_lines=[];base_lines=[];classes=set();base_classes=set()
        for c in r["components"]:
            require(c["kind"] in {"main","side","dessert"},"Invalid group")
            require(c["optional"]==(c["kind"]=="dessert"),"Optional component ambiguity")
            if c["optional"]:require(not c["default_included"],"Dessert enabled globally")
            require(c["instructions"] and all(s.get("en") and s.get("es") and s["en"]!=s["es"] for s in c["instructions"]),"Missing bilingual method")
            cclasses=set();keys=set()
            for line in c["ingredients"]:
                require(line["ingredient_id"] in foods,"Unknown ingredient "+str(line))
                require(D(line["quantity"])>0,"Invalid ingredient quantity")
                f=foods[line["ingredient_id"]];cclasses.add(f["food_class"]);refs[f["id"]]+=1
                require(line["variety_role"] in {"main","base","support"},"Unknown variety role")
                if line["variety_role"] in {"main","base"}:keys.add(f["variety_key"])
            calculated=energy(c["ingredients"],foods)
            require(calculated==D(c["reference_energy_kcal_exact"]),"Component calorie mismatch "+r["id"])
            require(abs(calculated-D(c["reference_energy_kcal"]))<=D("0.005"),"Display calorie mismatch")
            require(set(c["dietary_patterns"])==expected_patterns(cclasses),"Component dietary mismatch")
            require(set(c["variety_keys"])==keys,"Variety metadata mismatch")
            all_lines+=c["ingredients"];classes|=cclasses
            if not c["optional"]:base_lines+=c["ingredients"];base_classes|=cclasses
        for variant,lines,cs in [("without_optional_dessert",base_lines,base_classes),("with_optional_dessert",all_lines,classes)]:
            total=energy(lines,foods)
            require(total>0,"Zero calorie scaling denominator")
            require(total==D(r["reference_energy_kcal_exact"][variant]),"Total calorie mismatch "+r["id"])
            require(set(r["dietary_patterns"][variant])==expected_patterns(cs),"Recipe dietary mismatch")
            required_labels={l["ingredient_id"] for l in lines if "dietary_label_condition" in foods[l["ingredient_id"]]}
            require(required_labels=={l["ingredient_id"] for l in r["dietary_label_checks"][variant]},"Missing product-label condition")
            # Data probes at two budgets verify representable quantities and document overshoot.
            for budget in [D(400),D(600)]:
                factor=budget/total; rounded=[]
                for line in lines:
                    q=D(line["quantity"])*factor;step=D(10) if q>=10 else D(1)
                    q=(q/step).quantize(D(1),rounding=ROUND_HALF_UP)*step
                    if q==0:zero_review_count+=1
                    rounded.append({**line,"quantity":str(q)})
                if energy(rounded,foods)>budget:scaled_warning_count+=1
        if r["meal_types"]==["lunch","dinner"]:
            main_classes.update(r["dietary_patterns"]["without_optional_dessert"])
            require(any(c["kind"]=="dessert" for c in r["components"]),"Missing optional dessert support")
        dry_ids={l["ingredient_id"] for l in all_lines if foods[l["ingredient_id"]]["preparation"]}
        require(dry_ids=={p["ingredient_id"] for p in r["ingredient_preparation"]},"Missing dry-weight preparation")
        require(all(p["mode"] in {"within_main_method","separate_before_finishing"} for p in r["ingredient_preparation"]),"Ambiguous preparation timing")
        require(r["finishing_times_exclude_soaking_and_prerequisite_cooking"],"Soak/cook time hidden")
        require(set(r["safety_note_ids"])<=set(safety),"Unresolved preparation note")
        if any(foods[l["ingredient_id"]]["food_class"] in {"meat","fish","shellfish","egg"} and foods[l["ingredient_id"]]["state"]=="raw_edible" for l in all_lines):
            require("cook_thoroughly" in r["safety_note_ids"],"Missing animal cooking instruction")
    require(len({x["id"] for x in rules})==len(rules),"Duplicate swap ID")
    for rule in rules:
        require(rule["from_ingredient_id"] in foods and rule["to_ingredient_id"] in foods,"Swap reference missing")
        require(rule["requires_review"] and rule["recalculate_calories_and_portions"],"Swap bypasses review")
        require(D(rule["initial_target_grams_per_source_gram"])>0,"Invalid swap ratio")
        require(rule["instruction_override"].get("en") and rule["instruction_override"].get("es"),"Missing swap methods")
        for identifier in rule["allowed_recipe_ids"]:
            require(identifier in by_id,"Unknown swap recipe")
            require(any(l["ingredient_id"]==rule["from_ingredient_id"] for c in by_id[identifier]["components"] for l in c["ingredients"]),"Swap source absent in "+identifier)
    for gap in manifest["coverage"]["excluded_unknown_energy_spices"]:
        require(gap["energy_source_value"]=="N","Gap incorrectly described")
        require(gap["food_code"] not in {f["source"]["food_code"] for f in ingredients},"Unknown energy food activated")
    for sheet,conflicts in manifest["coverage"]["excluded_ambiguous_source_codes"].items():
        for code,rows in conflicts.items():
            require(code not in {f["source"]["food_code"] for f in ingredients},"Ambiguous source code activated")
            if source:
                require(rows==[{"row":r["row"],"name":r["cells"]["B"]} for r in source["_ambiguous_rows"][sheet][code]],"Source collision not preserved")
    for path in [*ROOT.glob("*.md"),*(ROOT/"docs").glob("*.md"),*PACK.glob("*.md")]:
        for target in re.findall(r"\]\(([^)]+)\)",path.read_text()):
            if target.startswith(("https:","http:","#")):continue
            require((path.parent/target.split("#")[0]).exists(),"Broken local document link: "+str(path)+" -> "+target)
    report={"status":"passed","validation_scope":"source/data/translation-presence and calculation consistency; not kitchen or application tests",
      "source_verified_against_full_workbook":bool(source),"workbook_sha256":SHA256,
      "counts":{"ingredients":len(ingredients),"recipes":len(recipes),"breakfasts":sum(r["meal_types"]==["breakfast"] for r in recipes),
                "lunch_dinner_options":sum(r["meal_types"]==["lunch","dinner"] for r in recipes),"substitutions":len(rules)},
      "main_recipes_by_intended_base_pattern":dict(main_classes),
      "seven_day_variety_feasibility":[trial_menu(recipes,p) for p in ["omnivore","vegetarian","vegan"]],
      "portion_rounding_probes":{"budgets_kcal":[400,600],"variants_per_recipe":2,"over_budget_cases_requiring_normal_warning":scaled_warning_count,
                                 "rounded_zero_lines_requiring_explicit_review":zero_review_count},
      "catalogue_extras_not_used_in_reference_recipes":sorted(set(foods)-set(refs)),
      "artifact_sha256":{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(PACK.iterdir()) if p.is_file() and p.name!="validation-report.json"},
      "limitations":["Recipes have not been kitchen-tested.","Product labels and source-specific ingredient forms must match before household use.",
                    "Diet flags describe intended ingredients, not allergen certification.","Reference egg/slice weights require confirmation; raw edible grams remain authoritative.",
                    "No live app, database import, household targets, or production meal generator was tested."]}
    (PACK/"validation-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return report


def self_check(workbook):
    """Fault-inject malformed content copies; never mutate the published pack."""
    global PACK
    original=PACK
    cases=[
      ("changed_source_energy","ingredients.json",lambda d:d["ingredients"][0]["nutrition_per_100g"].update(energy_kcal=999),"Energy mismatch"),
      ("missing_translation","recipes.json",lambda d:d["recipes"][0]["name"].update(es=""),"Missing recipe language"),
      ("unresolved_ingredient","recipes.json",lambda d:d["recipes"][0]["components"][0]["ingredients"][0].update(ingredient_id="missing-food"),"Unknown ingredient"),
      ("invented_density","ingredients.json",lambda d:next(f for f in d["ingredients"] if f["id"]=="olive_oil")["conversions"].append({"unit":"ml","grams_per_unit":1}),"Unsupported density conversion"),
      ("unreviewed_substitution","substitutions.json",lambda d:d["rules"][0].update(requires_review=False),"Swap bypasses review"),
      ("globally_enabled_dessert","recipes.json",lambda d:next(c for r in d["recipes"] for c in r["components"] if c["kind"]=="dessert").update(default_included=True),"Dessert enabled globally"),
      ("wrong_source_fingerprint","source-manifest.json",lambda d:d["source"].update(sha256="0"*64),"Source fingerprint mismatch"),
    ]
    outcomes=[]
    try:
        with tempfile.TemporaryDirectory(prefix="week-menu-content-") as temporary:
            for label,file,mutate,expected in cases:
                destination=Path(temporary)/label
                shutil.copytree(original,destination);PACK=destination
                value=json.loads((PACK/file).read_text());mutate(value)
                (PACK/file).write_text(json.dumps(value,ensure_ascii=False))
                try:
                    validate(workbook)
                except ValueError as error:
                    require(expected in str(error),label+" failed for an unrelated reason: "+str(error))
                    outcomes.append({"case":label,"result":"rejected_as_expected"})
                else:
                    raise ValueError("Invalid fixture was accepted: "+label)
    finally:
        PACK=original
    report=json.loads((PACK/"validation-report.json").read_text())
    report["negative_fault_injection_checks"]=outcomes
    (PACK/"validation-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"negative_fault_injection_checks":outcomes},indent=2))


if __name__=="__main__":
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--workbook",type=Path)
    p.add_argument("--self-check",action="store_true")
    args=p.parse_args();validate(args.workbook)
    if args.self_check:self_check(args.workbook)
