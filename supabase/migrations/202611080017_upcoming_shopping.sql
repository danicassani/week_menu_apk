-- V4 milestone 2: all upcoming meals, compatible legacy RPCs and purchasing estimates.
begin;
grant create on schema app_private to week_menu_executor;
create table app_private.purchasing_units(
 household_id uuid not null default app_private.current_household(),
 ingredient_id text not null check(ingredient_id='egg'), grams_per_unit numeric,
 revision integer not null default 1,
 check(grams_per_unit is null or (grams_per_unit>0 and grams_per_unit::text not in('NaN','Infinity','-Infinity'))),
 primary key(household_id,ingredient_id)
);
alter table app_private.purchasing_units enable row level security;
alter table app_private.purchasing_units force row level security;
create policy purchasing_executor on app_private.purchasing_units for all to week_menu_executor using(household_id=(select app_private.current_household())) with check(household_id=(select app_private.current_household()));
revoke all on app_private.purchasing_units from public,anon,authenticated;
grant select,insert,update on app_private.purchasing_units to week_menu_executor;
create function app_private.purchasing_settings() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('ingredient_id',f.id,'unit','egg','grams_per_unit',coalesce(p.grams_per_unit,(s.data->'reference_piece_conversion'->>'grams_per_unit')::numeric),'estimated',true,'origin',case when p.grams_per_unit is null then 'starter_estimate' else 'household_estimate' end,'revision',coalesce(p.revision,0),'reference_state','raw_edible','quantity_basis','edible_reference_weight')),'[]')
 from app_private.resolved_food_items f
 join public.household h on h.id
 join app_private.starter_content s on s.release=h.starter_release and s.kind='ingredient' and s.id=f.id
 left join app_private.purchasing_units p on p.ingredient_id=f.id
 where f.id='egg' and f.data->>'food_class'='egg' and coalesce(p.grams_per_unit,(s.data->'reference_piece_conversion'->>'grams_per_unit')::numeric)>0
