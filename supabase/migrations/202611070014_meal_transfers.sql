-- V3 milestone 2: server-built, reviewed endpoint transfers. No client nutrition
-- or arbitrary meal batch is trusted by these APIs.
begin;
grant create on schema app_private to week_menu_executor;
create function app_private.transfer_portion(rid text,uid uuid,d date,t text,wants_dessert boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare recipe jsonb; rev integer; profile jsonb; budget numeric; c jsonb; l jsonb; f jsonb; original jsonb; cv jsonb; rule jsonb;
 raw jsonb:='[]'; lines jsonb:='[]'; subs jsonb:='[]'; quantity numeric; unit text; energy numeric; total numeric:=0; factor numeric; step numeric; scaled numeric; item jsonb;
begin
 select app_private.effective_profile(id) into profile from public.members where id=uid and status='active' and onboarded;
 if profile is null then raise exception 'invalid_member';end if;
 select data,revision into recipe,rev from app_private.resolved_saved_recipes where id=rid and not archived;
 if recipe is null or not (recipe->'meal_types') ? t then raise exception 'archived_ingredient';end if;
 recipe:=recipe||jsonb_build_object('revision',rev,'archived',false);
 budget:=coalesce((select kcal from public.budget_overrides where member_id=uid and day=d and meal_type=t),
  (select (budgets->>t)::numeric from public.targets where member_id=uid and effective_date<=d order by effective_date desc,created_at desc,id desc limit 1));
 if budget is null or budget<=0 then raise exception 'invalid_budgets';end if;
 for c in select value from jsonb_array_elements(recipe->'components') loop
  if coalesce((c->>'optional')::boolean,false) and not coalesce(case when c->>'kind'='dessert' then wants_dessert else (c->>'default_included')::boolean end,false) then continue;end if;
  for l in select value from jsonb_array_elements(c->'ingredients') loop
   select data into f from app_private.resolved_food_items where id=l->>'ingredient_id' and not archived;
   if f is null then raise exception 'archived_ingredient';end if;
   quantity:=(l->>'quantity')::numeric;unit:=l->>'unit';
   select value into cv from jsonb_array_elements(f->'conversions') where value->>'unit'=unit;
   if cv is null then raise exception 'missing_conversion';end if;
   if not (f->'dietary_patterns') ? (profile->>'diet') or coalesce(profile->'excluded_ingredients','[]') ? (f->>'id') then
    original:=f;
    select r.data into rule from app_private.resolved_substitution_rules r join app_private.resolved_food_items dest on dest.id=r.data->>'to_ingredient_id' and not dest.archived
     where r.data->>'from_ingredient_id'=f->>'id' and (r.data->'allowed_recipe_ids') ? rid
      and (dest.data->'dietary_patterns') ? (profile->>'diet') and not coalesce(profile->'excluded_ingredients','[]') ? dest.id order by r.id limit 1;
    if rule is null then raise exception 'no_suitable_recipe';end if;
    quantity:=quantity*(cv->>'grams_per_unit')::numeric*(rule->>'initial_target_grams_per_source_gram')::numeric;unit:='g';
    select data into f from app_private.resolved_food_items where id=rule->>'to_ingredient_id' and not archived;
    select value into cv from jsonb_array_elements(f->'conversions') where value->>'unit'=unit;
    if cv is null then raise exception 'missing_conversion';end if;
    subs:=subs||jsonb_build_array(jsonb_build_object('from',original->>'id','to',f->>'id','instructions',rule->'instruction_override'));
   end if;
   energy:=(f->'nutrition_per_100g'->>'energy_kcal')::numeric;
   if energy is null or energy<0 then raise exception 'missing_nutrition';end if;
   total:=total+quantity*(cv->>'grams_per_unit')::numeric*energy/100;
   raw:=raw||jsonb_build_array(jsonb_build_object('ingredient_id',f->>'id','component_id',c->>'id','quantity',quantity,'unit',unit,'variety_role',l->>'variety_role','conversion',cv));
  end loop;
 end loop;
 if total<=0 then raise exception 'missing_nutrition';end if;factor:=budget/total;
 for item in select value from jsonb_array_elements(raw) loop
  scaled:=(item->>'quantity')::numeric*factor;unit:=item->>'unit';
  if unit in('kg','l') then
   scaled:=scaled*1000;step:=case when scaled>=10 then 10 else 1 end;quantity:=round(scaled/step)*step/1000;
  else
   step:=case when unit in('g','ml') then case when scaled>=10 then 10 else 1 end else coalesce((item->'conversion'->>'quantity_step')::numeric,1) end;
   if step<=0 then raise exception 'invalid_quantity';end if;quantity:=round(scaled/step)*step;
  end if;
  if quantity<=0 then raise exception 'quantity_needs_review';end if;
  lines:=lines||jsonb_build_array((item-'conversion')||jsonb_build_object('quantity',quantity));
 end loop;
 return app_private.checked_portion(jsonb_build_object('member_id',uid,'recipe_id',rid,'recipe_snapshot',recipe,'name',recipe->'name','budget',budget,'dessert',wants_dessert,'eating_out',false,'lines',lines,'substitutions',subs));
end$$;

create function app_private.transfer_guard(ep jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare d date;begin
 if ep is null or jsonb_typeof(ep)<>'object' or coalesce(ep->>'type','') not in('breakfast','lunch','dinner') then raise exception 'invalid_recipe';end if;
 d:=(ep->>'day')::date;if d is null or not isfinite(d) then raise exception 'day_closed';end if;
 perform app_private.guard_meal_day(d);
 if ep->>'type'='breakfast' then
  if not exists(select 1 from public.members where id=(ep->>'member_id')::uuid and status='active' and onboarded) then raise exception 'invalid_member';end if;
 elsif ep->>'member_id' is not null then raise exception 'invalid_member';end if;
end$$;
create function app_private.transfer_occupied(plan jsonb,ep jsonb) returns boolean
language sql set search_path='' as $$
 select plan is not null and case when ep->>'type'='breakfast' then exists(select 1 from jsonb_array_elements(coalesce(plan->'portions','[]')) where value->>'member_id'=ep->>'member_id') else jsonb_array_length(coalesce(plan->'portions','[]'))>0 end
$$;
create function app_private.transfer_choice(plan jsonb,ep jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare portions jsonb; rid text; rev integer; desserts jsonb;begin
 select coalesce(jsonb_agg(value),'[]') into portions from jsonb_array_elements(coalesce(plan->'portions','[]')) where ep->>'type'<>'breakfast' or value->>'member_id'=ep->>'member_id';
 if ep->>'type'='breakfast' then rid:=coalesce(portions->0->>'recipe_id',portions->0->>'underlying_recipe_id');
 else rid:=coalesce(plan->>'shared_recipe_id',(select coalesce(value->>'recipe_id',value->>'underlying_recipe_id') from jsonb_array_elements(portions) where coalesce(value->>'recipe_id',value->>'underlying_recipe_id') is not null limit 1));end if;
 select revision into rev from app_private.resolved_saved_recipes where id=rid and not archived;
 if rev is null then raise exception 'no_suitable_recipe';end if;
 select coalesce(jsonb_object_agg(value->>'member_id',coalesce(value->'dessert','false')),'{}') into desserts from jsonb_array_elements(portions);
 return jsonb_build_object('recipe_id',rid,'revision',rev,'desserts',desserts);
end$$;
create function app_private.transfer_patch(working jsonb,ep jsonb,choice jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan jsonb; portions jsonb; recipe jsonb; rev integer; member record; p jsonb; dessert boolean;begin
 select value into plan from jsonb_array_elements(working) where value->>'day'=ep->>'day' and value->>'type'=ep->>'type';
 if choice is null then
  select coalesce(jsonb_agg(value order by ordinal),'[]') into portions from jsonb_array_elements(plan->'portions') with ordinality a(value,ordinal) where ep->>'type'='breakfast' and value->>'member_id'<>ep->>'member_id';
 else
  select data,revision into recipe,rev from app_private.resolved_saved_recipes where id=choice->>'recipe_id' and not archived;
  if recipe is null or not (recipe->'meal_types') ? (ep->>'type') then raise exception 'archived_ingredient';end if;
  if rev is distinct from (choice->>'revision')::integer then raise exception 'stale_content';end if;
  if jsonb_typeof(choice->'desserts') is distinct from 'object' or exists(select 1 from jsonb_each(choice->'desserts') where jsonb_typeof(value)<>'boolean') then raise exception 'invalid_recipe';end if;
  portions:='[]';
  for member in select id from public.members where status='active' and onboarded and (ep->>'type'<>'breakfast' or id=(ep->>'member_id')::uuid) order by joined_at,id loop
   dessert:=coalesce((choice->'desserts'->>member.id::text)::boolean,exists(select 1 from jsonb_array_elements(recipe->'components') where value->>'kind'='dessert' and (value->>'optional')::boolean and (value->>'default_included')::boolean));
   p:=app_private.transfer_portion(choice->>'recipe_id',member.id,(ep->>'day')::date,ep->>'type',dessert);
   portions:=portions||jsonb_build_array(p);
  end loop;
  if jsonb_array_length(portions)=0 then raise exception 'invalid_member';end if;
  if ep->>'type'='breakfast' then
   p:=portions->0;
   select coalesce(jsonb_agg(case when value->>'member_id'=ep->>'member_id' then p else value end order by ordinal),'[]') into portions from jsonb_array_elements(plan->'portions') with ordinality a(value,ordinal);
   if not exists(select 1 from jsonb_array_elements(portions) where value->>'member_id'=ep->>'member_id') then portions:=portions||jsonb_build_array(p);end if;
  end if;
 end if;
 plan:=plan||jsonb_build_object('portions',portions,'shared_recipe_id',case when ep->>'type'<>'breakfast' then choice->'recipe_id' else null end);
 return (select jsonb_agg(case when value->>'day'=ep->>'day' and value->>'type'=ep->>'type' then plan else value end order by ordinal) from jsonb_array_elements(working) with ordinality a(value,ordinal));
end$$;
create function app_private.api_transfer_preview(h uuid,m uuid,request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare src jsonb:=request->'source'; dest jsonb:=request->'target'; mode text:=request->>'mode'; a jsonb; b jsonb; incoming jsonb; reverse jsonb; working jsonb; ep jsonb; span integer; revision bigint; occupied boolean;begin
 perform app_private.assert_context(h,m);
 if mode is null or mode not in('paste','swap') then raise exception 'invalid_recipe';end if;
 perform app_private.transfer_guard(dest);
 select data into b from public.meal_plans where day=(dest->>'day')::date and meal_type=dest->>'type';
 occupied:=app_private.transfer_occupied(b,dest);
 working:=jsonb_build_array(coalesce(b,jsonb_build_object('day',dest->>'day','type',dest->>'type','revision',0,'shared_recipe_id',null,'portions','[]'::jsonb)));
 if mode='swap' then
  perform app_private.transfer_guard(src);
  if (src->>'type'='breakfast')<>(dest->>'type'='breakfast') or (src->>'day'=dest->>'day' and src->>'type'=dest->>'type' and coalesce(src->>'member_id','')=coalesce(dest->>'member_id','')) then raise exception 'invalid_recipe';end if;
  select data into a from public.meal_plans where day=(src->>'day')::date and meal_type=src->>'type';
  if not app_private.transfer_occupied(a,src) then raise exception 'no_suitable_recipe';end if;
  incoming:=app_private.transfer_choice(a,src);
  if occupied then reverse:=app_private.transfer_choice(b,dest);end if;
  if dest->>'type'='breakfast' then
   incoming:=jsonb_set(incoming,'{desserts}',jsonb_build_object(dest->>'member_id',incoming->'desserts'->(src->>'member_id')));
   if reverse is not null then reverse:=jsonb_set(reverse,'{desserts}',jsonb_build_object(src->>'member_id',reverse->'desserts'->(dest->>'member_id')));end if;
  end if;
  if src->>'day'<>dest->>'day' or src->>'type'<>dest->>'type' then working:=working||jsonb_build_array(a);end if;
 else incoming:=request->'choice';end if;
 if incoming is null then raise exception 'invalid_recipe';end if;
 working:=app_private.transfer_patch(working,dest,incoming);
 if mode='swap' then working:=app_private.transfer_patch(working,src,reverse);end if;
 select variety_days into span from public.household where id;
 if exists(
  with final as (select data from public.meal_plans x where not exists(select 1 from jsonb_array_elements(working) w where (w->>'day')::date=x.day and w->>'type'=x.meal_type)
   union all select value from jsonb_array_elements(working))
  select 1 from jsonb_array_elements(working) n cross join final f cross join lateral jsonb_array_elements(n->'portions') np cross join lateral jsonb_array_elements(f.data->'portions') op
  where n->>'type'<>'breakfast' and f.data->>'type'<>'breakfast' and not(n->>'day'=f.data->>'day' and n->>'type'=f.data->>'type') and abs((n->>'day')::date-(f.data->>'day')::date)<span
   and np->>'member_id'=op->>'member_id' and np->>'eating_out'<>'true' and op->>'eating_out'<>'true' and exists(select 1 from jsonb_array_elements_text(np->'variety_keys') k where (op->'variety_keys') ? k)
 ) then raise exception 'variety_conflict';end if;
 select x.revision into revision from public.household_revision x where id;
 return jsonb_build_object('plans',working,'occupied',occupied,'revision',revision,'fingerprint',md5(jsonb_build_array(request,revision,working,occupied)::text));
end$$;
create function app_private.api_transfer_apply(h uuid,m uuid,request jsonb,expected bigint,fingerprint text,overwrite boolean) returns void
language plpgsql security definer set search_path='' as $$
declare reviewed jsonb; plan jsonb;begin
 perform app_private.assert_context(h,m);
 if (select revision from public.household_revision where id) is distinct from expected then raise exception 'stale_plan';end if;
 reviewed:=app_private.api_transfer_preview(h,m,request);
 if reviewed->>'fingerprint' is distinct from fingerprint then raise exception 'stale_plan';end if;
 if request->>'mode'='paste' and (reviewed->>'occupied')::boolean and not coalesce(overwrite,false) then raise exception 'existing_meal';end if;
 for plan in select value from jsonb_array_elements(reviewed->'plans') loop
  if jsonb_array_length(plan->'portions')=0 then delete from public.meal_plans where day=(plan->>'day')::date and meal_type=plan->>'type';
  else insert into public.meal_plans(day,meal_type,data,revision) values((plan->>'day')::date,plan->>'type',plan,1)
   on conflict(household_id,day,meal_type) do update set data=excluded.data,revision=public.meal_plans.revision+1;end if;
 end loop;
 perform app_private.bump();perform app_private.sync_menu_shopping();
end$$;
-- A draft move retains an empty source slot until week approval. Empty slots
-- in that reviewed batch remove the old plan rather than silently retaining it.
do $$declare definition text; marker text:='m:=m||jsonb_build_object(''portions'',parts);';begin
 definition:=pg_get_functiondef('app_private.api_apply_plans(jsonb,bigint,boolean)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'meal_batch_definition_mismatch';end if;
 definition:=replace(definition,marker,marker||' if jsonb_array_length(parts)=0 then delete from public.meal_plans where day=d and meal_type=t;continue;end if;');
 execute definition;
end$$;
-- Only the context-checking API helpers are callable by authenticated users.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in('transfer_portion','transfer_guard','transfer_occupied','transfer_choice','transfer_patch','api_transfer_preview','api_transfer_apply') loop
  execute format('alter function %s owner to week_menu_executor',f.signature);
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end$$;
grant execute on function app_private.api_transfer_preview(uuid,uuid,jsonb),app_private.api_transfer_apply(uuid,uuid,jsonb,bigint,text,boolean) to authenticated;
create function public.preview_meal_transfer(p_household_id uuid,p_membership_id uuid,p_request jsonb) returns jsonb
language sql security invoker set search_path='' as $$select app_private.api_transfer_preview(p_household_id,p_membership_id,p_request)$$;
create function public.apply_meal_transfer(p_household_id uuid,p_membership_id uuid,p_request jsonb,p_revision bigint,p_fingerprint text,p_overwrite boolean default false) returns void
language sql security invoker set search_path='' as $$select app_private.api_transfer_apply(p_household_id,p_membership_id,p_request,p_revision,p_fingerprint,p_overwrite)$$;
revoke all on function public.preview_meal_transfer(uuid,uuid,jsonb),public.apply_meal_transfer(uuid,uuid,jsonb,bigint,text,boolean) from public,anon;
grant execute on function public.preview_meal_transfer(uuid,uuid,jsonb),public.apply_meal_transfer(uuid,uuid,jsonb,bigint,text,boolean) to authenticated;
revoke create on schema app_private from week_menu_executor;
notify pgrst,'reload schema';
commit;
