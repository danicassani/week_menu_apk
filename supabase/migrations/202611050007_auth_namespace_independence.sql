-- Repair the v2 executor's unnecessary dependency on the managed auth schema.
-- Apply after migration 6 as the project migration administrator. Safe to rerun.
-- Existing function owners, EXECUTE grants, RLS policies and data are preserved.
begin;

do $$begin
  if to_regprocedure('app_private.current_membership()') is null
    or to_regprocedure('app_private.scoped_snapshot_base()') is null then
    raise exception 'apply_households_migration_first';
  end if;
end$$;

create or replace function app_private.api_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
declare s jsonb; v_account uuid;
begin
  s:=app_private.scoped_snapshot_base();
  -- Membership resolution already verifies the live Google account. The
  -- executor reads that membership through RLS, without entering auth itself.
  select user_id into v_account from public.members
    where id=app_private.current_membership();
  return s||jsonb_build_object(
    'household',(s->'household')||jsonb_build_object('id',app_private.current_household()),
    'context',jsonb_build_object(
      'account_id',v_account,'household_id',app_private.current_household(),
      'membership_id',app_private.current_membership(),
      'legacy_binding',app_private.current_membership()=v_account
        and (select legacy_origin from public.household where id)
    )
  );
end$$;

create or replace function app_private.api_invite(p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare m uuid:=app_private.require_owner(); v_account uuid;
begin
  if p_email is null or trim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    then raise exception 'invalid_email';end if;
  select user_id into v_account from public.members where id=m;
  insert into public.approved_emails(email,invited_by)
    values(lower(trim(p_email)),v_account)
    on conflict(household_id,email) do update
      set revoked=false,invited_by=excluded.invited_by;
  perform app_private.bump();
end$$;

notify pgrst, 'reload schema';
commit;
