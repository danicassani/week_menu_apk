"""Rebuild the idempotent starter-food insert migration from reviewed JSON."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def sql_string(value):
    return "'" + value.replace("'", "''") + "'"

lines = ["-- Reviewed UK CoFID starter pack; source attribution stays attached to every item."]
for filename, table, key in [
    ("ingredients.json", "food_items", "ingredients"),
    ("recipes.json", "saved_recipes", "recipes"),
    ("substitutions.json", "substitution_rules", "rules"),
]:
    source = json.loads((ROOT / "content/starter" / filename).read_text())
    for item in source[key]:
        document = sql_string(json.dumps(item, ensure_ascii=False))
        lines.append(f"insert into public.{table}(id,data) values({sql_string(item['id'])},{document}::jsonb) on conflict(id) do nothing;")
(ROOT / "supabase/migrations/202611030004_starter_food.sql").write_text("\n".join(lines) + "\n")
