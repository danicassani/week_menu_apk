-- Household content and immutable meal snapshots. Apply after the foundation.
create table public.food_items(id text primary key,data jsonb not null,revision integer not null default 1,archived boolean not null default false);
create table public.saved_recipes(id text primary key,data jsonb not null,revision integer not null default 1,archived boolean not null default false);
create table app_private.content_versions(id uuid primary key default gen_random_uuid(),kind text not null,item_id text not null,revision integer not null,data jsonb not null,created_at timestamptz not null default clock_timestamp());
create table public.meal_plans(day date not null,meal_type text not null check(meal_type in('breakfast','lunch','dinner')),revision integer not null default 1,data jsonb not null,primary key(day,meal_type));
create table public.substitution_rules(id text primary key,data jsonb not null);
create table public.recipe_prompt_preferences(member_id uuid primary key references public.members(id),show_after timestamptz);

create function app_private.library() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();
begin
 perform app_private.close_due();
 return jsonb_build_object('prompt_show_after',coalesce((select case when show_after is null then 'never' else show_after::text end from public.recipe_prompt_preferences where member_id=u),'now'),'ingredients',coalesce((select jsonb_agg(data||jsonb_build_object('revision',revision,'archived',archived) order by id) from public.food_items),'[]'::jsonb),
 'recipes',coalesce((select jsonb_agg(data||jsonb_build_object('revision',revision,'archived',archived) order by id) from public.saved_recipes),'[]'::jsonb),
 'substitutions',coalesce((select jsonb_agg(data order by id) from public.substitution_rules),'[]'::jsonb),
 'plans',coalesce((select jsonb_agg(app_private.plan_for_display(data)||jsonb_build_object('revision',revision) order by day,meal_type) from public.meal_plans),'[]'::jsonb),
 'revision',(select revision from public.household_revision where id));
end $$;
create function app_private.guard_meal_day(d date) returns void language plpgsql security definer set search_path='' as $$
declare c timestamptz;
begin
 perform app_private.close_due();
 if d is null then raise exception 'day_closed';end if;
 select min(app_private.cutoff(d,time_zone)) into c from public.members where status='active';
 insert into public.meal_date_locks(day,cutoff) values(d,c) on conflict do nothing;
 if exists(select 1 from public.meal_date_locks where day=d and (closed or cutoff<=app_private.operation_now())) then raise exception 'day_closed';end if;
end $$;
create function app_private.validate_food(p jsonb) returns void language plpgsql set search_path='' as $$
declare c jsonb;e numeric;
begin
 if jsonb_typeof(p->'name') is distinct from 'object' or (p->'name' ? 'en' and jsonb_typeof(p->'name'->'en')<>'string') or (p->'name' ? 'es' and jsonb_typeof(p->'name'->'es')<>'string') then raise exception 'invalid_recipe';end if;
 if coalesce(p->>'id','')!~'^[a-zA-Z0-9_-]{1,100}$' or coalesce(length(trim(coalesce(nullif(trim(p->'name'->>'en'),''),p->'name'->>'es'))),0) not between 1 and 160
 or coalesce(p->>'variety_key','')='' or coalesce(p->>'state','')='' or jsonb_typeof(p->'dietary_patterns') is distinct from 'array'
 or jsonb_typeof(p->'conversions') is distinct from 'array' or jsonb_array_length(p->'conversions')=0
 or jsonb_typeof(p->'nutrition_per_100g'->'energy_kcal') is distinct from 'number' then raise exception 'invalid_ingredient';end if;
 e:=(p->'nutrition_per_100g'->>'energy_kcal')::numeric;if e<0 then raise exception 'invalid_ingredient';end if;
 for c in select value from jsonb_array_elements(p->'conversions') loop
  if coalesce(c->>'unit','')='' or jsonb_typeof(c->'grams_per_unit') is distinct from 'number' or (c->>'grams_per_unit')::numeric<=0 then raise exception 'missing_conversion';end if;
  if c?'quantity_step' and (jsonb_typeof(c->'quantity_step') is distinct from 'number' or (c->>'quantity_step')::numeric<=0) then raise exception 'missing_conversion';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p->'conversions'))<>(select count(distinct value->>'unit') from jsonb_array_elements(p->'conversions')) then raise exception 'missing_conversion';end if;
 if not exists(select 1 from jsonb_array_elements(p->'conversions') cv where cv->>'unit'='g' and (cv->>'grams_per_unit')::numeric=1) then raise exception 'missing_conversion';end if;
 if exists(select 1 from jsonb_array_elements_text(p->'dietary_patterns') d where d not in('omnivore','vegetarian','vegan','pescatarian')) then raise exception 'invalid_ingredient';end if;
