-- V2 milestone 1: migrate the existing household without resetting its history.
-- Run as the migration administrator, in one transaction. Existing public writes
-- become context-bound; deploy the matching client after this migration.
begin;

-- The executor owns functions, never tables, and cannot bypass row security.
-- This makes every existing calculation/query obey the same tenant boundary.
create role week_menu_executor nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant week_menu_executor to postgres;
grant usage on schema public, app_private, auth to week_menu_executor;
grant create on schema app_private to week_menu_executor;
grant execute on function auth.uid() to week_menu_executor;

-- Fresh installations must bootstrap the initial owner using migrations 1--5
-- first. Do not guess ownership or publish the current household as starter data.
do $$begin
  if (select count(*) from public.household) <> 1 then
    raise exception 'initialize_legacy_household_before_v2';
  end if;
end$$;

alter table public.household add column household_id uuid not null default gen_random_uuid();
alter table public.household add column legacy_origin boolean not null default false;
update public.household set legacy_origin=true;
alter table public.household drop constraint household_pkey;
alter table public.household add primary key (household_id,id);
alter table public.household add unique (household_id);
alter table public.household alter column legacy_origin set default false;

alter table public.members drop constraint members_id_fkey;
alter table public.members add column user_id uuid references auth.users(id);
update public.members set user_id=id;
alter table public.members alter column user_id set not null;
create unique index one_active_household_per_account on public.members(user_id) where status='active';
alter table public.household drop constraint household_owner_id_fkey;
alter table public.household add constraint household_owner_id_fkey foreign key(owner_id) references public.members(id) deferrable initially deferred;

-- Add an immutable tenant key to every private record, including history and
-- idempotency receipts. Backfill all live rows into the original household.
do $$declare t regclass; h uuid;begin
  select household_id into h from public.household;
  foreach t in array array[
    'public.members'::regclass,'public.approved_emails','public.profiles',
    'app_private.profile_versions','public.targets','public.daily_entries',
    'public.personal_days','public.meal_date_locks','public.budget_overrides',
    'public.household_revision','public.food_items','public.saved_recipes',
    'app_private.content_versions','public.meal_plans','public.substitution_rules',
    'public.recipe_prompt_preferences','public.shopping_list','public.shopping_items',
    'app_private.shopping_receipts','app_private.food_reference_versions'
  ] loop
    execute format('alter table %s add column household_id uuid',t);
    execute format('update %s set household_id=$1',t) using h;
    execute format('alter table %s alter column household_id set not null',t);
    execute format('alter table %s add foreign key(household_id) references public.household(household_id)',t);
    execute format('create index on %s(household_id)',t);
  end loop;
end$$;

alter table public.members add unique(household_id,id);
alter table public.approved_emails drop constraint approved_emails_pkey;
alter table public.approved_emails add primary key(household_id,email);
alter table public.approved_emails add column invitation_id uuid not null default gen_random_uuid() unique;
alter table public.household_revision drop constraint household_revision_pkey;
alter table public.household_revision add primary key(household_id,id);
alter table public.meal_date_locks drop constraint meal_date_locks_pkey;
alter table public.meal_date_locks add primary key(household_id,day);
alter table public.meal_plans drop constraint meal_plans_pkey;
alter table public.meal_plans add primary key(household_id,day,meal_type);
alter table public.shopping_list drop constraint shopping_list_pkey;
alter table public.shopping_list add primary key(household_id,id);
alter table public.shopping_items drop constraint shopping_items_ingredient_id_fkey;
alter table app_private.food_reference_versions drop constraint food_reference_versions_ingredient_id_fkey;
alter table public.food_items drop constraint food_items_pkey;
alter table public.food_items add primary key(household_id,id);
alter table public.saved_recipes drop constraint saved_recipes_pkey;
alter table public.saved_recipes add primary key(household_id,id);
alter table public.substitution_rules drop constraint substitution_rules_pkey;
alter table public.substitution_rules add primary key(household_id,id);
alter table public.shopping_items drop constraint shopping_items_key_key;
alter table public.shopping_items add unique(household_id,key);
alter table public.shopping_items add foreign key(household_id,ingredient_id) references public.food_items(household_id,id);
alter table app_private.food_reference_versions drop constraint food_reference_versions_pkey;
alter table app_private.food_reference_versions add primary key(household_id,ingredient_id,revision);
alter table app_private.food_reference_versions add foreign key(household_id,ingredient_id) references public.food_items(household_id,id);

