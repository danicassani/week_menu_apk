-- Remove ingredient repetition constraints while preserving existing content and history.
begin;
do $migration$declare definition text; old_text text; new_text text;begin
 definition:=pg_get_functiondef('app_private.api_apply_plans(jsonb,bigint,boolean)'::regprocedure);
 old_text:=$patch$  if t<>'breakfast' and exists(
   select 1 from public.meal_plans other cross join lateral jsonb_array_elements(other.data->'portions') op cross join lateral jsonb_array_elements(parts) np
   where other.meal_type<>'breakfast' and not(other.day=d and other.meal_type=t) and abs(other.day-d)<span
   and op->>'member_id'=np->>'member_id' and op->>'eating_out'<>'true' and np->>'eating_out'<>'true'
   and exists(select 1 from jsonb_array_elements_text(op->'variety_keys') k where (np->'variety_keys') ? k)
  ) then raise exception 'variety_conflict';end if;$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: api_apply_plans(jsonb,bigint,boolean)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$patch$ select variety_days into span from public.household where id;$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: api_apply_plans(jsonb,bigint,boolean)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
 definition:=pg_get_functiondef('app_private.api_transfer_preview(uuid,uuid,jsonb)'::regprocedure);
 old_text:=$patch$ select variety_days into span from public.household where id;
 if exists(
  with final as (select data from public.meal_plans x where not exists(select 1 from jsonb_array_elements(working) w where (w->>'day')::date=x.day and w->>'type'=x.meal_type)
   union all select value from jsonb_array_elements(working))
  select 1 from jsonb_array_elements(working) n cross join final f cross join lateral jsonb_array_elements(n->'portions') np cross join lateral jsonb_array_elements(f.data->'portions') op
  where n->>'type'<>'breakfast' and f.data->>'type'<>'breakfast' and not(n->>'day'=f.data->>'day' and n->>'type'=f.data->>'type') and abs((n->>'day')::date-(f.data->>'day')::date)<span
   and np->>'member_id'=op->>'member_id' and np->>'eating_out'<>'true' and op->>'eating_out'<>'true' and exists(select 1 from jsonb_array_elements_text(np->'variety_keys') k where (op->'variety_keys') ? k)
 ) then raise exception 'variety_conflict';end if;$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: api_transfer_preview(uuid,uuid,jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
 definition:=pg_get_functiondef('app_private.validate_food(jsonb)'::regprocedure);
 old_text:=$patch$ or coalesce(p->>'variety_key','')=''$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: validate_food(jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
 definition:=pg_get_functiondef('app_private.validate_recipe(jsonb)'::regprocedure);
 old_text:=$patch$ or coalesce(l->>'variety_role','') not in('main','base','support')$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: validate_recipe(jsonb)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
 definition:=pg_get_functiondef('app_private.checked_portion_v2(jsonb,boolean)'::regprocedure);
 old_text:=$patch$select value->>'variety_role' into role$patch$;new_text:=$patch$select value->>'ingredient_id' into role$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: checked_portion_v2(jsonb,boolean)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$patch$  l:=l||jsonb_build_object('variety_role',role);$patch$;new_text:=$patch$  l:=l-'variety_role'-'variety_key';$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: checked_portion_v2(jsonb,boolean)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$patch$  if coalesce(l->>'variety_role','') not in('main','base','support') then raise exception 'invalid_recipe';end if;$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: checked_portion_v2(jsonb,boolean)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$patch$ select coalesce(jsonb_agg(distinct value->'variety_key'),'[]') into vkeys from jsonb_array_elements(outlines) where value->>'variety_role' in('main','base');$patch$;new_text:=$patch$ vkeys:='[]'::jsonb;$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: checked_portion_v2(jsonb,boolean)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$patch$,'variety_key',f->>'variety_key'$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: checked_portion_v2(jsonb,boolean)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
 definition:=pg_get_functiondef('app_private.historical_portion(jsonb,jsonb,date,text)'::regprocedure);
 old_text:=$patch$select value->>'variety_role' into role$patch$;new_text:=$patch$select value->>'ingredient_id' into role$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: historical_portion(jsonb,jsonb,date,text)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$patch$'variety_role',role,$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: historical_portion(jsonb,jsonb,date,text)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$patch$'variety_key',f->>'variety_key',$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: historical_portion(jsonb,jsonb,date,text)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$patch$ select coalesce(jsonb_agg(distinct value->'variety_key'),'[]') into keys from jsonb_array_elements(lines) where value->>'variety_role' in('main','base');$patch$;new_text:=$patch$ keys:='[]'::jsonb;$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: historical_portion(jsonb,jsonb,date,text)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
 definition:=pg_get_functiondef('app_private.transfer_portion(text,uuid,date,text,boolean)'::regprocedure);
 old_text:=$patch$,'variety_role',l->>'variety_role'$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: transfer_portion(text,uuid,date,text,boolean)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
 definition:=pg_get_functiondef('app_private.api_planner_settings(integer,integer)'::regprocedure);
 old_text:=$patch$week_start not in(0,1) or variety_days not between 1 and 14$patch$;new_text:=$patch$week_start is null or week_start not in(0,1)$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: api_planner_settings(integer,integer)';end if;
 definition:=replace(definition,old_text,new_text);
 old_text:=$patch$,variety_days=api_planner_settings.variety_days$patch$;new_text:=$patch$$patch$;
 if position(old_text in definition)=0 then raise exception 'remove_variety_definition_mismatch: api_planner_settings(integer,integer)';end if;
 definition:=replace(definition,old_text,new_text);
 execute definition;
end$migration$;
notify pgrst,'reload schema';
commit;
