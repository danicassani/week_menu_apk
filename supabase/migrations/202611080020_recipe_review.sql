-- Fast veto acknowledgements and personal, cross-device recipe-review progress.
begin;
grant create on schema app_private to week_menu_executor;
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_private.api_recipe_veto(uuid,uuid,text,boolean,integer)'::regprocedure);
 if position('return result;' in definition)=0 then raise exception 'veto_definition_mismatch';end if;
 execute replace(definition,'return result;','return result||jsonb_build_object(''household_revision'',(select revision from public.household_revision where id));');
 definition:=pg_get_functiondef('app_private.catalogue_page(uuid,uuid,text,text,boolean,text)'::regprocedure);
 if position('''banned'',coalesce(data->''banned''=''true''::jsonb,false)' in definition)=0 then raise exception 'catalogue_definition_mismatch';end if;
 execute replace(definition,'''banned'',coalesce(data->''banned''=''true''::jsonb,false)','''banned'',coalesce(data->''banned''=''true''::jsonb,false),''veto_revision'',coalesce(data->''veto_revision'',''0''::jsonb)');
end$$;
create table app_private.recipe_reviews(
 household_id uuid not null default app_private.current_household() references public.household(household_id),
 member_id uuid not null,recipe_id text not null,recipe_revision integer not null,
 primary key(household_id,member_id,recipe_id),
 foreign key(household_id,member_id) references public.members(household_id,id)
);
alter table app_private.recipe_reviews enable row level security;
alter table app_private.recipe_reviews force row level security;
create policy review_scope on app_private.recipe_reviews to week_menu_executor using(household_id=(select app_private.current_household())) with check(household_id=(select app_private.current_household()));
revoke all on app_private.recipe_reviews from public,anon,authenticated;
grant select,insert,update,delete on app_private.recipe_reviews to week_menu_executor;
create function app_private.api_review_state(h uuid,m uuid,reset_progress boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;begin
 perform app_private.assert_context(h,m);u:=app_private.actor();
 if reset_progress then delete from app_private.recipe_reviews where member_id=u;end if;
 return jsonb_build_object('reviewed_recipe_ids',coalesce((select jsonb_agg(r.recipe_id order by r.recipe_id) from app_private.recipe_reviews r join app_private.resolved_saved_recipes s on s.id=r.recipe_id and s.revision=r.recipe_revision and not s.archived where r.member_id=u),'[]'::jsonb));
end$$;
create function app_private.api_review_recipe(h uuid,m uuid,rid text,banned boolean,expected integer,content_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;result jsonb;begin
 perform app_private.assert_context(h,m);u:=app_private.actor();
 if not exists(select 1 from app_private.resolved_saved_recipes where id=rid and revision=content_revision and not archived) then raise exception 'stale_content';end if;
 result:=app_private.api_recipe_veto(h,m,rid,banned,expected);
 insert into app_private.recipe_reviews(member_id,recipe_id,recipe_revision) values(u,rid,content_revision)
 on conflict(household_id,member_id,recipe_id) do update set recipe_revision=excluded.recipe_revision where recipe_reviews.recipe_revision is distinct from excluded.recipe_revision;
 return result;
end$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in('api_review_state','api_review_recipe') loop
 execute format('alter function %s owner to week_menu_executor',f.signature);
 execute format('revoke all on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end$$;
create function public.get_recipe_review(p_household_id uuid,p_membership_id uuid) returns jsonb language sql security invoker set search_path='' as $$select app_private.api_review_state(p_household_id,p_membership_id,false)$$;
create function public.reset_recipe_review(p_household_id uuid,p_membership_id uuid) returns jsonb language sql security invoker set search_path='' as $$select app_private.api_review_state(p_household_id,p_membership_id,true)$$;
create function public.review_recipe(p_household_id uuid,p_membership_id uuid,p_recipe_id text,p_banned boolean,p_revision integer,p_content_revision integer) returns jsonb language sql security invoker set search_path='' as $$select app_private.api_review_recipe(p_household_id,p_membership_id,p_recipe_id,p_banned,p_revision,p_content_revision)$$;
revoke all on function public.get_recipe_review(uuid,uuid),public.reset_recipe_review(uuid,uuid),public.review_recipe(uuid,uuid,text,boolean,integer,integer) from public,anon;
grant execute on function public.get_recipe_review(uuid,uuid),public.reset_recipe_review(uuid,uuid),public.review_recipe(uuid,uuid,text,boolean,integer,integer) to authenticated;
revoke create on schema app_private from week_menu_executor;
notify pgrst,'reload schema';
commit;