-- Relationship constraints also protect against cross-household references in
-- trusted code; authorization must not rely solely on frontend filtering.
do $$declare t regclass;begin
  foreach t in array array['public.profiles'::regclass,'app_private.profile_versions',
    'public.targets','public.daily_entries','public.personal_days',
    'public.budget_overrides','public.recipe_prompt_preferences','app_private.shopping_receipts'] loop
    execute format('alter table %s add foreign key(household_id,member_id) references public.members(household_id,id)',t);
  end loop;
end$$;
alter table public.household add constraint owner_in_same_household foreign key(household_id,owner_id) references public.members(household_id,id) deferrable initially deferred;

-- These two small lookup functions deliberately retain administrator ownership:
-- they resolve the JWT account, never a caller-supplied tenant or custom GUC.
create function app_private.current_membership() returns uuid
language sql stable security definer set search_path='' as $$
 select m.id from public.members m join auth.users u on u.id=m.user_id
 where m.user_id=auth.uid() and m.status='active'
 and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google'
 and exists(select 1 from public.approved_emails a where a.household_id=m.household_id
   and a.email=lower(trim(u.email)) and not a.revoked)
$$;
create function app_private.current_household() returns uuid
language sql stable security definer set search_path='' as $$
 select household_id from public.members where id=app_private.current_membership()
$$;
create or replace function app_private.is_member() returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.current_membership() is not null
$$;
create or replace function app_private.actor() returns uuid
language plpgsql security definer set search_path='' as $$
declare m uuid:=app_private.current_membership();begin
 if m is null then raise exception 'access_denied';end if;
 perform 1 from public.household where id for update;
 if m is distinct from app_private.current_membership() then raise exception 'access_denied';end if;
 perform set_config('app_private.operation_now',clock_timestamp()::text,true);
 return m;