$$;
create function app_private.api_purchasing(h uuid,m uuid,grams numeric,expected integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform app_private.assert_context(h,m);
 if grams is not null and (grams<=0 or grams::text in('NaN','Infinity','-Infinity')) then raise exception 'invalid_purchasing_unit';end if;
 if not exists(select 1 from app_private.resolved_food_items where id='egg' and data->>'food_class'='egg') then raise exception 'invalid_purchasing_unit';end if;
 if coalesce((select revision from app_private.purchasing_units where ingredient_id='egg'),0) is distinct from expected then
  if exists(select 1 from app_private.purchasing_units where ingredient_id='egg' and revision=expected+1 and grams_per_unit is not distinct from grams) then return;end if;
  raise exception 'stale_content';end if;
 insert into app_private.purchasing_units(ingredient_id,grams_per_unit,revision) values('egg',grams,expected+1)
 on conflict(household_id,ingredient_id) do update set grams_per_unit=excluded.grams_per_unit,revision=excluded.revision;
 perform app_private.bump();
end$$;
-- One upcoming source, aggregated per day for complete offline expiry provenance.
create function app_private.upcoming_contributions() returns table(day date,cutoff timestamptz,key text,ingredient_id text,name jsonb,quantity numeric,unit text,reference_state text,quantity_basis text)
language sql security definer set search_path='' as $$
 with lines as (
 select m.day,app_private.shopping_cutoff(m.day) cutoff,l,
 coalesce(l->>'reference_state',v.state) state,coalesce(l->>'quantity_basis',v.basis) basis,coalesce(l->>'shopping_policy',v.policy) policy
 from public.meal_plans m cross join lateral jsonb_array_elements(m.data->'portions') p cross join lateral jsonb_array_elements(p->'lines') l
 left join app_private.resolved_food_references v on v.ingredient_id=l->>'ingredient_id' and v.revision=(l->>'nutrition_revision')::integer
 where m.day>=(app_private.operation_now() at time zone 'UTC')::date-1 and app_private.shopping_cutoff(m.day)>app_private.operation_now() and p->>'eating_out'<>'true'
 )
 select day,cutoff,jsonb_build_array(l->>'ingredient_id',state,basis)::text,l->>'ingredient_id',(jsonb_agg(l->'name'))->0,sum((l->>'grams')::numeric),'g',state,basis
 from lines where policy='include' group by day,cutoff,l->>'ingredient_id',state,basis having sum((l->>'grams')::numeric)>0
$$;
create or replace function app_private.shopping_required(p_start date,p_end date) returns table(key text,ingredient_id text,name jsonb,quantity numeric,unit text,reference_state text,quantity_basis text)
language plpgsql security definer set search_path='' as $$begin
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_start>p_end then raise exception 'invalid_shopping_range';end if;
 if exists(select 1 from app_private.upcoming_contributions() c where c.reference_state is null or c.quantity_basis is null) then raise exception 'missing_shopping_reference';end if;
 return query select c.key,c.ingredient_id,(jsonb_agg(c.name order by c.day desc))->0,sum(c.quantity),'g',c.reference_state,c.quantity_basis from app_private.upcoming_contributions() c group by c.key,c.ingredient_id,c.reference_state,c.quantity_basis order by c.key;
end$$;
create or replace function app_private.shopping_fingerprint(p_start date,p_end date) returns text language sql security definer set search_path='' as $$
 select md5(jsonb_build_array('upcoming-v1',coalesce((select jsonb_agg(to_jsonb(r) order by r.key) from app_private.shopping_required(p_start,p_end) r),'[]'::jsonb))::text)
$$;
-- Retain the existing reconciler's stable keys, checks, receipts and CAS logic.
alter function app_private.api_shopping_apply(date,date,bigint,text) rename to shopping_apply_v4_base;
create function app_private.api_shopping_apply(p_start date,p_end date,p_revision bigint,p_fingerprint text) returns void language plpgsql security definer set search_path='' as $$
declare s date;e date;f text;u uuid:=app_private.actor();begin
 f:=app_private.shopping_fingerprint(p_start,p_end); -- validate legacy arguments
 if (select content_revision from public.shopping_list where id) is distinct from p_revision or f is distinct from p_fingerprint then raise exception 'stale_shopping';end if;
 select min(day),max(day) into s,e from public.meal_plans where day>=(app_private.operation_now() at time zone 'UTC')::date-1 and app_private.shopping_cutoff(day)>app_private.operation_now();
 s:=coalesce(s,(select start_date from public.shopping_list where id),app_private.today(u));e:=coalesce(e,s);
 if exists(select 1 from public.shopping_list where id and start_date=s and end_date=e and applied_fingerprint=f) then return;end if;
 perform app_private.shopping_apply_v4_base(s,e,p_revision,p_fingerprint);
end$$;
-- SQL wrappers bind OIDs: replace every caller of the renamed reconciler.
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','app_private') and p.proname in('api_shopping_range','sync_menu_shopping','apply_shopping_list') loop
  definition:=pg_get_functiondef(f.oid);definition:=replace(definition,'app_private.shopping_apply_v4_base(', 'app_private.api_shopping_apply(');execute definition;
 end loop;
end$$;
create or replace function app_private.sync_menu_shopping() returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();s date;e date;f text;begin
 select min(day),max(day) into s,e from public.meal_plans where day>=(app_private.operation_now() at time zone 'UTC')::date-1 and app_private.shopping_cutoff(day)>app_private.operation_now();
 s:=coalesce(s,(select start_date from public.shopping_list where id),app_private.today(u));e:=coalesce(e,s);
 f:=app_private.shopping_fingerprint(s,e);
 if exists(select 1 from public.shopping_list where id and start_date=s and end_date=e and applied_fingerprint=f) then return;end if;
 perform app_private.api_shopping_apply(s,e,(select content_revision from public.shopping_list where id),f);
end$$;
-- A planning read returns the revision after any initial list repair.
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_private.library()'::regprocedure);
 if position('perform app_private.sync_menu_shopping();' in definition)=0 then
  definition:=replace(definition,'perform app_private.close_due();','perform app_private.sync_menu_shopping();perform app_private.close_due();');execute definition;
 end if;
end$$;
-- Ensure old check RPCs reconcile expiry before acknowledging a removed row.
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_private.api_shopping_check(uuid,uuid,boolean)'::regprocedure);
 if position('perform app_private.sync_menu_shopping();' in definition)=0 then
  definition:=replace(definition,'begin','begin perform app_private.sync_menu_shopping();');execute definition;
 end if;
end$$;
alter function app_private.api_shopping_state() rename to shopping_state_v4_base;
create function app_private.api_shopping_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;settings jsonb;daily jsonb;items jsonb;begin
 s:=app_private.shopping_state_v4_base();settings:=app_private.purchasing_settings();
 select coalesce(jsonb_agg(jsonb_build_object('day',d.day,'cutoff',d.cutoff,'items',d.items) order by d.day),'[]') into daily
 from (select c.day,c.cutoff,jsonb_agg(to_jsonb(c)-'day'-'cutoff' order by c.key) items from app_private.upcoming_contributions() c group by c.day,c.cutoff) d;
 select coalesce(jsonb_agg(item||case when setting is null then '{}'::jsonb else jsonb_build_object('purchasing_unit',setting) end),'[]') into items
 from jsonb_array_elements(s->'items') item left join lateral (select value setting from jsonb_array_elements(settings) where item->>'source'='generated' and value->>'ingredient_id'=item->>'ingredient_id' and value->>'reference_state'=item->>'reference_state' and value->>'quantity_basis'=item->>'quantity_basis') cfg on true;
 return s||jsonb_build_object('scope','upcoming','contributions_complete',true,'contributions',daily,'purchasing',settings,'items',items);
end$$;
create or replace function public.get_shopping_state(p_household_id uuid,p_membership_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform app_private.assert_context(p_household_id,p_membership_id);return app_private.api_shopping_state();
end$$;
-- Retarget enriched snapshots as well as public shopping reads to the new state OID.
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname='api_snapshot' loop
  definition:=pg_get_functiondef(f.oid);definition:=replace(definition,'app_private.shopping_state_v4_base()', 'app_private.api_shopping_state()');execute definition;
 end loop;
end$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in('purchasing_settings','api_purchasing','upcoming_contributions','shopping_required','shopping_fingerprint','api_shopping_apply','sync_menu_shopping','api_shopping_state') loop
  execute format('alter function %s owner to week_menu_executor',f.signature);execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end$$;
revoke all on function app_private.shopping_state_v4_base(),app_private.shopping_apply_v4_base(date,date,bigint,text) from public,anon,authenticated;
grant execute on function app_private.api_shopping_apply(date,date,bigint,text),app_private.api_shopping_state(),app_private.api_purchasing(uuid,uuid,numeric,integer) to authenticated;
create function public.save_egg_purchasing_unit(p_household_id uuid,p_membership_id uuid,p_grams_per_egg numeric,p_revision integer) returns void language sql security invoker set search_path='' as $$select app_private.api_purchasing(p_household_id,p_membership_id,p_grams_per_egg,p_revision)$$;
revoke all on function public.save_egg_purchasing_unit(uuid,uuid,numeric,integer) from public,anon;
grant execute on function public.save_egg_purchasing_unit(uuid,uuid,numeric,integer) to authenticated;
revoke create on schema app_private from week_menu_executor;
notify pgrst,'reload schema';
commit;
