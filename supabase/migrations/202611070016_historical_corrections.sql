-- V3 milestone 4. Dedicated historical meal transactions; ordinary locks stay closed.
begin;
create table app_private.correction_sessions(
 token uuid primary key default gen_random_uuid(),
 household_id uuid not null default app_private.current_household(), member_id uuid not null,
 day date not null, revision bigint not null, expires_at timestamptz not null,
 foreign key(household_id,member_id) references public.members(household_id,id)
);
create table app_private.meal_corrections(
 id uuid primary key default gen_random_uuid(), token uuid not null unique,
 household_id uuid not null default app_private.current_household(), member_id uuid not null,
 day date not null, action text not null check(action in('save','erase')),
 request jsonb not null, before_meals jsonb not null, after_meals jsonb not null,
 acknowledgement jsonb not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(household_id,member_id) references public.members(household_id,id)
);
create index correction_expiry on app_private.correction_sessions(household_id,expires_at);
create index correction_day on app_private.meal_corrections(household_id,day,created_at);
do $$declare t text;begin
 foreach t in array array['correction_sessions','meal_corrections'] loop
  execute format('alter table app_private.%I enable row level security',t);
  execute format('alter table app_private.%I force row level security',t);
  execute format('create policy correction_executor on app_private.%I for all to week_menu_executor using(household_id=(select app_private.current_household())) with check(household_id=(select app_private.current_household()))',t);
  execute format('revoke all on app_private.%I from public,anon,authenticated',t);
 end loop;