end$$;
create function app_private.assert_context(p_household_id uuid,p_membership_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m uuid:=app_private.actor();begin
 if p_household_id is distinct from app_private.current_household() or p_membership_id is distinct from m
 then raise exception 'membership_changed';end if;
end$$;

do $$declare t regclass; pol record;begin
  foreach t in array array['public.household'::regclass,'public.members','public.approved_emails',
    'public.profiles','app_private.profile_versions','public.targets','public.daily_entries',
    'public.personal_days','public.meal_date_locks','public.budget_overrides','public.household_revision',
    'public.food_items','public.saved_recipes','app_private.content_versions','public.meal_plans',
    'public.substitution_rules','public.recipe_prompt_preferences','public.shopping_list',
    'public.shopping_items','app_private.shopping_receipts','app_private.food_reference_versions'] loop
    for pol in select polname from pg_policy where polrelid=t loop
      execute format('drop policy %I on %s',pol.polname,t);
    end loop;
    execute format('alter table %s enable row level security',t);
    execute format('create policy household_read on %s for select to authenticated using (household_id=(select app_private.current_household()))',t);
    execute format('create policy household_execution on %s for all to week_menu_executor using (household_id=(select app_private.current_household())) with check (household_id=(select app_private.current_household()))',t);
    execute format('grant select,insert,update,delete on %s to week_menu_executor',t);
    if t<>'public.household'::regclass then
      execute format('alter table %s alter column household_id set default app_private.current_household()',t);
    end if;
  end loop;
end$$;
grant select on public.activity_catalogue to week_menu_executor;
create policy executor_activity_read on public.activity_catalogue for select to week_menu_executor using (true);

-- Compound keys replace the old singleton conflict targets. Keep the existing
-- calculation bodies unchanged, and recompile them against the new keys.
do $$declare f record; definition text;begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app_private' and p.proname in('api_save_content','api_apply_plans','api_shopping_apply','capture_food_reference','api_shopping_check') loop
  definition:=pg_get_functiondef(f.oid);
  if f.proname='api_save_content' then definition:=replace(definition,'on conflict(id)','on conflict(household_id,id)');end if;
  if f.proname='api_apply_plans' then definition:=replace(definition,'on conflict(day,meal_type)','on conflict(household_id,day,meal_type)');end if;
  if f.proname='api_shopping_apply' then definition:=replace(definition,'on conflict(key)','on conflict(household_id,key)');end if;
  if f.proname='capture_food_reference' then definition:=replace(definition,'food_reference_versions values(','food_reference_versions(ingredient_id,revision,state,basis,policy) values(');end if;
  if f.proname='api_shopping_check' then definition:=replace(definition,'shopping_receipts values(','shopping_receipts(member_id,operation_id,item_id,desired,ack) values(');end if;
  execute definition;
 end loop;
end$$;

create or replace function app_private.api_bootstrap(p_timezone text) returns void
language plpgsql security definer set search_path='' as $$
declare m uuid:=app_private.actor(); z text;begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid_timezone';end if;
 perform app_private.close_due();
 select time_zone into z from public.members where id=m;
 if z<>p_timezone then
  update public.members set time_zone=p_timezone where id=m;
  update public.personal_days set cutoff=app_private.cutoff(day,p_timezone) where member_id=m and not closed;
  update public.meal_date_locks l set cutoff=(select min(app_private.cutoff(l.day,x.time_zone)) from public.members x where x.status='active') where not closed;
  perform app_private.close_due();perform app_private.bump();
 end if;
end$$;

create or replace function app_private.api_invite(p_email text) returns void
language plpgsql security definer set search_path='' as $$declare m uuid:=app_private.require_owner();begin
 if p_email is null or trim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email';end if;
 insert into public.approved_emails(email,invited_by) values(lower(trim(p_email)),auth.uid())
 on conflict(household_id,email) do update set revoked=false,invited_by=excluded.invited_by;
 perform app_private.bump();
end$$;

-- Remove/leave must resolve the auth account from membership, not assume the
-- retained membership UUID is the auth account UUID after a later join.
create or replace function app_private.api_remove(p_member uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.require_owner(); d date;begin
 if p_member=u then raise exception 'transfer_before_leaving';end if;
 if not exists(select 1 from public.members where id=p_member and status='active') then raise exception 'invalid_member';end if;
 perform app_private.close_due();d:=app_private.today(p_member);
 delete from public.budget_overrides r where r.member_id=p_member and r.day>d and not exists(select 1 from public.meal_date_locks l where l.day=r.day and l.closed);
 delete from public.targets r where r.member_id=p_member and r.effective_date>d and not exists(select 1 from public.personal_days l where l.day=r.effective_date and l.member_id=p_member and l.closed);
 delete from public.daily_entries r where r.member_id=p_member and r.day>d and not exists(select 1 from public.personal_days l where l.day=r.day and l.member_id=p_member and l.closed);
 delete from public.personal_days where member_id=p_member and day>d and not closed;
 update public.members set status='removed',removed_at=app_private.operation_now() where id=p_member;
 update public.meal_date_locks l set cutoff=(select min(app_private.cutoff(l.day,m.time_zone)) from public.members m where m.status='active') where not closed;
 perform app_private.close_due();perform app_private.bump();
end$$;
create or replace function app_private.api_leave() returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();d date;begin
 if exists(select 1 from public.household where owner_id=u) then raise exception 'transfer_before_leaving';end if;
 perform app_private.close_due();d:=app_private.today(u);
 delete from public.budget_overrides r where r.member_id=u and r.day>d and not exists(select 1 from public.meal_date_locks l where l.day=r.day and l.closed);
 delete from public.targets r where r.member_id=u and r.effective_date>d and not exists(select 1 from public.personal_days l where l.day=r.effective_date and l.member_id=u and l.closed);
 delete from public.daily_entries r where r.member_id=u and r.day>d and not exists(select 1 from public.personal_days l where l.day=r.day and l.member_id=u and l.closed);
 delete from public.personal_days where member_id=u and day>d and not closed;
 update public.meal_date_locks l set cutoff=(select min(app_private.cutoff(l.day,m.time_zone)) from public.members m where m.status='active' and m.id<>u) where not closed;
 perform app_private.close_due();perform app_private.bump();
 -- Last statement revokes our own RLS context. The cleanup trigger below uses
 -- only NEW.household_id and NEW.id, never a global query or caller context.
 update public.members set status='removed',removed_at=app_private.operation_now() where id=u;
end$$;
create or replace function app_private.remove_departing_portions() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if old.status='active' and new.status='removed' then
  update public.approved_emails a set revoked=true where a.household_id=new.household_id
   and a.email=(select lower(trim(email)) from auth.users where id=new.user_id);
  update public.meal_plans m set data=jsonb_set(m.data,'{portions}',coalesce((select jsonb_agg(p) from jsonb_array_elements(m.data->'portions') p where p->>'member_id'<>new.id::text),'[]'::jsonb)),revision=revision+1
   where m.household_id=new.household_id and exists(select 1 from public.meal_date_locks l where l.household_id=new.household_id and l.day=m.day and not l.closed);
 end if;return new;
end$$;

-- New-account lifecycle is explicit. Discovering invitations never joins one.
create function app_private.verified_account() returns auth.users
language plpgsql security definer set search_path='' as $$declare u auth.users;begin
 select * into u from auth.users where id=auth.uid() and email_confirmed_at is not null and raw_app_meta_data->>'provider'='google';
 if u.id is null then raise exception 'google_identity_required';end if;return u;
end$$;
create function public.get_household_access() returns jsonb
language plpgsql security definer set search_path='' as $$declare u auth.users; m public.members;begin
 u:=app_private.verified_account();
 select * into m from public.members where id=app_private.current_membership();
 return jsonb_build_object('active',case when m.id is null then null else jsonb_build_object(
  'household_id',m.household_id,'membership_id',m.id,'account_id',u.id,
  'legacy_binding',m.id=u.id and (select legacy_origin from public.household where household_id=m.household_id)) end,
  'invitations',case when m.id is not null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
   'id',a.invitation_id,'household_name',h.name) order by h.name,a.invitation_id)
   from public.approved_emails a join public.household h on h.household_id=a.household_id
   where a.email=lower(trim(u.email)) and not a.revoked),'[]'::jsonb) end);
