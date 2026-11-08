"""Generate additive repair 23; leave already published migration 21 unchanged."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[2]
s=(ROOT/'supabase/migrations/202611080021_remove_variety.sql').read_text()
s=s.replace('-- Remove ingredient repetition constraints while preserving existing content and history.','-- Repair migration 21 on installations whose SQL function bodies have different SQL whitespace.\n-- Safe after migration 22; preserves its small-weight rounding and all existing records.')
s=s.replace('do $migration$declare definition text; old_text text; new_text text;begin', '''do $migration$declare definition text; old_text text; new_text text; pattern text; matched_text text; ch text; quoted text; in_gap boolean; match_count integer; patch_index integer:=0;begin
 -- Complete installations need no rewrite. This also makes the repair repeatable.
 if position('variety_conflict' in pg_get_functiondef('app_private.api_apply_plans(jsonb,bigint,boolean)'::regprocedure))=0
 and position('variety_conflict' in pg_get_functiondef('app_private.api_transfer_preview(uuid,uuid,jsonb)'::regprocedure))=0
 and position('select value->>''ingredient_id'' into role' in pg_get_functiondef('app_private.checked_portion_v2(jsonb,boolean)'::regprocedure))>0
 and position('variety_key' in pg_get_functiondef('app_private.validate_food(jsonb)'::regprocedure))=0
 and position('variety_role' in pg_get_functiondef('app_private.validate_recipe(jsonb)'::regprocedure))=0
 and position('select value->>''ingredient_id'' into role' in pg_get_functiondef('app_private.historical_portion(jsonb,jsonb,date,text)'::regprocedure))>0
 and position('variety_role' in pg_get_functiondef('app_private.transfer_portion(text,uuid,date,text,boolean)'::regprocedure))=0
 and position(',variety_days=api_planner_settings.variety_days' in pg_get_functiondef('app_private.api_planner_settings(integer,integer)'::regprocedure))=0
 then return;end if;''')
def replace(m):
    sig=m.group(1)
    return ''' -- Allow SQL whitespace differences, preserving quoted values and exact tokens.
 old_text:=ltrim(old_text,chr(9)||chr(10)||chr(13)||' ');
 pattern:='';quoted:='';in_gap:=false;patch_index:=patch_index+1;
 foreach ch in array regexp_split_to_array(old_text,'') loop
  if quoted='' and ch~'^[[:space:]]$' then
   if not in_gap then pattern:=pattern||'[[:space:]]+';end if;
   in_gap:=true;continue;
  end if;
  in_gap:=false;
  if quoted='' and ch in(chr(39),chr(34)) then quoted:=ch;
  elsif ch=quoted then quoted:='';end if;
  if position(ch in '\\.^$|()[]{}*+?')>0 then pattern:=pattern||chr(92)||ch;
  else pattern:=pattern||ch;end if;
 end loop;
 select count(*) into match_count from regexp_matches(definition,pattern,'g');
 if match_count<>1 then raise exception 'variety_repair_definition_mismatch: '''+sig+''' (patch %, matches %)',patch_index,match_count;end if;
 matched_text:=substring(definition from pattern);
 definition:=replace(definition,matched_text,new_text);'''
s,n=re.subn(r" if position\(old_text in definition\)=0 then raise exception 'remove_variety_definition_mismatch: ([^']+)';end if;\n definition:=replace\(definition,old_text,new_text\);",replace,s)
assert n==17,n
(ROOT/'supabase/migrations/202611080023_variety_compatibility_repair.sql').write_text(s)
print(f'Generated repair with {n} guarded patches')
