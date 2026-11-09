-- Warning comparisons use displayed whole kcal; calculated/stored values stay exact.
begin;
do $migration$
declare definition text;pattern text;matches integer;begin
 definition:=pg_get_functiondef('app_private.checked_portion_v2(jsonb,boolean)'::regprocedure);
 pattern:='if[[:space:]]+total[[:space:]]*>[[:space:]]*\(p->>''budget''\)::numeric[[:space:]]+then';
 select count(*) into matches from regexp_matches(definition,pattern,'gi');
 if matches<>1 then raise exception 'calorie_warning_definition_mismatch: checked_portion_v2 (matches %)',matches;end if;
 execute regexp_replace(definition,pattern,'if round(total)>round((p->>''budget'')::numeric) then','i');
 definition:=pg_get_functiondef('app_private.historical_portion(jsonb,jsonb,date,text)'::regprocedure);
 pattern:='if[[:space:]]+total[[:space:]]*>[[:space:]]*budget[[:space:]]+then';
 select count(*) into matches from regexp_matches(definition,pattern,'gi');
 if matches<>1 then raise exception 'calorie_warning_definition_mismatch: historical_portion (matches %)',matches;end if;
 execute regexp_replace(definition,pattern,'if round(total)>round(budget) then','i');
end$migration$;
notify pgrst,'reload schema';
commit;