end$$;
grant select,insert,delete on app_private.correction_sessions to week_menu_executor;
grant select,insert on app_private.meal_corrections to week_menu_executor;
grant create on schema app_private to week_menu_executor;
create function app_private.historical_meals(d date) returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(data||jsonb_build_object('revision',revision) order by meal_type),'[]') from public.meal_plans where day=d
$$;
create function app_private.api_begin_correction(h uuid,m uuid,d date,expected bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare session app_private.correction_sessions%rowtype; cutoff timestamptz;begin
 perform app_private.assert_context(h,m);perform app_private.close_due();
 if d is null or not isfinite(d) then raise exception 'day_closed';end if;
 select min(app_private.cutoff(d,time_zone)) into cutoff from public.members where status='active';
 insert into public.meal_date_locks(day,cutoff,closed) values(d,cutoff,cutoff<=app_private.operation_now()) on conflict do nothing;
 if not exists(select 1 from public.meal_date_locks where day=d and closed) then raise exception 'historical_day_required';end if;
 if (select revision from public.household_revision where id) is distinct from expected then raise exception 'stale_plan';end if;
 -- Lazy household-scoped expiry cleanup; at most one live session per editor.
 delete from app_private.correction_sessions where expires_at<=clock_timestamp() or member_id=m;
 insert into app_private.correction_sessions(member_id,day,revision,expires_at) values(m,d,expected,clock_timestamp()+interval '10 minutes') returning * into session;
 return jsonb_build_object('token',session.token,'day',d,'revision',expected,'expires_at',session.expires_at,'plans',app_private.historical_meals(d));
end$$;
-- Use immutable recorded references for retained ingredient/unit lines. New lines
-- resolve current catalogue references; client-supplied energy/source data is ignored.
create function app_private.historical_portion(p jsonb,oldp jsonb,d date,t text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; profile jsonb; budget numeric; recipe jsonb; rid text; rev integer; l jsonb; ol jsonb; f jsonb; cv jsonb; ref record;
 comp jsonb; role text; original text; sub jsonb; subs jsonb:='[]'; lines jsonb:='[]'; keys jsonb; warnings jsonb:='[]'; g numeric; k numeric; total numeric:=0;
begin
 uid:=(p->>'member_id')::uuid;
 if not exists(select 1 from public.members where id=uid) then raise exception 'invalid_member';end if;
 select nullif(snapshot->'profile','null'::jsonb) into profile from public.personal_days where member_id=uid and day=d and closed;
 if profile is null then select inputs into profile from public.targets where member_id=uid and effective_date<=d order by effective_date desc,created_at desc,id desc limit 1;end if;
 -- A historical participant must be recorded, or have a frozen personal day.
 if oldp is null and not exists(select 1 from public.personal_days where member_id=uid and day=d and closed) then raise exception 'invalid_member';end if;
 if oldp is not null and p=oldp then return oldp;end if;
 budget:=coalesce((oldp->>'budget')::numeric,(select kcal from public.budget_overrides where member_id=uid and day=d and meal_type=t),(select (snapshot->'target'->'budgets'->>t)::numeric from public.personal_days where member_id=uid and day=d and closed));
 if budget is null or budget<=0 then raise exception 'historical_context_missing';end if;
 if jsonb_typeof(p->'eating_out') is distinct from 'boolean' or jsonb_typeof(p->'dessert') is distinct from 'boolean' then raise exception 'invalid_recipe';end if;
 if p->>'eating_out'='true' then
  if coalesce(length(trim(p->>'description')),0) not between 1 and 160 or jsonb_typeof(p->'kcal') is distinct from 'number' or (p->>'kcal')::numeric<0 then raise exception 'invalid_entry';end if;
  return jsonb_build_object('member_id',uid,'budget',budget,'eating_out',true,'dessert',p->'dessert','description',trim(p->>'description'),'kcal',(p->>'kcal')::numeric,'recipe_id',null,'recipe_snapshot',null,'underlying_recipe_id',coalesce(oldp->>'recipe_id',oldp->>'underlying_recipe_id'),'underlying_recipe_snapshot',coalesce(nullif(oldp->'recipe_snapshot','null'::jsonb),oldp->'underlying_recipe_snapshot'),'name',jsonb_build_object('en',trim(p->>'description'),'es',trim(p->>'description')),'lines','[]'::jsonb,'variety_keys','[]'::jsonb,'substitutions','[]'::jsonb,'warnings','[]'::jsonb);
 end if;
 rid:=p->>'recipe_id';
 if rid=oldp->>'recipe_id' then recipe:=oldp->'recipe_snapshot';
 elsif rid=oldp->>'underlying_recipe_id' then recipe:=oldp->'underlying_recipe_snapshot';end if;
 if recipe is null or recipe='null'::jsonb then
  select data||jsonb_build_object('revision',revision,'archived',false) into recipe from app_private.resolved_saved_recipes where id=rid and not archived;
 end if;
 if recipe is null or not (recipe->'meal_types') ? t or jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 200 then raise exception 'invalid_recipe';end if;
 if (select count(*) from jsonb_array_elements(p->'lines'))<>(select count(distinct (value->>'component_id',value->>'ingredient_id')) from jsonb_array_elements(p->'lines')) then raise exception 'invalid_recipe';end if;
 for l in select value from jsonb_array_elements(p->'lines') loop
  if jsonb_typeof(l->'quantity') is distinct from 'number' or (l->>'quantity')::numeric<=0 then raise exception 'invalid_quantity';end if;
  select value into ol from jsonb_array_elements(coalesce(oldp->'lines','[]')) where rid=oldp->>'recipe_id' and value->>'ingredient_id'=l->>'ingredient_id' and value->>'unit'=l->>'unit' and value->>'component_id'=l->>'component_id';
  select value into comp from jsonb_array_elements(recipe->'components') where value->>'id'=l->>'component_id';
  if comp is null or (comp->>'kind'='dessert' and p->>'dessert'<>'true') then raise exception 'invalid_recipe';end if;
  original:=l->>'ingredient_id';sub:=null;
  if not exists(select 1 from jsonb_array_elements(comp->'ingredients') where value->>'ingredient_id'=original) then
   select value into sub from jsonb_array_elements(coalesce(oldp->'substitutions','[]')) where ol is not null and value->>'to'=original;
   if sub is null then
    select jsonb_build_object('from',r.data->>'from_ingredient_id','to',original,'instructions',r.data->'instruction_override') into sub from app_private.resolved_substitution_rules r where r.data->>'to_ingredient_id'=original and (r.data->'allowed_recipe_ids') ? rid and exists(select 1 from jsonb_array_elements(comp->'ingredients') where value->>'ingredient_id'=r.data->>'from_ingredient_id') order by r.id limit 1;
   end if;
   if sub is null then raise exception 'invalid_recipe';end if;original:=sub->>'from';subs:=subs||jsonb_build_array(sub);
  end if;
  select value->>'variety_role' into role from jsonb_array_elements(comp->'ingredients') where value->>'ingredient_id'=original limit 1;
  if role is null then raise exception 'invalid_recipe';end if;
  if ol is not null and ol ? 'grams_per_unit' and ol ? 'energy_per_100g' then
   g:=(l->>'quantity')::numeric*(ol->>'grams_per_unit')::numeric;k:=g*(ol->>'energy_per_100g')::numeric/100;
   l:=ol||jsonb_build_object('quantity',(l->>'quantity')::numeric,'grams',g,'kcal',k);
  else
   select data,revision into f,rev from app_private.resolved_food_items where id=l->>'ingredient_id' and not archived;
   if f is null then raise exception 'archived_ingredient';end if;
   if profile is not null and (not (f->'dietary_patterns') ? (profile->>'diet') or coalesce(profile->'excluded_ingredients','[]') ? (f->>'id')) then raise exception 'diet_conflict';end if;
   select value into cv from jsonb_array_elements(f->'conversions') where value->>'unit'=l->>'unit';
   if cv is null then raise exception 'missing_conversion';end if;
   select * into ref from app_private.resolved_food_references where ingredient_id=l->>'ingredient_id' and revision=rev;
   if not found then raise exception 'missing_shopping_reference';end if;
   g:=(l->>'quantity')::numeric*(cv->>'grams_per_unit')::numeric;k:=g*(f->'nutrition_per_100g'->>'energy_kcal')::numeric/100;
   l:=jsonb_build_object('ingredient_id',f->>'id','component_id',comp->>'id','variety_role',role,'name',f->'name','quantity',(l->>'quantity')::numeric,'unit',l->>'unit','grams',g,'kcal',k,'grams_per_unit',(cv->>'grams_per_unit')::numeric,'energy_per_100g',(f->'nutrition_per_100g'->>'energy_kcal')::numeric,'nutrition_revision',rev,'variety_key',f->>'variety_key','reference_state',ref.state,'quantity_basis',ref.basis,'shopping_policy',ref.policy);
  end if;
  total:=total+k;lines:=lines||jsonb_build_array(l);
 end loop;
 select coalesce(jsonb_agg(distinct value->'variety_key'),'[]') into keys from jsonb_array_elements(lines) where value->>'variety_role' in('main','base');
 if total>budget then warnings:=warnings||'"over_budget"'::jsonb;end if;
 if jsonb_array_length(subs)>0 then warnings:=warnings||'"review_substitutions"'::jsonb;end if;
 return jsonb_build_object('member_id',uid,'budget',budget,'recipe_id',rid,'recipe_snapshot',recipe,'name',recipe->'name','dessert',p->'dessert','eating_out',false,'lines',lines,'substitutions',subs,'variety_keys',keys,'kcal',total,'warnings',warnings);
end$$;
create function app_private.api_apply_correction(h uuid,m uuid,credential uuid,d date,action text,batch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare session app_private.correction_sessions%rowtype; previous app_private.meal_corrections%rowtype; payload jsonb; before_meals jsonb; after_meals jsonb:='[]'; plan jsonb; oldplan jsonb; p jsonb; oldp jsonb; portions jsonb; ack jsonb;begin
 perform app_private.assert_context(h,m);perform app_private.close_due();
 payload:=jsonb_build_object('day',d,'action',action,'plans',batch);
 select * into previous from app_private.meal_corrections where token=credential and member_id=m;
 if found then
  if previous.request is distinct from payload then raise exception 'operation_mismatch';end if;return previous.acknowledgement;
 end if;
 select * into session from app_private.correction_sessions where token=credential and member_id=m and day=d;
 if not found or session.expires_at<=clock_timestamp() then raise exception 'correction_expired';end if;
 if (select revision from public.household_revision where id) is distinct from session.revision then raise exception 'stale_plan';end if;
 if not exists(select 1 from public.meal_date_locks where day=d and closed) then raise exception 'historical_day_required';end if;
 if action is null or action not in('save','erase') or jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch)>3 or (action='erase' and batch<>'[]'::jsonb) then raise exception 'invalid_recipe';end if;
 if (select count(distinct value->>'type') from jsonb_array_elements(batch))<>jsonb_array_length(batch) then raise exception 'invalid_recipe';end if;
 before_meals:=app_private.historical_meals(d);
 for plan in select value from jsonb_array_elements(batch) loop
  if plan->>'day' is distinct from d::text or coalesce(plan->>'type','') not in('breakfast','lunch','dinner') or jsonb_typeof(plan->'portions') is distinct from 'array' or jsonb_array_length(plan->'portions')>100 then raise exception 'invalid_recipe';end if;
  if (select count(distinct value->>'member_id') from jsonb_array_elements(plan->'portions'))<>jsonb_array_length(plan->'portions') then raise exception 'invalid_member';end if;
  select value into oldplan from jsonb_array_elements(before_meals) where value->>'type'=plan->>'type';portions:='[]';
  for p in select value from jsonb_array_elements(plan->'portions') loop
   select value into oldp from jsonb_array_elements(coalesce(oldplan->'portions','[]')) where value->>'member_id'=p->>'member_id';
   p:=app_private.historical_portion(p,oldp,d,plan->>'type');
   if plan->>'type'<>'breakfast' and p->>'eating_out'='false' and p->>'recipe_id' is distinct from plan->>'shared_recipe_id' then raise exception 'invalid_recipe';end if;
   portions:=portions||jsonb_build_array(p);
  end loop;
  if jsonb_array_length(portions)>0 then after_meals:=after_meals||jsonb_build_array(jsonb_build_object('day',d,'type',plan->>'type','shared_recipe_id',plan->'shared_recipe_id','portions',portions,'revision',coalesce((oldplan->>'revision')::integer,0)+1));end if;
 end loop;
 if action='save' and (select coalesce(jsonb_agg(value-'revision' order by value->>'type'),'[]') from jsonb_array_elements(after_meals))=(select coalesce(jsonb_agg(value-'revision' order by value->>'type'),'[]') from jsonb_array_elements(before_meals)) then raise exception 'correction_unchanged';end if;
 -- No ordinary guard is bypassed and no lock/personal snapshot is reopened.
 delete from public.meal_plans where day=d;
 for plan in select value from jsonb_array_elements(after_meals) loop
  insert into public.meal_plans(day,meal_type,data,revision) values(d,plan->>'type',plan,(plan->>'revision')::integer);
 end loop;
 perform app_private.bump();perform app_private.sync_menu_shopping();
 ack:=jsonb_build_object('day',d,'revision',(select revision from public.household_revision where id),'action',action);
 insert into app_private.meal_corrections(token,member_id,day,action,request,before_meals,after_meals,acknowledgement) values(credential,m,d,action,payload,before_meals,after_meals,ack);
 delete from app_private.correction_sessions where token=credential;
 return ack;
end$$;
create function app_private.api_cancel_correction(h uuid,m uuid,credential uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 perform app_private.assert_context(h,m);delete from app_private.correction_sessions where token=credential and member_id=m;
end$$;
create function app_private.api_correction_history(h uuid,m uuid,d date) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 perform app_private.assert_context(h,m);
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'member_id',member_id,'day',day,'action',action,'created_at',created_at,'before_meals',before_meals,'after_meals',after_meals) order by created_at,id) from app_private.meal_corrections where day=d),'[]');
end$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in('historical_meals','historical_portion','api_begin_correction','api_apply_correction','api_cancel_correction','api_correction_history') loop
  execute format('alter function %s owner to week_menu_executor',f.signature);execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end$$;