end$$;
create function public.create_household(p_name text,p_timezone text) returns void
language plpgsql security definer set search_path='' as $$
declare u auth.users;h uuid:=gen_random_uuid();m uuid:=gen_random_uuid();begin
 u:=app_private.verified_account();
 -- Serialize create/join for this account; the partial unique index is also a
 -- final constraint if requests race with removal or other lifecycle changes.
 perform pg_advisory_xact_lock(hashtextextended(u.id::text,0));
 if exists(select 1 from public.members where user_id=u.id and status='active') then raise exception 'already_in_household';end if;
 if coalesce(length(trim(p_name)),0) not between 1 and 80 then raise exception 'invalid_household_name';end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid_timezone';end if;
 insert into public.household(household_id,name,owner_id) values(h,trim(p_name),m);
 insert into public.members(id,user_id,household_id,name,status,time_zone) values(m,u.id,h,left(coalesce(nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1)),80),'active',p_timezone);
 insert into public.approved_emails(household_id,email,invited_by) values(h,lower(trim(u.email)),u.id);
 insert into public.household_revision(household_id) values(h);
 insert into public.shopping_list(household_id) values(h);
end$$;
create function public.join_household(p_invitation uuid,p_timezone text) returns void
language plpgsql security definer set search_path='' as $$
declare u auth.users;a public.approved_emails;m uuid:=gen_random_uuid();begin
 u:=app_private.verified_account();perform pg_advisory_xact_lock(hashtextextended(u.id::text,0));
 if exists(select 1 from public.members where user_id=u.id and status='active') then raise exception 'already_in_household';end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid_timezone';end if;
 select * into a from public.approved_emails where invitation_id=p_invitation and email=lower(trim(u.email)) and not revoked;
 if a.invitation_id is null then raise exception 'invalid_invitation';end if;
 perform 1 from public.household where household_id=a.household_id for update;
 -- Recheck after waiting for a concurrent owner removal/invitation update.
 if not exists(select 1 from public.approved_emails where invitation_id=p_invitation and email=lower(trim(u.email)) and not revoked) then raise exception 'invalid_invitation';end if;
 perform set_config('app_private.operation_now',clock_timestamp()::text,true);
 -- Freeze the old roster's expired dates before introducing a new timezone.
 update public.meal_date_locks set closed=true where household_id=a.household_id and not closed and cutoff<=clock_timestamp();
 insert into public.members(id,user_id,household_id,name,status,time_zone) values(m,u.id,a.household_id,left(coalesce(nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1)),80),'active',p_timezone);
 update public.meal_date_locks l set cutoff=(select min(app_private.cutoff(l.day,x.time_zone)) from public.members x where x.household_id=a.household_id and x.status='active') where l.household_id=a.household_id and not l.closed;
 update public.meal_date_locks set closed=true where household_id=a.household_id and not closed and cutoff<=clock_timestamp();
 update public.household_revision set revision=revision+1 where household_id=a.household_id;
 -- Existing meals deliberately retain their participants until explicitly replanned.
