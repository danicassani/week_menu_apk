"""Build the sourced November recipe expansion from reviewed inputs and pinned CoFID.

Usage: python tools/recipe_expansion/build.py --workbook /path/to/cofid.xlsx
No network access, database writes or changes to the original starter release files.
"""
import argparse
import json
import subprocess
import sys
from decimal import Decimal
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/starter_content'))
from cofid import read_workbook, numeric, SHA256, PAGE

def build(workbook):
    rows = read_workbook(workbook)
    inputs = json.loads((ROOT/'tools/recipe_expansion/inputs.json').read_text())
    base = json.loads((ROOT/'content/starter/ingredients.json').read_text())['ingredients']
    ingredients, evidence = [], {}
    for spec in inputs['ingredients']:
        f = dict(spec)
        code = f.pop('cofid_code', None)
        if code:
            row = rows['1.3 Proximates'][code]
            cells = row['cells']
            energy = numeric(cells.get('M'))
            if energy is None: raise ValueError(f'Unknown energy: {code}')
            f['nutrition_per_100g'] = {'energy_kcal': energy}
            f['source'] = {'dataset':'cofid_2021','url':PAGE,'workbook_sha256':SHA256,'food_code':code,'original_name':cells['B'],'proximates_row':row['row'],'energy_cell':f"M{row['row']}",'raw_energy_value':cells['M']}
            evidence[code] = {'proximates':row,'factors':rows['1.2 Factors'][code]}
        f.setdefault('quantity_basis','edible_reference_weight')
        f.setdefault('shopping_policy','include')
        f.setdefault('default_unit','g')
        f.setdefault('conversions',[{'unit':'g','grams_per_unit':1},{'unit':'kg','grams_per_unit':1000}])
        if f['nutrition_per_100g']['energy_kcal'] is None: raise ValueError('Missing energy')
        ingredients.append(f)
    foods = {f['id']:f for f in base + ingredients}
    assert len(foods) == len(base) + len(ingredients), 'Ingredient ID collision'
    recipes = inputs['recipes']
    for recipe in recipes:
        assert recipe['source_recipe']['url'].startswith('https://')
        total = Decimal(0)
        for component in recipe['components']:
            energy = Decimal(0)
            for line in component['ingredients']:
                assert line['quantity'] > 0 and line['unit']=='g'
                f = foods[line['ingredient_id']]
                energy += Decimal(str(line['quantity'])) * Decimal(str(f['nutrition_per_100g']['energy_kcal'])) / 100
            component['reference_energy_kcal'] = float(energy.quantize(Decimal('.01')))
            total += energy
        recipe['reference_energy_kcal'] = {'without_optional_dessert':float(total.quantize(Decimal('.01'))),'with_optional_dessert':float(total.quantize(Decimal('.01')))}
        recipe['provenance'] = {'kind':'sourced_recipe_with_paraphrased_method','copied_recipe_text':False}
        recipe['review_status'] = 'source_verified_and_desk_validated_not_kitchen_tested'
    pack = {'schema_version':'1.0.0','release':'2026-11','expansion':'requested-2026-11-08','ingredients':ingredients,'recipes':recipes}
    dest = ROOT/'content/expansions';dest.mkdir(exist_ok=True)
    (dest/'requested-recipes.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
    (dest/'requested-cofid-rows.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
    sql = ["-- Add sourced recipes to the common catalogue without replacing household content.","-- Apply after migration 21. Nutrition/source provenance stays attached to each entry.","begin;"]
    sql.append((ROOT/'tools/recipe_expansion/rounding.sql').read_text().strip())
    q = lambda s: "'"+s.replace("'","''")+"'"
    for kind,items in [('ingredient',ingredients),('recipe',recipes)]:
        for item in items:
            sql.append(f"insert into app_private.starter_content(release,kind,id,data) values('2026-11',{q(kind)},{q(item['id'])},{q(json.dumps(item,ensure_ascii=False))}::jsonb) on conflict(release,kind,id) do nothing;")
    # Same household-safe revision mechanism used by ordinary catalogue writes.
    sql += ['update public.household_revision set revision=revision+1;',"notify pgrst,'reload schema';",'commit;']
    (ROOT/'supabase/migrations/202611080022_sourced_recipes.sql').write_text('\n'.join(sql)+'\n')
    subprocess.run(['npx','prettier','--write',str(dest/'requested-recipes.json'),str(dest/'requested-cofid-rows.json')],check=True,cwd=ROOT,stdout=subprocess.DEVNULL)
    print(f'{len(recipes)} sourced recipes, {len(ingredients)} new ingredients; {len(evidence)} CoFID rows verified')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--workbook',type=Path,required=True)
    build(parser.parse_args().workbook)
