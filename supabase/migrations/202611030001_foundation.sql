-- Milestone 1. Supabase supplies auth.users, auth.uid(), anon and authenticated.
create schema if not exists app_private;
revoke all on schema app_private from public;
-- Capture the server acceptance time only after acquiring the household lock.
-- Transaction-start now() can predate a wait for that lock or a local midnight.
create function app_private.operation_now() returns timestamptz language sql stable set search_path='' as $$
  select nullif(current_setting('app_private.operation_now',true),'')::timestamptz
$$;

create table app_private.settings (id boolean primary key default true check(id), owner_email text);
insert into app_private.settings(id) values(true);
create table public.household (
  id boolean primary key default true check(id), name text not null default 'Our household',
  owner_id uuid not null references auth.users(id), week_start integer not null default 1 check(week_start in(0,1)),
  variety_days integer not null default 3 check(variety_days>0)
);
create table public.members (
  id uuid primary key references auth.users(id), name text not null, status text not null check(status in('active','removed')),
  time_zone text not null, onboarded boolean not null default false, joined_at timestamptz not null default clock_timestamp(), removed_at timestamptz
);
create table public.approved_emails (email text primary key, revoked boolean not null default false, invited_by uuid references auth.users(id));
create table public.profiles (member_id uuid primary key references public.members(id), data jsonb not null, revision integer not null default 1, updated_at timestamptz not null default clock_timestamp());
create table app_private.profile_versions (id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id), data jsonb not null, revision integer not null, created_at timestamptz not null default clock_timestamp());
create table public.targets (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id), effective_date date not null,
  created_at timestamptz not null default clock_timestamp(), formula_version text not null default 'mifflin-net-met-v1', screening_version text not null default 'v1', inputs jsonb not null, resting_kcal numeric not null, usual_kcal numeric not null,
  deficit_kcal numeric not null, daily_kcal numeric not null check(daily_kcal>1200), budgets jsonb not null
);
create table public.daily_entries (
  id uuid primary key default gen_random_uuid(), member_id uuid not null references public.members(id), day date not null,
  kind text not null check(kind in('food','activity','weight')), description text not null, value numeric not null,
  activity_code text, met numeric, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index daily_entries_member_day on public.daily_entries(member_id,day,updated_at desc);
create index targets_member_date on public.targets(member_id,effective_date,created_at desc);
create table public.personal_days (
  member_id uuid not null references public.members(id), day date not null, cutoff timestamptz not null,
  closed boolean not null default false, snapshot jsonb, primary key(member_id,day)
);
create table public.meal_date_locks (day date primary key, cutoff timestamptz not null, closed boolean not null default false);
create table public.budget_overrides (
  member_id uuid not null references public.members(id), day date not null, meal_type text not null check(meal_type in('breakfast','lunch','dinner')),
  kcal numeric not null check(kcal>0), primary key(member_id,day,meal_type)
);
create table public.activity_catalogue (
  code text primary key, met numeric not null check(met>0), name jsonb not null, group_name jsonb not null,
  source_url text not null, source_description text not null, age_min integer not null, age_max integer not null
);
create table public.household_revision (id boolean primary key default true check(id), revision bigint not null default 0);
insert into public.household_revision(id) values(true);

create function app_private.is_member() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.members m join auth.users u on u.id=m.id join public.approved_emails a on a.email=lower(trim(u.email))
    where m.id=auth.uid() and m.status='active' and not a.revoked and u.email_confirmed_at is not null and u.raw_app_meta_data->>'provider'='google')
$$;
create function app_private.actor() returns uuid language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not app_private.is_member() then raise exception 'access_denied'; end if;
  perform 1 from public.household where id for update;
  perform set_config('app_private.operation_now',clock_timestamp()::text,true);
  return auth.uid();
end $$;
create function app_private.bump() returns void language sql security definer set search_path='' as $$
  update public.household_revision set revision=revision+1 where id
$$;
create function app_private.today(p_member uuid) returns date language sql stable security definer set search_path='' as $$
  select (app_private.operation_now() at time zone time_zone)::date from public.members where id=p_member
$$;
create function app_private.cutoff(p_day date,p_zone text) returns timestamptz language sql immutable set search_path='' as $$
  select (p_day+1)::timestamp at time zone p_zone