end$$;

-- Snapshot provenance is also the offline/cache scope. Preserve all old IDs and
-- calculation snapshots; a new join gets a distinct membership UUID.
alter function app_private.api_snapshot() rename to scoped_snapshot_base;
create function app_private.api_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$declare s jsonb;begin
 s:=app_private.scoped_snapshot_base();
 return s||jsonb_build_object('household',(s->'household')||jsonb_build_object('id',app_private.current_household()),
  'context',jsonb_build_object('account_id',auth.uid(),'household_id',app_private.current_household(),'membership_id',app_private.current_membership(),
    'legacy_binding',app_private.current_membership()=auth.uid() and (select legacy_origin from public.household where id)));
end$$;

-- Run application functions with RLS. Only the audited identity/lifecycle and
-- departure-trigger functions above keep administrator ownership.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='app_private' loop
  execute format('grant execute on function %s to week_menu_executor',f.signature);
  if f.proname not in('current_membership','current_household','verified_account','remove_departing_portions','configure_owner') then
   execute format('alter function %s owner to week_menu_executor',f.signature);
  end if;
 end loop;
end$$;
revoke create on schema app_private from week_menu_executor;
revoke all on function app_private.current_membership(),app_private.current_household(),app_private.assert_context(uuid,uuid),app_private.verified_account(),app_private.scoped_snapshot_base(),app_private.api_snapshot() from public,anon,authenticated;
grant execute on function app_private.current_membership(),app_private.current_household(),app_private.assert_context(uuid,uuid),app_private.api_snapshot() to authenticated;
revoke all on function public.get_household_access(),public.create_household(text,text),public.join_household(uuid,text) from public,anon;
grant execute on function public.get_household_access(),public.create_household(text,text),public.join_household(uuid,text) to authenticated;

-- Replace existing public API wrappers with required expected-context arguments.
-- An old installed client cannot replay a v1 checkbox into a later membership.
do $$declare f record;call text;args text;result text;statement text;begin
 for f in select p.oid,p.proname,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in(
  'get_household_snapshot','save_my_profile','get_my_target_proposal','accept_my_target',
  'save_my_daily_entry','delete_my_daily_entry','save_my_budget_override','invite_member',
  'transfer_ownership','remove_member','leave_household','get_planning_library',
  'save_household_content','apply_meal_plans','save_planner_settings','save_recipe_prompt_preference',
  'delete_planned_meal','get_shopping_state','preview_shopping_list','apply_shopping_list',
  'set_shopping_checked','save_manual_shopping_item','delete_manual_shopping_item') loop
  args:=pg_get_function_arguments(f.oid);result:=pg_get_function_result(f.oid);
  -- get_household_snapshot must bind the enriched function's new OID.
  call:=case when f.proname='get_household_snapshot' then 'app_private.api_snapshot()'
    else trim(trailing ';' from trim(regexp_replace(f.prosrc,'^\s*select\s+','','i'))) end;
  statement:=case when result='void' then 'perform ' else 'return ' end||call||';';
  execute format('drop function %s',f.oid::regprocedure);
  execute format('create function public.%I(p_household_id uuid,p_membership_id uuid%s) returns %s language plpgsql security invoker set search_path='''' as $body$ begin perform app_private.assert_context(p_household_id,p_membership_id); %s end $body$',f.proname,case when args='' then '' else ','||args end,result,statement);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proargnames @> array['p_household_id','p_membership_id']
 and p.proname in('get_household_snapshot','save_my_profile','get_my_target_proposal','accept_my_target',
  'save_my_daily_entry','delete_my_daily_entry','save_my_budget_override','invite_member',
  'transfer_ownership','remove_member','leave_household','get_planning_library',
  'save_household_content','apply_meal_plans','save_planner_settings','save_recipe_prompt_preference',
  'delete_planned_meal','get_shopping_state','preview_shopping_list','apply_shopping_list',
  'set_shopping_checked','save_manual_shopping_item','delete_manual_shopping_item') loop
  execute format('revoke all on function %s from public,anon',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end$$;

-- The configured v1 owner email is obsolete. Keep its table only for audit and
-- make accidental use of the old configuration entry point fail explicitly.
create or replace function app_private.configure_owner(p_email text) returns void
language plpgsql security definer set search_path='' as $$begin raise exception 'use_household_onboarding';end$$;
notify pgrst, 'reload schema';
commit;
