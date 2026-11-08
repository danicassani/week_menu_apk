-- Shared suggestion vetoes, independent of starter content and recipe edits.
begin;
grant create on schema app_private to week_menu_executor;
create table app_private.recipe_vetoes (
 household_id uuid not null default app_private.current_household() references public.household(household_id),
 recipe_id text not null, banned boolean not null, revision integer not null,
 primary key(household_id,recipe_id)
);
alter table app_private.recipe_vetoes enable row level security;
alter table app_private.recipe_vetoes force row level security;
create policy veto_scope on app_private.recipe_vetoes to week_menu_executor using(household_id=(select app_private.current_household())) with check(household_id=(select app_private.current_household()));
revoke all on app_private.recipe_vetoes from public,anon,authenticated;
grant select,insert,update on app_private.recipe_vetoes to week_menu_executor;
create or replace view app_private.resolved_saved_recipes with (security_invoker=true) as
 select p.id,p.data||jsonb_build_object('banned',coalesce(v.banned,false),'veto_revision',coalesce(v.revision,0)) data,p.revision,p.archived,p.household_id
 from public.saved_recipes p left join app_private.recipe_vetoes v on v.household_id=p.household_id and v.recipe_id=p.id
 union all
 select s.id,s.data||jsonb_build_object('banned',coalesce(v.banned,false),'veto_revision',coalesce(v.revision,0)),1,false,app_private.current_household()
 from app_private.starter_content s left join app_private.recipe_vetoes v on v.recipe_id=s.id and v.household_id=app_private.current_household()
 where s.kind='recipe' and s.release=(select starter_release from public.household where id)
 and not exists(select 1 from public.saved_recipes p where p.id=s.id);
create function app_private.api_recipe_veto(h uuid,m uuid,rid text,value boolean,expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_revision integer;current_value boolean;result jsonb;begin
 perform app_private.assert_context(h,m);
 if value is null or not exists(select 1 from app_private.resolved_saved_recipes where id=rid) then raise exception 'catalogue_item_unavailable';end if;
 select revision,banned into current_revision,current_value from app_private.recipe_vetoes where recipe_id=rid;
 if coalesce(current_revision,0) is distinct from expected then
  if current_revision=expected+1 and current_value=value then
   select data||jsonb_build_object('revision',revision,'archived',archived) into result from app_private.resolved_saved_recipes where id=rid;return result;
  end if;
  raise exception 'stale_content';
 end if;
 insert into app_private.recipe_vetoes(recipe_id,banned,revision) values(rid,value,expected+1)
 on conflict(household_id,recipe_id) do update set banned=excluded.banned,revision=excluded.revision;
 perform app_private.bump();
 select data||jsonb_build_object('revision',revision,'archived',archived) into result from app_private.resolved_saved_recipes where id=rid;
 return result;
end$$;
alter function app_private.api_recipe_veto(uuid,uuid,text,boolean,integer) owner to week_menu_executor;
revoke all on function app_private.api_recipe_veto(uuid,uuid,text,boolean,integer) from public,anon;
grant execute on function app_private.api_recipe_veto(uuid,uuid,text,boolean,integer) to authenticated;
create function public.set_recipe_veto(p_household_id uuid,p_membership_id uuid,p_recipe_id text,p_banned boolean,p_revision integer) returns jsonb language sql security invoker set search_path='' as $$select app_private.api_recipe_veto(p_household_id,p_membership_id,p_recipe_id,p_banned,p_revision)$$;
revoke all on function public.set_recipe_veto(uuid,uuid,text,boolean,integer) from public,anon;
grant execute on function public.set_recipe_veto(uuid,uuid,text,boolean,integer) to authenticated;
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_private.catalogue_page(uuid,uuid,text,text,boolean,text)'::regprocedure);
 if position('''name'',data->''name''' in definition)=0 then raise exception 'catalogue_definition_mismatch';end if;
 execute replace(definition,'''name'',data->''name''','''name'',data->''name'',''banned'',coalesce(data->''banned''=''true''::jsonb,false)');
end$$;
revoke create on schema app_private from week_menu_executor;
notify pgrst,'reload schema';
commit;
