-- Automatic shopping reconciliation is part of the menu transaction.
begin;
grant create on schema app_private to week_menu_executor;
create function app_private.sync_menu_shopping() returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); d date; s date; e date; w integer; f text;begin
 select start_date,end_date into s,e from public.shopping_list where id;
 if s is null then
  select min(day) into d from public.meal_plans where day>=app_private.today(u);
  if d is null then return;end if;
  select week_start into w from public.household where id;
  s:=d-((extract(dow from d)::integer-w+7)%7);e:=s+6;
 end if;
 f:=app_private.shopping_fingerprint(s,e);
 if exists(select 1 from public.shopping_list where id and start_date=s and end_date=e and applied_fingerprint=f) then return;end if;
 perform app_private.api_shopping_apply(s,e,
  (select content_revision from public.shopping_list where id),f);
end$$;

-- Repair an already saved menu on load, before capturing its revision. Equal
-- fingerprints are no-ops, preventing refresh/Realtime invalidation loops.
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_private.api_snapshot()'::regprocedure);
 definition:=replace(definition,'s:=app_private.scoped_snapshot_base();','perform app_private.sync_menu_shopping(); s:=app_private.scoped_snapshot_base();');
 execute definition;
 definition:=pg_get_functiondef('app_private.api_shopping_state()'::regprocedure);
 definition:=replace(definition,'select * into s from public.shopping_list where id;','perform app_private.sync_menu_shopping(); select * into s from public.shopping_list where id;');
 execute definition;
end$$;
alter function app_private.sync_menu_shopping() owner to week_menu_executor;
revoke all on function app_private.sync_menu_shopping() from public,anon,authenticated;

-- Existing validation/CAS and nutritional arithmetic remain authoritative.
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='app_private' and p.proname in('api_apply_plans','api_save_content','api_delete_meal','api_remove') loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'perform app_private.bump();','perform app_private.bump(); perform app_private.sync_menu_shopping();');
  execute definition;
 end loop;
end$$;

create function app_private.api_delete_week(p_start date,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor(); d date;begin
 if p_start is null or not isfinite(p_start) then raise exception 'day_closed';end if;
 if (select revision from public.household_revision where id) is distinct from p_revision then raise exception 'stale_plan';end if;
 perform app_private.close_due();
 for d in select distinct day from public.meal_plans where day between p_start and p_start+6 loop
  if not exists(select 1 from public.meal_date_locks where day=d and closed)
   and (select min(app_private.cutoff(d,time_zone)) from public.members where status='active')>app_private.operation_now() then
   perform app_private.guard_meal_day(d);
   delete from public.meal_plans where day=d;
  end if;
 end loop;
 perform app_private.bump();perform app_private.sync_menu_shopping();
end$$;
alter function app_private.api_delete_week(date,bigint) owner to week_menu_executor;
revoke all on function app_private.api_delete_week(date,bigint) from public,anon;
grant execute on function app_private.api_delete_week(date,bigint) to authenticated;
create function public.delete_planned_week(p_household_id uuid,p_membership_id uuid,p_start date,p_revision bigint) returns void
language plpgsql security invoker set search_path='' as $$begin
 perform app_private.assert_context(p_household_id,p_membership_id);
 perform app_private.api_delete_week(p_start,p_revision);
end$$;
revoke all on function public.delete_planned_week(uuid,uuid,date,bigint) from public,anon;
grant execute on function public.delete_planned_week(uuid,uuid,date,bigint) to authenticated;
notify pgrst,'reload schema';
revoke create on schema app_private from week_menu_executor;
commit;
