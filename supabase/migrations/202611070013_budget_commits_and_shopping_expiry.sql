-- Version 3 milestone 1. Existing individual budget and shopping APIs remain.
begin;
create table app_private.budget_commits (
 household_id uuid not null default app_private.current_household(),
 member_id uuid not null, operation_id uuid not null, request jsonb not null,
 acknowledgement jsonb not null, created_at timestamptz not null default clock_timestamp(),
 primary key(household_id,member_id,operation_id),
 foreign key(household_id,member_id) references public.members(household_id,id)
);
alter table app_private.budget_commits enable row level security;
create policy budget_commit_executor on app_private.budget_commits for all to week_menu_executor
 using(household_id=(select app_private.current_household()) and member_id=(select app_private.current_membership()))
 with check(household_id=(select app_private.current_household()) and member_id=(select app_private.current_membership()));
revoke all on app_private.budget_commits from public,anon,authenticated;
grant select,insert,delete on app_private.budget_commits to week_menu_executor;
grant create on schema app_private to week_menu_executor;
create function app_private.api_budget_batch(h uuid,m uuid,op uuid,d date,changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; payload jsonb; old app_private.budget_commits%rowtype; field record; ack jsonb;
begin
 perform app_private.assert_context(h,m);u:=app_private.actor();
 if op is null then raise exception 'invalid_budgets';end if;
 payload:=jsonb_build_object('day',d,'changes',changes);
 select * into old from app_private.budget_commits where member_id=u and operation_id=op;
 if found then
  if old.request is distinct from payload then raise exception 'operation_mismatch';end if;
  return old.acknowledgement;
 end if;
 if d is null or not isfinite(d) then raise exception 'day_closed';end if;
 if changes is null or jsonb_typeof(changes)<>'object' then raise exception 'invalid_budgets';end if;
 if (select count(*) from jsonb_object_keys(changes)) not between 1 and 3 then raise exception 'invalid_budgets';end if;
 for field in select key,value from jsonb_each(changes) loop
  if field.key not in('breakfast','lunch','dinner') or jsonb_typeof(field.value) not in('number','null') then raise exception 'invalid_budgets';end if;
  if field.value<>'null'::jsonb and (field.value::text)::numeric<=0 then raise exception 'invalid_budgets';end if;
 end loop;
 for field in select key,value from jsonb_each(changes) order by key loop
  perform app_private.api_budget(d,field.key,case when field.value='null'::jsonb then null else (field.value::text)::numeric end);
 end loop;
 ack:=jsonb_build_object('operation_id',op,'day',d,'revision',(select revision from public.household_revision where id));
 -- Prune old receipts only for personal dates that can no longer be edited.
 -- Keep future-date receipts so a late retry cannot replay over a newer save.
 delete from app_private.budget_commits where member_id=u and created_at<clock_timestamp()-interval '30 days' and (request->>'day')::date<app_private.today(u);
 insert into app_private.budget_commits(member_id,operation_id,request,acknowledgement) values(u,op,payload,ack);
 return ack;
end$$;
alter function app_private.api_budget_batch(uuid,uuid,uuid,date,jsonb) owner to week_menu_executor;
revoke all on function app_private.api_budget_batch(uuid,uuid,uuid,date,jsonb) from public,anon,authenticated;
grant execute on function app_private.api_budget_batch(uuid,uuid,uuid,date,jsonb) to authenticated;
create function public.save_my_meal_budgets(p_household_id uuid,p_membership_id uuid,p_operation uuid,p_day date,p_changes jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select app_private.api_budget_batch(p_household_id,p_membership_id,p_operation,p_day,p_changes) $$;
revoke all on function public.save_my_meal_budgets(uuid,uuid,uuid,date,jsonb) from public,anon;
grant execute on function public.save_my_meal_budgets(uuid,uuid,uuid,date,jsonb) to authenticated;
create function app_private.shopping_cutoff(d date) returns timestamptz
language sql security definer set search_path='' as $$
 select case when exists(select 1 from public.meal_date_locks where day=d and closed) then '-infinity'::timestamptz
 else least((select cutoff from public.meal_date_locks where day=d),
 (select min(app_private.cutoff(d,time_zone)) from public.members where status='active')) end
$$;
alter function app_private.shopping_cutoff(date) owner to week_menu_executor;
revoke all on function app_private.shopping_cutoff(date) from public,anon,authenticated;
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_private.shopping_required(date,date)'::regprocedure);
 if definition not like '%where m.day between p_start and p_end%' then raise exception 'shopping_definition_mismatch';end if;
 definition:=replace(definition,'where m.day between p_start and p_end',
  'where m.day between p_start and p_end and app_private.shopping_cutoff(m.day)>app_private.operation_now()');
 execute definition;
 definition:=pg_get_functiondef('app_private.api_shopping_state()'::regprocedure);
 if definition not like '%''observation_revision''%' then raise exception 'shopping_definition_mismatch';end if;
 definition:=replace(definition,'''observation_revision'',',
  '''observed_at'',app_private.operation_now(),''valid_until'',(select min(app_private.shopping_cutoff(day)) from public.meal_plans where day between s.start_date and s.end_date and app_private.shopping_cutoff(day)>app_private.operation_now()),''observation_revision'',');
 execute definition;
end$$;
revoke create on schema app_private from week_menu_executor;
notify pgrst,'reload schema';
commit;