$$;
create function app_private.effective_profile(p_member uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select p.data || jsonb_build_object('weight_kg',coalesce((
    select e.value from public.daily_entries e where e.member_id=p.member_id and e.kind='weight' and e.updated_at>p.updated_at order by e.updated_at desc,e.id desc limit 1
  ),(p.data->>'weight_kg')::numeric)) from public.profiles p where p.member_id=p_member
$$;
create function app_private.context(p_member uuid,p_day date) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('calculation_version','mifflin-net-met-v1','profile',app_private.effective_profile(p_member),'target',(
    select to_jsonb(t) from public.targets t where t.member_id=p_member and t.effective_date<=p_day order by t.effective_date desc,t.created_at desc,t.id desc limit 1
  ),'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.daily_entries e where e.member_id=p_member and e.day=p_day),'[]'::jsonb))
$$;
create function app_private.close_due() returns void language plpgsql security definer set search_path='' as $$
begin
  update public.meal_date_locks set closed=true where not closed and cutoff<=app_private.operation_now();
  update public.personal_days d set closed=true,snapshot=app_private.context(d.member_id,d.day) where not closed and cutoff<=app_private.operation_now();
end $$;
create function app_private.ensure_day(p_member uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_day date; v_zone text;
begin
  select time_zone into v_zone from public.members where id=p_member;
  v_day:=app_private.today(p_member);
  insert into public.personal_days(member_id,day,cutoff) values(p_member,v_day,app_private.cutoff(v_day,v_zone)) on conflict do nothing;
  if exists(select 1 from public.personal_days where member_id=p_member and day=v_day and closed) then raise exception 'day_closed'; end if;
end $$;
create function app_private.configure_owner(p_email text) returns void language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.household) then raise exception 'household_already_initialized'; end if;
  if p_email is null or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
  update app_private.settings set owner_email=lower(trim(p_email)) where id;
end $$;

create function app_private.api_bootstrap(p_timezone text) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_email text; v_name text; v_config text; v_zone text; v_status text;
begin
  if v_uid is null then raise exception 'access_denied'; end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'invalid_timezone'; end if;
  select lower(trim(email)),left(coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1)),80)
  into v_email,v_name from auth.users where id=v_uid and email_confirmed_at is not null
    and (raw_app_meta_data->>'provider'='google');
  if v_email is null then raise exception 'google_identity_required'; end if;
  select owner_email into v_config from app_private.settings where id for update;
  if not exists(select 1 from public.household) then
    if v_config is null then raise exception 'household_not_configured'; end if;
    if v_email<>v_config then raise exception 'access_denied'; end if;
    insert into public.household(owner_id) values(v_uid);
    insert into public.approved_emails(email,invited_by) values(v_email,v_uid);
  end if;
  if not exists(select 1 from public.approved_emails where email=v_email and not revoked) then raise exception 'access_denied'; end if;
  select status,time_zone into v_status,v_zone from public.members where id=v_uid;
  perform 1 from public.household where id for update;
  perform set_config('app_private.operation_now',clock_timestamp()::text,true);
  perform app_private.close_due();
  if v_status is null then
    insert into public.members(id,name,status,time_zone) values(v_uid,v_name,'active',p_timezone);
    perform app_private.bump();
  elsif v_status='removed' then
    update public.members set status='active',onboarded=false,time_zone=p_timezone,joined_at=app_private.operation_now(),removed_at=null where id=v_uid;
    perform app_private.bump();
  elsif v_zone<>p_timezone then
    perform app_private.close_due();
    update public.members set time_zone=p_timezone where id=v_uid;
    update public.personal_days set cutoff=app_private.cutoff(day,p_timezone) where member_id=v_uid and not closed;
    update public.meal_date_locks l set cutoff=(select min(app_private.cutoff(l.day,m.time_zone)) from public.members m where m.status='active') where not closed;
    perform app_private.close_due();
    perform app_private.bump();
  end if;
  update public.meal_date_locks l set cutoff=(select min(app_private.cutoff(l.day,m.time_zone)) from public.members m where m.status='active') where not closed;
  perform app_private.close_due();
end $$;