end $$;
create function app_private.validate_recipe(p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c jsonb;l jsonb;f jsonb;
begin
 if jsonb_typeof(p->'name') is distinct from 'object' or (p->'name' ? 'en' and jsonb_typeof(p->'name'->'en')<>'string') or (p->'name' ? 'es' and jsonb_typeof(p->'name'->'es')<>'string') then raise exception 'invalid_recipe';end if;
 if coalesce(p->>'id','')!~'^[a-zA-Z0-9_-]{1,100}$' or coalesce(length(trim(coalesce(nullif(trim(p->'name'->>'en'),''),p->'name'->>'es'))),0) not between 1 and 160
 or jsonb_typeof(p->'components') is distinct from 'array' or jsonb_array_length(p->'components')=0
 or jsonb_typeof(p->'reference_servings') is distinct from 'number' or (p->>'reference_servings')::numeric<=0
 or jsonb_typeof(p->'meal_types') is distinct from 'array' or jsonb_array_length(p->'meal_types')=0 then raise exception 'invalid_recipe';end if;
 if exists(select 1 from jsonb_array_elements_text(p->'meal_types') t where t not in('breakfast','lunch','dinner')) then raise exception 'invalid_recipe';end if;
 for c in select value from jsonb_array_elements(p->'components') loop
  if coalesce(c->>'id','')='' or coalesce(c->>'kind','') not in('main','side','dessert') or jsonb_typeof(c->'ingredients') is distinct from 'array' or jsonb_typeof(c->'instructions') is distinct from 'array' then raise exception 'invalid_recipe';end if;
  if jsonb_typeof(c->'name') is distinct from 'object' or (c->'name' ? 'en' and jsonb_typeof(c->'name'->'en')<>'string') or (c->'name' ? 'es' and jsonb_typeof(c->'name'->'es')<>'string') then raise exception 'invalid_recipe';end if;
  if exists(select 1 from jsonb_array_elements(c->'instructions') step where jsonb_typeof(step) is distinct from 'object' or (step ? 'en' and jsonb_typeof(step->'en')<>'string') or (step ? 'es' and jsonb_typeof(step->'es')<>'string')) then raise exception 'invalid_recipe';end if;
  for l in select value from jsonb_array_elements(c->'ingredients') loop
   select data into f from public.food_items where id=l->>'ingredient_id' and not archived;
   if f is null then raise exception 'archived_ingredient';end if;
   if jsonb_typeof(l->'quantity') is distinct from 'number' or (l->>'quantity')::numeric<=0 or coalesce(l->>'variety_role','') not in('main','base','support') then raise exception 'invalid_recipe';end if;
   if not exists(select 1 from jsonb_array_elements(f->'conversions') cv where cv->>'unit'=l->>'unit') then raise exception 'missing_conversion';end if;
  end loop;
 end loop;
end $$;
-- Recompute energy and source references from the catalogue, never client calories.
create function app_private.checked_portion(p jsonb,enforce_diet boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid;profile jsonb;l jsonb;f jsonb;cv jsonb;outlines jsonb:='[]';vkeys jsonb;g numeric;k numeric;total numeric:=0;rev integer;warn jsonb:='[]';original_id text;role text;recipe jsonb;comp jsonb;
begin
 uid:=(p->>'member_id')::uuid;
 select app_private.effective_profile(id) into profile from public.members where id=uid and status='active' and onboarded;
 if profile is null then raise exception 'invalid_member';end if;
 if jsonb_typeof(p->'budget') is distinct from 'number' or (p->>'budget')::numeric<=0 then raise exception 'invalid_budgets';end if;
 if p->>'eating_out'='true' then
  if coalesce(length(trim(p->>'description')),0) not between 1 and 160 or jsonb_typeof(p->'kcal') is distinct from 'number' or (p->>'kcal')::numeric<0 then raise exception 'invalid_entry';end if;
  return p||jsonb_build_object('recipe_id',null,'lines','[]'::jsonb,'variety_keys','[]'::jsonb,'substitutions','[]'::jsonb,'recipe_snapshot',null,'name',jsonb_build_object('en',p->>'description','es',p->>'description'));
 end if;
 if not exists(select 1 from public.saved_recipes where id=p->>'recipe_id') or jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines')=0 then raise exception 'invalid_recipe';end if;
 recipe:=p->'recipe_snapshot';if recipe is null then select data into recipe from public.saved_recipes where id=p->>'recipe_id';end if;
 for l in select value from jsonb_array_elements(p->'lines') loop
  original_id:=coalesce((select value->>'from' from jsonb_array_elements(coalesce(p->'substitutions','[]')) where value->>'to'=l->>'ingredient_id' limit 1),l->>'ingredient_id');
  if original_id<>l->>'ingredient_id' and not exists(select 1 from public.substitution_rules r where r.data->>'from_ingredient_id'=original_id and r.data->>'to_ingredient_id'=l->>'ingredient_id' and (r.data->'allowed_recipe_ids') ? (p->>'recipe_id')) then raise exception 'invalid_recipe';end if;
  select value into comp from jsonb_array_elements(recipe->'components') where value->>'id'=l->>'component_id';
  select value->>'variety_role' into role from jsonb_array_elements(comp->'ingredients') where value->>'ingredient_id'=original_id limit 1;
  if role is null or (comp->>'kind'='dessert' and p->>'dessert'<>'true') then raise exception 'invalid_recipe';end if;
  l:=l||jsonb_build_object('variety_role',role);

  select data,revision into f,rev from public.food_items where id=l->>'ingredient_id';
  if f is null then raise exception 'missing_nutrition';end if;
  if not (f->'dietary_patterns') ? (profile->>'diet') or (profile->'excluded_ingredients') ? (f->>'id') then if enforce_diet then raise exception 'diet_conflict';else warn:=warn||'"diet_conflict"'::jsonb;end if;end if;
  select value into cv from jsonb_array_elements(f->'conversions') where value->>'unit'=l->>'unit';
  if cv is null then raise exception 'missing_conversion';end if;
  if jsonb_typeof(l->'quantity') is distinct from 'number' or (l->>'quantity')::numeric<=0 then raise exception 'invalid_quantity';end if;
  if coalesce(l->>'variety_role','') not in('main','base','support') then raise exception 'invalid_recipe';end if;
  g:=(l->>'quantity')::numeric*(cv->>'grams_per_unit')::numeric;
  k:=g*(f->'nutrition_per_100g'->>'energy_kcal')::numeric/100;total:=total+k;
  outlines:=outlines||jsonb_build_array(l||jsonb_build_object('grams',g,'kcal',k,'name',f->'name','nutrition_revision',rev,'grams_per_unit',(cv->>'grams_per_unit')::numeric,'energy_per_100g',(f->'nutrition_per_100g'->>'energy_kcal')::numeric,'variety_key',f->>'variety_key'));
 end loop;
 select coalesce(jsonb_agg(distinct value->'variety_key'),'[]') into vkeys from jsonb_array_elements(outlines) where value->>'variety_role' in('main','base');
 if total>(p->>'budget')::numeric then warn:=warn||'"over_budget"'::jsonb;end if;
 if jsonb_array_length(coalesce(p->'substitutions','[]'))>0 then warn:=warn||'"review_substitutions"'::jsonb;end if;
 return p||jsonb_build_object('lines',outlines,'kcal',total,'variety_keys',vkeys,'warnings',warn);
end $$;
create function app_private.api_save_content(kind text,p jsonb,expected integer,archive boolean) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_private.actor();oldrev integer;mp record;portion jsonb;parts jsonb;
begin
 perform app_private.close_due();
 if kind='ingredient' then
  perform app_private.validate_food(p);select revision into oldrev from public.food_items where id=p->>'id';
 elsif kind='recipe' then
  if not archive then perform app_private.validate_recipe(p);end if;select revision into oldrev from public.saved_recipes where id=p->>'id';
 else raise exception 'invalid_recipe';end if;
 if coalesce(oldrev,0) is distinct from expected then raise exception 'stale_content';end if;
 if kind='ingredient' then
  insert into public.food_items(id,data,revision,archived) values(p->>'id',p,expected+1,archive) on conflict(id) do update set data=excluded.data,revision=excluded.revision,archived=excluded.archived;
 else
  insert into public.saved_recipes(id,data,revision,archived) values(p->>'id',p,expected+1,archive) on conflict(id) do update set data=excluded.data,revision=excluded.revision,archived=excluded.archived;
 end if;
 insert into app_private.content_versions(kind,item_id,revision,data) values(kind,p->>'id',expected+1,p||jsonb_build_object('archived',archive));
 if kind='ingredient' then
  for mp in select m.* from public.meal_plans m join public.meal_date_locks d on d.day=m.day where not d.closed loop
   parts:='[]';
   for portion in select value from jsonb_array_elements(mp.data->'portions') loop
    -- Existing dietary conflicts remain visible for explicit review; no silent substitutions.
    portion:=app_private.checked_portion(portion,false);
    parts:=parts||jsonb_build_array(portion);
   end loop;
   update public.meal_plans set data=jsonb_set(data,'{portions}',parts),revision=revision+1 where day=mp.day and meal_type=mp.meal_type;
  end loop;
 end if;
 perform app_private.bump();
end $$;
create function app_private.api_apply_plans(batch jsonb,expected bigint,replace_existing boolean) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=app_private.actor();m jsonb;p jsonb;parts jsonb;d date;t text;old jsonb;recipe jsonb;span integer;oldp jsonb;previous jsonb;
begin
 perform app_private.close_due();
 if (select revision from public.household_revision where id) is distinct from expected then raise exception 'stale_plan';end if;
 if jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch) not between 1 and 93 then raise exception 'invalid_recipe';end if;
 if (select count(distinct (value->>'day',value->>'type')) from jsonb_array_elements(batch))<>jsonb_array_length(batch) then raise exception 'invalid_recipe';end if;
 select coalesce(jsonb_agg(data||jsonb_build_object('revision',revision)),'[]') into previous from public.meal_plans;
 if replace_existing then
  for m in select value from jsonb_array_elements(batch) loop perform app_private.guard_meal_day((m->>'day')::date);end loop;
  delete from public.meal_plans x where exists(select 1 from jsonb_array_elements(batch) y where (y->>'day')::date=x.day and y->>'type'=x.meal_type);
 end if;
 select variety_days into span from public.household where id;
 for m in select value from jsonb_array_elements(batch) loop
  d:=(m->>'day')::date;t:=m->>'type';perform app_private.guard_meal_day(d);
  if t not in('breakfast','lunch','dinner') or t is null then raise exception 'invalid_recipe';end if;
  select value into old from jsonb_array_elements(previous) where (value->>'day')::date=d and value->>'type'=t;
  if old is not null and not replace_existing then raise exception 'existing_meal';end if;
  if jsonb_typeof(m->'portions') is distinct from 'array' then raise exception 'invalid_recipe';end if;
  if (select count(*) from jsonb_array_elements(m->'portions'))<>(select count(distinct value->>'member_id') from jsonb_array_elements(m->'portions')) then raise exception 'invalid_member';end if;
  parts:='[]';
  for p in select value from jsonb_array_elements(m->'portions') loop
   select value into oldp from jsonb_array_elements(coalesce(old->'portions','[]')) where value->>'member_id'=p->>'member_id';
   if p->>'eating_out'<>'true' then
    select data into recipe from public.saved_recipes where id=p->>'recipe_id' and (not archived or oldp->>'recipe_id'=p->>'recipe_id');
    if oldp->>'recipe_id'=p->>'recipe_id' and oldp->'recipe_snapshot'=p->'recipe_snapshot' then recipe:=oldp->'recipe_snapshot';end if;
    if recipe is null or not (recipe->'meal_types') ? t then raise exception 'archived_ingredient';end if;
    if t<>'breakfast' and p->>'recipe_id' is distinct from m->>'shared_recipe_id' then raise exception 'invalid_recipe';end if;
    if exists(select 1 from jsonb_array_elements(p->'lines') l join public.food_items f on f.id=l->>'ingredient_id' where f.archived and not exists(select 1 from jsonb_array_elements(coalesce(oldp->'lines','[]')) ol where ol->>'ingredient_id'=l->>'ingredient_id')) then raise exception 'archived_ingredient';end if;
    p:=p||jsonb_build_object('recipe_snapshot',recipe,'name',recipe->'name');
   end if;
   p:=p||jsonb_build_object('budget',coalesce((select kcal from public.budget_overrides where member_id=(p->>'member_id')::uuid and day=d and meal_type=t),(select (budgets->>t)::numeric from public.targets where member_id=(p->>'member_id')::uuid and effective_date<=d order by effective_date desc,created_at desc,id desc limit 1)));
   p:=app_private.checked_portion(p);parts:=parts||jsonb_build_array(p);
  end loop;
  m:=m||jsonb_build_object('portions',parts);
  if t<>'breakfast' and exists(
   select 1 from public.meal_plans other cross join lateral jsonb_array_elements(other.data->'portions') op cross join lateral jsonb_array_elements(parts) np
   where other.meal_type<>'breakfast' and not(other.day=d and other.meal_type=t) and abs(other.day-d)<span
   and op->>'member_id'=np->>'member_id' and op->>'eating_out'<>'true' and np->>'eating_out'<>'true'
   and exists(select 1 from jsonb_array_elements_text(op->'variety_keys') k where (np->'variety_keys') ? k)
  ) then raise exception 'variety_conflict';end if;
  insert into public.meal_plans(day,meal_type,data,revision) values(d,t,m,coalesce((old->>'revision')::integer,0)+1) on conflict(day,meal_type) do update set data=excluded.data,revision=public.meal_plans.revision+1;
 end loop;
 perform app_private.bump();
end $$;
create function app_private.api_planner_settings(week_start integer,variety_days integer) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();begin
 if week_start not in(0,1) or variety_days not between 1 and 14 then raise exception 'invalid_recipe';end if;
 update public.household set week_start=api_planner_settings.week_start,variety_days=api_planner_settings.variety_days where id;perform app_private.bump();end $$;
create function public.get_planning_library() returns jsonb language sql security invoker set search_path='' as $$select app_private.library()$$;
create function public.save_household_content(p_kind text,p_data jsonb,p_revision integer,p_archive boolean default false) returns void language sql security invoker set search_path='' as $$select app_private.api_save_content(p_kind,p_data,p_revision,p_archive)$$;
create function public.apply_meal_plans(p_batch jsonb,p_revision bigint,p_replace boolean default false) returns void language sql security invoker set search_path='' as $$select app_private.api_apply_plans(p_batch,p_revision,p_replace)$$;
create function public.save_planner_settings(p_week_start integer,p_variety_days integer) returns void language sql security invoker set search_path='' as $$select app_private.api_planner_settings(p_week_start,p_variety_days)$$;
revoke all on all tables in schema app_private from public,anon,authenticated;
revoke all on function app_private.library(),app_private.guard_meal_day(date),app_private.validate_food(jsonb),app_private.validate_recipe(jsonb),app_private.checked_portion(jsonb,boolean),app_private.api_save_content(text,jsonb,integer,boolean),app_private.api_apply_plans(jsonb,bigint,boolean),app_private.api_planner_settings(integer,integer) from public,anon,authenticated;
grant execute on function app_private.library(),app_private.api_save_content(text,jsonb,integer,boolean),app_private.api_apply_plans(jsonb,bigint,boolean),app_private.api_planner_settings(integer,integer) to authenticated;
do $$declare t text;f text;begin
 foreach t in array array['food_items','saved_recipes','meal_plans','substitution_rules','recipe_prompt_preferences'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);
  execute format('create policy active_household_read on public.%I for select to authenticated using ((select app_private.is_member()))',t);
 end loop;
 foreach f in array array['get_planning_library()','save_household_content(text,jsonb,integer,boolean)','apply_meal_plans(jsonb,bigint,boolean)','save_planner_settings(integer,integer)'] loop
  execute 'revoke all on function public.'||f||' from public,anon';execute 'grant execute on function public.'||f||' to authenticated';
 end loop;
end$$;
-- Preserve the established household snapshot API and enrich it with authoritative meals.
alter function app_private.api_snapshot() rename to foundation_snapshot;
create function app_private.api_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 s:=app_private.foundation_snapshot();
 return s||jsonb_build_object('planning',app_private.library(),'meals',coalesce((select jsonb_agg(jsonb_build_object('member_id',p->>'member_id','day',m.day,'type',m.meal_type,'name',p->'name','kcal',(p->>'kcal')::numeric,'recipe_id',p->>'recipe_id','eating_out',p->'eating_out')) from public.meal_plans m cross join lateral jsonb_array_elements(m.data->'portions') p),'[]'::jsonb));
end$$;
revoke all on function app_private.foundation_snapshot(),app_private.api_snapshot() from public,anon,authenticated;
grant execute on function app_private.api_snapshot() to authenticated;
-- SQL-language wrappers bind function OIDs; recreate to use the enriched snapshot.
create or replace function public.get_household_snapshot() returns jsonb language sql security invoker set search_path='' as $$select app_private.api_snapshot()$$;

create function app_private.remove_departing_portions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='active' and new.status='removed' then
  update public.meal_plans m set data=jsonb_set(m.data,'{portions}',coalesce((select jsonb_agg(p) from jsonb_array_elements(m.data->'portions') p where p->>'member_id'<>new.id::text),'[]'::jsonb)),revision=revision+1
  where exists(select 1 from public.meal_date_locks d where d.day=m.day and not d.closed);
 end if;return new;
end$$;
revoke all on function app_private.remove_departing_portions() from public,anon,authenticated;
create trigger member_meal_cleanup after update of status on public.members for each row execute function app_private.remove_departing_portions();
create function app_private.api_prompt_preference(p_after timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();begin
 insert into public.recipe_prompt_preferences(member_id,show_after) values(u,p_after) on conflict(member_id) do update set show_after=excluded.show_after;
 perform app_private.bump();end$$;
create function public.save_recipe_prompt_preference(p_after timestamptz) returns void language sql security invoker set search_path='' as $$select app_private.api_prompt_preference(p_after)$$;
revoke all on function app_private.api_prompt_preference(timestamptz),public.save_recipe_prompt_preference(timestamptz) from public,anon,authenticated;
grant execute on function app_private.api_prompt_preference(timestamptz),public.save_recipe_prompt_preference(timestamptz) to authenticated;

create function app_private.plan_for_display(m jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;profile jsonb;parts jsonb:='[]';
begin
 if exists(select 1 from public.meal_date_locks where day=(m->>'day')::date and closed) then return m;end if;
 for p in select value from jsonb_array_elements(m->'portions') loop
  profile:=app_private.effective_profile((p->>'member_id')::uuid);
  if p->>'eating_out'<>'true' and exists(select 1 from jsonb_array_elements(p->'lines') l join public.food_items f on f.id=l->>'ingredient_id' where not (f.data->'dietary_patterns') ? (profile->>'diet') or (profile->'excluded_ingredients') ? f.id) then
   p:=p||jsonb_build_object('warnings',coalesce(p->'warnings','[]')||'"diet_conflict"'::jsonb);
  end if;
  parts:=parts||jsonb_build_array(p);
 end loop;return jsonb_set(m,'{portions}',parts);
end$$;
revoke all on function app_private.plan_for_display(jsonb) from public,anon,authenticated;
create function app_private.api_delete_meal(p_day date,p_type text,p_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();begin
 if (select revision from public.household_revision where id) is distinct from p_revision then raise exception 'stale_plan';end if;
 perform app_private.guard_meal_day(p_day);delete from public.meal_plans where day=p_day and meal_type=p_type;perform app_private.bump();end$$;
create function public.delete_planned_meal(p_day date,p_type text,p_revision bigint) returns void language sql security invoker set search_path='' as $$select app_private.api_delete_meal(p_day,p_type,p_revision)$$;
revoke all on function app_private.api_delete_meal(date,text,bigint),public.delete_planned_meal(date,text,bigint) from public,anon,authenticated;
grant execute on function app_private.api_delete_meal(date,text,bigint),public.delete_planned_meal(date,text,bigint) to authenticated;
