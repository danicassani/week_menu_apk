-- Reconcile automatic shopping from one trusted projection per operation.
-- Preserve household authorization, atomic menu saves, CAS and checkbox semantics.
begin;
grant create on schema app_private to week_menu_executor;
-- A batch only needs the previous versions of its own slots, not a JSON copy
-- of every historical recipe snapshot retained by the household.
do $patch$declare definition text;pattern text:='into[[:space:]]+previous[[:space:]]+from[[:space:]]+public[.]meal_plans[[:space:]]*;';matches integer;begin
 definition:=pg_get_functiondef('app_private.api_apply_plans(jsonb,bigint,boolean)'::regprocedure);
 select count(*) into matches from regexp_matches(definition,pattern,'gi');
 if matches<>1 then raise exception 'planning_performance_definition_mismatch: api_apply_plans (matches %)',matches;end if;
 definition:=regexp_replace(definition,pattern,'into previous from public.meal_plans x where exists(select 1 from jsonb_array_elements(batch) y where (y->>''day'')::date=x.day and y->>''type''=x.meal_type);','i');
 execute definition;
end$patch$;
-- This predicate is invariant within a statement; avoid verifying Google membership
-- again for every row of the common catalogue.
alter policy starter_read on app_private.starter_content using ((select app_private.is_member()));
create or replace function app_private.upcoming_contributions() returns table(day date,cutoff timestamptz,key text,ingredient_id text,name jsonb,quantity numeric,unit text,reference_state text,quantity_basis text)
language sql security definer set search_path='' as $$
 with dates as materialized (
  select d.day,app_private.shopping_cutoff(d.day) cutoff
  from (select distinct m.day from public.meal_plans m where m.day>=(app_private.operation_now() at time zone 'UTC')::date-1) d
 ), active_dates as materialized (
  select d.day,d.cutoff from dates d where d.cutoff>app_private.operation_now()
 ), lines as (
  select m.day,d.cutoff,l,coalesce(l->>'reference_state',v.state) state,
   coalesce(l->>'quantity_basis',v.basis) basis,coalesce(l->>'shopping_policy',v.policy) policy
  from active_dates d join public.meal_plans m on m.day=d.day
  cross join lateral jsonb_array_elements(m.data->'portions') p
  cross join lateral jsonb_array_elements(p->'lines') l
  left join app_private.resolved_food_references v on v.ingredient_id=l->>'ingredient_id' and v.revision=(l->>'nutrition_revision')::integer
  where p->>'eating_out'<>'true'
 )
 select day,cutoff,jsonb_build_array(l->>'ingredient_id',state,basis)::text,l->>'ingredient_id',
  (jsonb_agg(l->'name'))->0,sum((l->>'grams')::numeric),'g',state,basis
 from lines where policy='include' group by day,cutoff,l->>'ingredient_id',state,basis having sum((l->>'grams')::numeric)>0
$$;
create or replace function app_private.shopping_required(p_start date,p_end date) returns table(key text,ingredient_id text,name jsonb,quantity numeric,unit text,reference_state text,quantity_basis text)
language plpgsql security definer set search_path='' as $$
declare contributions jsonb;begin
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_start>p_end then raise exception 'invalid_shopping_range';end if;
 select coalesce(jsonb_agg(to_jsonb(c)),'[]') into contributions from app_private.upcoming_contributions() c;
 if exists(select 1 from jsonb_array_elements(contributions) c where c->>'reference_state' is null or c->>'quantity_basis' is null) then raise exception 'missing_shopping_reference';end if;
 return query select c.key,c.ingredient_id,(jsonb_agg(c.name order by c.day desc))->0,sum(c.quantity),'g',c.reference_state,c.quantity_basis
 from jsonb_to_recordset(contributions) c(day date,key text,ingredient_id text,name jsonb,quantity numeric,reference_state text,quantity_basis text)
 group by c.key,c.ingredient_id,c.reference_state,c.quantity_basis order by c.key;