create function app_private.validate_profile(p jsonb) returns void language plpgsql set search_path='' as $$
begin
  if coalesce(length(trim(p->>'name')),0) not between 1 and 80
    or coalesce(jsonb_typeof(p->'age'),'')<>'number' or (p->>'age')::numeric<18 or trunc((p->>'age')::numeric)<>(p->>'age')::numeric
    or coalesce(jsonb_typeof(p->'weight_kg'),'')<>'number' or (p->>'weight_kg')::numeric<=0
    or coalesce(jsonb_typeof(p->'height_cm'),'')<>'number' or (p->>'height_cm')::numeric<=0
    or coalesce(p->>'sex','') not in('male','female') or coalesce(p->>'activity_level','') not in('sedentary','light','active','very_active')
    or coalesce(p->>'goal','') not in('lose','maintain') or coalesce(p->>'language','') not in('en','es')
    or coalesce(p->>'diet','') not in('omnivore','vegetarian','vegan','pescatarian')
    or coalesce(jsonb_typeof(p->'excluded_ingredients'),'')<>'array'
  then raise exception 'invalid_profile'; end if;
  if exists(select 1 from jsonb_array_elements(p->'excluded_ingredients') x where jsonb_typeof(x)<>'string') then raise exception 'invalid_profile'; end if;
