-- Date-range changes no longer need a preview/apply round trip. The actor lock
-- serializes menu/list edits while the current source and revision are captured.
begin;
grant create on schema app_private to week_menu_executor;
create function app_private.api_shopping_range(p_household_id uuid,p_membership_id uuid,p_start date,p_end date) returns void
language plpgsql security definer set search_path='' as $$
declare fingerprint text; revision bigint;
begin
 perform app_private.assert_context(p_household_id,p_membership_id);
 -- shopping_fingerprint validates finite, ordered dates even for an empty menu.
 fingerprint:=app_private.shopping_fingerprint(p_start,p_end);
 select content_revision into revision from public.shopping_list where id;
 -- The existing reconciler removes obsolete generated entries, including all
 -- of them for an empty interval, and preserves manual items and check rules.
 perform app_private.api_shopping_apply(p_start,p_end,revision,fingerprint);
end$$;
alter function app_private.api_shopping_range(uuid,uuid,date,date) owner to week_menu_executor;
revoke create on schema app_private from week_menu_executor;
revoke all on function app_private.api_shopping_range(uuid,uuid,date,date) from public,anon,authenticated;
grant execute on function app_private.api_shopping_range(uuid,uuid,date,date) to authenticated;

create function public.set_shopping_date_range(p_household_id uuid,p_membership_id uuid,p_start date,p_end date) returns void
language sql security invoker set search_path='' as $$
 select app_private.api_shopping_range(p_household_id,p_membership_id,p_start,p_end)
$$;
revoke all on function public.set_shopping_date_range(uuid,uuid,date,date) from public,anon;
grant execute on function public.set_shopping_date_range(uuid,uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
