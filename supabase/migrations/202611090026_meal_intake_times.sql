-- Personal wall-clock times for assumed meal intake; existing meal data stay intact.
begin;
alter table public.members add column meal_times jsonb not null default '{"breakfast":"09:00","lunch":"14:00","dinner":"21:00"}';
grant create on schema app_private to week_menu_executor;
create function app_private.api_meal_times(h uuid,m uuid,times jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid;begin
 perform app_private.assert_context(h,m);u:=app_private.actor();
 if times is null or jsonb_typeof(times) is distinct from 'object' then raise exception 'invalid_meal_times';end if;
 if (select count(*) from jsonb_object_keys(times))<>3 then raise exception 'invalid_meal_times';end if;
 if exists(select 1 from unnest(array['breakfast','lunch','dinner']) k where jsonb_typeof(times->k) is distinct from 'string' or coalesce(times->>k,'')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'invalid_meal_times';end if;
 update public.members set meal_times=times where id=u;
 perform app_private.bump();
end$$;
alter function app_private.api_meal_times(uuid,uuid,jsonb) owner to week_menu_executor;
revoke all on function app_private.api_meal_times(uuid,uuid,jsonb) from public,anon;
grant execute on function app_private.api_meal_times(uuid,uuid,jsonb) to authenticated;
create function public.save_my_meal_times(p_household_id uuid,p_membership_id uuid,p_times jsonb) returns void
language sql security invoker set search_path='' as $$select app_private.api_meal_times(p_household_id,p_membership_id,p_times)$$;
revoke all on function public.save_my_meal_times(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_my_meal_times(uuid,uuid,jsonb) to authenticated;
do $patch$declare definition text;pattern text:='''id''[[:space:]]*,[[:space:]]*m[.]id';matches integer;begin
 definition:=pg_get_functiondef('app_private.foundation_snapshot()'::regprocedure);
 select count(*) into matches from regexp_matches(definition,pattern,'g');
 if matches<>1 then raise exception 'meal_times_snapshot_definition_mismatch (matches %)',matches;end if;
 execute regexp_replace(definition,pattern,'''meal_times'',m.meal_times,''id'',m.id');
end$patch$;
revoke create on schema app_private from week_menu_executor;
notify pgrst,'reload schema';
commit;