grant execute on function app_private.api_begin_correction(uuid,uuid,date,bigint),app_private.api_apply_correction(uuid,uuid,uuid,date,text,jsonb),app_private.api_cancel_correction(uuid,uuid,uuid),app_private.api_correction_history(uuid,uuid,date) to authenticated;
create function public.begin_historical_correction(p_household_id uuid,p_membership_id uuid,p_day date,p_revision bigint) returns jsonb language sql security invoker set search_path='' as $$select app_private.api_begin_correction(p_household_id,p_membership_id,p_day,p_revision)$$;
create function public.apply_historical_correction(p_household_id uuid,p_membership_id uuid,p_token uuid,p_day date,p_action text,p_plans jsonb) returns jsonb language sql security invoker set search_path='' as $$select app_private.api_apply_correction(p_household_id,p_membership_id,p_token,p_day,p_action,p_plans)$$;
create function public.cancel_historical_correction(p_household_id uuid,p_membership_id uuid,p_token uuid) returns void language sql security invoker set search_path='' as $$select app_private.api_cancel_correction(p_household_id,p_membership_id,p_token)$$;
create function public.get_historical_corrections(p_household_id uuid,p_membership_id uuid,p_day date) returns jsonb language sql security invoker set search_path='' as $$select app_private.api_correction_history(p_household_id,p_membership_id,p_day)$$;
revoke all on function public.begin_historical_correction(uuid,uuid,date,bigint),public.apply_historical_correction(uuid,uuid,uuid,date,text,jsonb),public.cancel_historical_correction(uuid,uuid,uuid),public.get_historical_corrections(uuid,uuid,date) from public,anon;
grant execute on function public.begin_historical_correction(uuid,uuid,date,bigint),public.apply_historical_correction(uuid,uuid,uuid,date,text,jsonb),public.cancel_historical_correction(uuid,uuid,uuid),public.get_historical_corrections(uuid,uuid,date) to authenticated;
revoke create on schema app_private from week_menu_executor;
notify pgrst,'reload schema';
commit;