end $$;
create function app_private.api_save_profile(p_data jsonb,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.actor(); v_current integer;
begin
  perform app_private.close_due(); perform app_private.ensure_day(v_uid); perform app_private.validate_profile(p_data);
  select revision into v_current from public.profiles where member_id=v_uid;
  if coalesce(v_current,0) is distinct from p_revision then raise exception 'stale_profile'; end if;
  insert into public.profiles(member_id,data,revision) values(v_uid,p_data,p_revision+1)
    on conflict(member_id) do update set data=excluded.data,revision=excluded.revision,updated_at=app_private.operation_now();
  insert into app_private.profile_versions(member_id,data,revision) values(v_uid,p_data,p_revision+1);
  update public.members set name=trim(p_data->>'name') where id=v_uid;
  perform app_private.bump();
end $$;

create function app_private.proposal_for(p_uid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; v_rest numeric; v_usual numeric; v_deficit numeric:=0; v_target numeric; v_days integer; v_loss numeric; v_revision text; v_weight text;
begin
  p:=app_private.effective_profile(p_uid);
  if p is null then raise exception 'invalid_profile'; end if;
  perform app_private.validate_profile(p);
  v_rest:=10*(p->>'weight_kg')::numeric+6.25*(p->>'height_cm')::numeric-5*(p->>'age')::numeric+case when p->>'sex'='male' then 5 else -161 end;
  if v_rest<=0 then raise exception 'invalid_profile'; end if;
  v_usual:=v_rest*case p->>'activity_level' when 'sedentary' then 1.2 when 'light' then 1.375 when 'active' then 1.55 else 1.725 end;
  if p->>'goal'='lose' then
    if coalesce(jsonb_typeof(p->'target_weight_kg'),'')<>'number' or (p->>'target_weight_kg')::numeric<=0 then raise exception 'invalid_goal'; end if;
    v_loss:=(p->>'weight_kg')::numeric-(p->>'target_weight_kg')::numeric;
    if v_loss<=0 then raise exception 'goal_reached'; end if;
    if coalesce(p->>'target_date','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_goal'; end if;
    v_days:=(p->>'target_date')::date-app_private.today(p_uid);
    if v_days<=0 then raise exception 'deadline_expired'; end if;
    if v_loss*7/v_days>1 then raise exception 'goal_too_fast'; end if;
    v_deficit:=v_loss*7700/v_days;
  end if;
  v_target:=v_usual-v_deficit;
  if v_target<=1200 then raise exception 'target_too_low'; end if;
  select revision::text into v_revision from public.profiles where member_id=p_uid;
  select id::text||':'||updated_at::text into v_weight from public.daily_entries where member_id=p_uid and kind='weight' order by updated_at desc,id desc limit 1;
  return jsonb_build_object('resting_kcal',v_rest,'usual_kcal',v_usual,'deficit_kcal',v_deficit,'daily_kcal',v_target,
    'context_revision',v_revision||'/'||coalesce(v_weight,'baseline')||'/'||app_private.today(p_uid)::text);
exception when invalid_datetime_format or datetime_field_overflow then raise exception 'invalid_goal';
end $$;
create function app_private.api_proposal() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.actor();
begin perform app_private.close_due(); return app_private.proposal_for(v_uid); end $$;
create function app_private.api_accept_target(p_budgets jsonb,p_context text) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.actor(); p jsonb; v_key text;
begin
  perform app_private.close_due(); perform app_private.ensure_day(v_uid); p:=app_private.proposal_for(v_uid);
  if (p->>'context_revision') is distinct from p_context then raise exception 'stale_proposal'; end if;
  foreach v_key in array array['breakfast','lunch','dinner'] loop
    if coalesce(jsonb_typeof(p_budgets->v_key),'')<>'number' or (p_budgets->>v_key)::numeric<=0 then raise exception 'invalid_budgets'; end if;
  end loop;
  insert into public.targets(member_id,effective_date,inputs,resting_kcal,usual_kcal,deficit_kcal,daily_kcal,budgets)
    values(v_uid,app_private.today(v_uid),app_private.effective_profile(v_uid),(p->>'resting_kcal')::numeric,(p->>'usual_kcal')::numeric,(p->>'deficit_kcal')::numeric,(p->>'daily_kcal')::numeric,p_budgets);
  update public.members set onboarded=true where id=v_uid;
  perform app_private.bump();
end $$;

create function app_private.api_save_entry(p_kind text,p_description text,p_value numeric,p_activity_code text,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.actor(); v_day date; v_met numeric; v_profile jsonb; v_existing public.daily_entries%rowtype;
begin
  perform app_private.close_due(); perform app_private.ensure_day(v_uid); v_day:=app_private.today(v_uid);
  if p_kind not in('food','activity','weight') or p_kind is null or p_value is null or p_value::text in('NaN','Infinity','-Infinity') or p_value<0 then raise exception 'invalid_entry'; end if;
  if p_id is not null then
    select * into v_existing from public.daily_entries where id=p_id;
    if v_existing.member_id is distinct from v_uid or v_existing.day<>v_day or v_existing.kind<>p_kind then raise exception 'entry_not_editable'; end if;
  end if;
  if p_kind='activity' then
    v_profile:=app_private.effective_profile(v_uid);
    select met into v_met from public.activity_catalogue where code=p_activity_code and (v_profile->>'age')::integer between age_min and age_max;
    if v_met is null or p_value<=0 or p_value+(select coalesce(sum(value),0) from public.daily_entries where member_id=v_uid and day=v_day and kind='activity' and id is distinct from p_id)>1440 then raise exception 'invalid_activity'; end if;
    p_description:=p_activity_code;
  elsif p_kind='weight' then
    if p_value<=0 then raise exception 'invalid_entry'; end if;
    p_description:='Weight';
  elsif coalesce(length(trim(p_description)),0) not between 1 and 160 then raise exception 'invalid_entry';
  end if;
  insert into public.daily_entries(id,member_id,day,kind,description,value,activity_code,met)
    values(coalesce(p_id,gen_random_uuid()),v_uid,v_day,p_kind,trim(p_description),p_value,case when p_kind='activity' then p_activity_code end,v_met)
    on conflict(id) do update set description=excluded.description,value=excluded.value,activity_code=excluded.activity_code,met=excluded.met,updated_at=app_private.operation_now();
  perform app_private.bump();
end $$;
create function app_private.api_delete_entry(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.actor(); e public.daily_entries%rowtype;
begin
  perform app_private.close_due(); perform app_private.ensure_day(v_uid);
  select * into e from public.daily_entries where id=p_id;
  if e.member_id is distinct from v_uid or e.day<>app_private.today(v_uid) then raise exception 'entry_not_editable'; end if;
  delete from public.daily_entries where id=p_id; perform app_private.bump();
end $$;
create function app_private.api_budget(p_day date,p_meal text,p_kcal numeric) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.actor(); v_cutoff timestamptz;
begin
  perform app_private.close_due();
  if p_day is null or p_day<app_private.today(v_uid) or p_meal is null or p_meal not in('breakfast','lunch','dinner') then raise exception 'day_closed'; end if;
  select min(app_private.cutoff(p_day,time_zone)) into v_cutoff from public.members where status='active';
  insert into public.meal_date_locks(day,cutoff) values(p_day,v_cutoff) on conflict do nothing;
  if exists(select 1 from public.meal_date_locks where day=p_day and (closed or cutoff<=app_private.operation_now())) then raise exception 'day_closed'; end if;
  if p_kcal is null then delete from public.budget_overrides where member_id=v_uid and day=p_day and meal_type=p_meal;
  else
    if p_kcal<=0 or p_kcal::text in('NaN','Infinity','-Infinity') then raise exception 'invalid_budgets'; end if;
    insert into public.budget_overrides(member_id,day,meal_type,kcal) values(v_uid,p_day,p_meal,p_kcal) on conflict(member_id,day,meal_type) do update set kcal=excluded.kcal;
  end if;
  perform app_private.bump();
end $$;

create function app_private.require_owner() returns uuid language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.actor();
begin if not exists(select 1 from public.household where owner_id=v_uid) then raise exception 'owner_required'; end if; return v_uid; end $$;
create function app_private.api_invite(p_email text) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.require_owner();
begin
  if p_email is null or trim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
  insert into public.approved_emails(email,invited_by) values(lower(trim(p_email)),v_uid) on conflict(email) do update set revoked=false,invited_by=v_uid;
  perform app_private.bump();
end $$;
create function app_private.api_transfer(p_member uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.require_owner();
begin
  if not exists(select 1 from public.members where id=p_member and status='active') then raise exception 'invalid_member'; end if;
  update public.household set owner_id=p_member where id; perform app_private.bump();
end $$;
create function app_private.api_remove(p_member uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.require_owner(); v_day date; v_email text;
begin
  if p_member=v_uid then raise exception 'transfer_before_leaving'; end if;
  if not exists(select 1 from public.members where id=p_member and status='active') then raise exception 'invalid_member'; end if;
  perform app_private.close_due(); v_day:=app_private.today(p_member);
  select lower(trim(email)) into v_email from auth.users where id=p_member;
  update public.approved_emails set revoked=true where email=v_email;
  delete from public.budget_overrides r where r.member_id=p_member and r.day>v_day and not exists(select 1 from public.meal_date_locks d where d.day=r.day and d.closed);
  delete from public.targets r where r.member_id=p_member and r.effective_date>v_day and not exists(select 1 from public.personal_days d where d.day=r.effective_date and d.member_id=p_member and d.closed);
  delete from public.daily_entries r where r.member_id=p_member and r.day>v_day and not exists(select 1 from public.personal_days d where d.day=r.day and d.member_id=p_member and d.closed);
  delete from public.personal_days where member_id=p_member and day>v_day and not closed;
  update public.members set status='removed',removed_at=app_private.operation_now() where id=p_member;
  update public.meal_date_locks l set cutoff=(select min(app_private.cutoff(l.day,m.time_zone)) from public.members m where m.status='active') where not closed;
  perform app_private.close_due();
  perform app_private.bump();
end $$;

create function app_private.api_leave() returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.actor(); v_day date; v_email text;
begin
  if exists(select 1 from public.household where owner_id=v_uid) then raise exception 'transfer_before_leaving'; end if;
  perform app_private.close_due(); v_day:=app_private.today(v_uid);
  select lower(trim(email)) into v_email from auth.users where id=v_uid;
  update public.approved_emails set revoked=true where email=v_email;
  delete from public.budget_overrides r where r.member_id=v_uid and r.day>v_day and not exists(select 1 from public.meal_date_locks d where d.day=r.day and d.closed);
  delete from public.targets r where r.member_id=v_uid and r.effective_date>v_day and not exists(select 1 from public.personal_days d where d.day=r.effective_date and d.member_id=v_uid and d.closed);
  delete from public.daily_entries r where r.member_id=v_uid and r.day>v_day and not exists(select 1 from public.personal_days d where d.day=r.day and d.member_id=v_uid and d.closed);
  delete from public.personal_days where member_id=v_uid and day>v_day and not closed;
  update public.members set status='removed',removed_at=app_private.operation_now() where id=v_uid;
  update public.meal_date_locks l set cutoff=(select min(app_private.cutoff(l.day,m.time_zone)) from public.members m where m.status='active') where not closed;
  perform app_private.close_due();
  perform app_private.bump();
end $$;

create function app_private.api_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=app_private.actor(); v_owner uuid;
begin
  perform app_private.close_due();
  insert into public.personal_days(member_id,day,cutoff) select v_uid,app_private.today(v_uid),app_private.cutoff(app_private.today(v_uid),time_zone) from public.members where id=v_uid on conflict do nothing;
  select owner_id into v_owner from public.household where id;
  return jsonb_build_object(
    'server_now',app_private.operation_now(),'viewer_id',v_uid,'household',(select jsonb_build_object('name',name,'owner_id',owner_id,'week_start',week_start,'variety_days',variety_days) from public.household where id),
    'members',(select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'status',m.status,'time_zone',m.time_zone,'onboarded',m.onboarded,'profile',app_private.effective_profile(m.id),'revision',coalesce(p.revision,0)) order by m.joined_at,m.id) from public.members m left join public.profiles p on p.member_id=m.id),
    'targets',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id) from public.targets t),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(to_jsonb(e) order by e.updated_at,e.id) from public.daily_entries e),'[]'::jsonb),
    'days',coalesce((select jsonb_agg(to_jsonb(d)) from public.personal_days d),'[]'::jsonb),
    'budget_overrides',coalesce((select jsonb_agg(to_jsonb(b)) from public.budget_overrides b),'[]'::jsonb),
    'meal_locks',coalesce((select jsonb_agg(to_jsonb(l)) from public.meal_date_locks l),'[]'::jsonb),
    'invites',case when v_owner=v_uid then coalesce((select jsonb_agg(jsonb_build_object('email',email,'revoked',revoked)) from public.approved_emails),'[]'::jsonb) else '[]'::jsonb end,
    'activity_catalogue',coalesce((select jsonb_agg(jsonb_build_object('code',code,'met',met,'name',name,'group',group_name,'source_url',source_url,'source_description',source_description,'age_min',age_min,'age_max',age_max) order by code) from public.activity_catalogue),'[]'::jsonb),
    'meals','[]'::jsonb
  );
end $$;

-- Only these thin invoker wrappers are exposed through the Data API.
create function public.bootstrap_member(p_timezone text) returns void language sql security invoker set search_path='' as $$ select app_private.api_bootstrap(p_timezone) $$;
create function public.get_household_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select app_private.api_snapshot() $$;
create function public.save_my_profile(p_data jsonb,p_revision integer) returns void language sql security invoker set search_path='' as $$ select app_private.api_save_profile(p_data,p_revision) $$;
create function public.get_my_target_proposal() returns jsonb language sql security invoker set search_path='' as $$ select app_private.api_proposal() $$;
create function public.accept_my_target(p_budgets jsonb,p_context text) returns void language sql security invoker set search_path='' as $$ select app_private.api_accept_target(p_budgets,p_context) $$;
create function public.save_my_daily_entry(p_kind text,p_description text,p_value numeric,p_activity_code text default null,p_id uuid default null) returns void language sql security invoker set search_path='' as $$ select app_private.api_save_entry(p_kind,p_description,p_value,p_activity_code,p_id) $$;
create function public.delete_my_daily_entry(p_id uuid) returns void language sql security invoker set search_path='' as $$ select app_private.api_delete_entry(p_id) $$;
create function public.save_my_budget_override(p_day date,p_meal text,p_kcal numeric default null) returns void language sql security invoker set search_path='' as $$ select app_private.api_budget(p_day,p_meal,p_kcal) $$;
create function public.invite_member(p_email text) returns void language sql security invoker set search_path='' as $$ select app_private.api_invite(p_email) $$;
create function public.transfer_ownership(p_member uuid) returns void language sql security invoker set search_path='' as $$ select app_private.api_transfer(p_member) $$;
create function public.leave_household() returns void language sql security invoker set search_path='' as $$ select app_private.api_leave() $$;
create function public.remove_member(p_member uuid) returns void language sql security invoker set search_path='' as $$ select app_private.api_remove(p_member) $$;

revoke all on all tables in schema app_private from public,anon,authenticated;
revoke all on all functions in schema app_private from public,anon,authenticated;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_member() to authenticated;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname like 'api_%' loop
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('bootstrap_member','get_household_snapshot','save_my_profile','get_my_target_proposal','accept_my_target','save_my_daily_entry','delete_my_daily_entry','save_my_budget_override','invite_member','transfer_ownership','remove_member','leave_household') loop
    execute format('revoke all on function %s from public,anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
do $$ declare t text; begin
  foreach t in array array['household','members','profiles','targets','daily_entries','personal_days','meal_date_locks','budget_overrides','activity_catalogue','household_revision'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy active_household_read on public.%I for select to authenticated using ((select app_private.is_member()))',t);
  end loop;
end $$;
alter table public.approved_emails enable row level security;
revoke all on public.approved_emails from public,anon,authenticated;
-- Realtime only publishes a non-sensitive revision row, never raw health/deletion data.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.household_revision;
  end if;
end $$;