end$$;
-- Private helpers accept only internally computed data. They are not granted to
-- application roles, and never use caller-controlled session settings as a cache.
create function app_private.shopping_projection() returns jsonb
language plpgsql security definer set search_path='' as $$
declare s date;e date;required jsonb;begin
 select min(d.day),max(d.day) into s,e from (select distinct day from public.meal_plans where day>=(app_private.operation_now() at time zone 'UTC')::date-1) d where app_private.shopping_cutoff(d.day)>app_private.operation_now();
 s:=coalesce(s,(select start_date from public.shopping_list where id),app_private.today(app_private.current_membership()));e:=coalesce(e,s);
 select coalesce(jsonb_agg(to_jsonb(r) order by r.key),'[]') into required from app_private.shopping_required(s,e) r;
 return jsonb_build_object('start_date',s,'end_date',e,'required',required,'fingerprint',md5(jsonb_build_array('upcoming-v1',required)::text));
end$$;
create function app_private.reconcile_shopping_projection(projection jsonb,expected bigint) returns void
language plpgsql security definer set search_path='' as $$
declare item record;required jsonb:=projection->'required';fingerprint text:=projection->>'fingerprint';s date:=(projection->>'start_date')::date;e date:=(projection->>'end_date')::date;begin
 if (select content_revision from public.shopping_list where id) is distinct from expected then raise exception 'stale_shopping';end if;
 if exists(select 1 from public.shopping_list where id and start_date=s and end_date=e and applied_fingerprint=fingerprint) then return;end if;
 delete from public.shopping_items i where i.source='generated' and not exists(select 1 from jsonb_array_elements(required) r where r->>'key'=i.key);
 for item in select * from jsonb_to_recordset(required) r(key text,ingredient_id text,name jsonb,quantity numeric,unit text,reference_state text,quantity_basis text) loop
  insert into public.shopping_items(source,key,ingredient_id,name,quantity,unit,reference_state,quantity_basis)
  values('generated',item.key,item.ingredient_id,item.name,item.quantity,item.unit,item.reference_state,item.quantity_basis)
  on conflict(household_id,key) do update set name=excluded.name,quantity=excluded.quantity,unit=excluded.unit,reference_state=excluded.reference_state,quantity_basis=excluded.quantity_basis,
   checked=case when excluded.quantity>public.shopping_items.quantity then false else public.shopping_items.checked end,
   increased=excluded.quantity>public.shopping_items.quantity or public.shopping_items.increased,
   checked_revision=public.shopping_items.checked_revision+case when excluded.quantity>public.shopping_items.quantity then 1 else 0 end,
   content_revision=public.shopping_items.content_revision+1;
 end loop;
 update public.shopping_list set start_date=s,end_date=e,applied_fingerprint=fingerprint,content_revision=content_revision+1 where id;
 perform app_private.bump();
end$$;
create or replace function app_private.sync_menu_shopping() returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();projection jsonb;begin
 projection:=app_private.shopping_projection();
 perform app_private.reconcile_shopping_projection(projection,(select content_revision from public.shopping_list where id));
end$$;
create or replace function app_private.api_shopping_apply(p_start date,p_end date,p_revision bigint,p_fingerprint text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();projection jsonb;begin
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_start>p_end then raise exception 'invalid_shopping_range';end if;
 projection:=app_private.shopping_projection();
 if (select content_revision from public.shopping_list where id) is distinct from p_revision or projection->>'fingerprint' is distinct from p_fingerprint then raise exception 'stale_shopping';end if;
 perform app_private.reconcile_shopping_projection(projection,p_revision);
end$$;
alter function app_private.shopping_projection() owner to week_menu_executor;
alter function app_private.reconcile_shopping_projection(jsonb,bigint) owner to week_menu_executor;
revoke all on function app_private.shopping_projection(),app_private.reconcile_shopping_projection(jsonb,bigint) from public,anon,authenticated;
revoke create on schema app_private from week_menu_executor;
notify pgrst,'reload schema';
commit;
