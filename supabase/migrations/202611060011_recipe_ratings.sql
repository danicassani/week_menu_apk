begin;
create table public.recipe_ratings (
 household_id uuid not null default app_private.current_household() references public.household(household_id),
 account_id uuid not null, member_id uuid not null, recipe_id text not null,
 stars integer not null check(stars between 1 and 5),
 primary key(household_id,account_id,recipe_id),
 foreign key(household_id,member_id) references public.members(household_id,id)
);
alter table public.recipe_ratings enable row level security;
create policy ratings_read on public.recipe_ratings for select to authenticated,week_menu_executor using(household_id=(select app_private.current_household()));
create policy ratings_write on public.recipe_ratings for all to week_menu_executor
 using(household_id=app_private.current_household() and account_id=(select user_id from public.members where id=app_private.current_membership()))
 with check(member_id=app_private.current_membership() and household_id=app_private.current_household() and account_id=(select user_id from public.members where id=app_private.current_membership()));
grant select on public.recipe_ratings to authenticated;
grant select,insert,update on public.recipe_ratings to week_menu_executor;
grant create on schema app_private to week_menu_executor;
create function app_private.api_rate_recipe(h uuid,m uuid,r text,s integer) returns void
language plpgsql security definer set search_path='' as $$declare u uuid; account uuid;begin
 perform app_private.assert_context(h,m);u:=app_private.actor();
 select user_id into account from public.members where id=u;
 if s is null or s not between 1 and 5 or not exists(select 1 from app_private.resolved_saved_recipes where id=r) then raise exception 'invalid_recipe';end if;
 -- Same verified account keeps one rating after removal/rejoining.
 insert into public.recipe_ratings(account_id,member_id,recipe_id,stars) values(account,u,r,s)
 on conflict(household_id,account_id,recipe_id) do update set member_id=excluded.member_id,stars=excluded.stars;
 perform app_private.bump();
end$$;
alter function app_private.api_rate_recipe(uuid,uuid,text,integer) owner to week_menu_executor;
revoke create on schema app_private from week_menu_executor;
revoke all on function app_private.api_rate_recipe(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function app_private.api_rate_recipe(uuid,uuid,text,integer) to authenticated;
create function public.rate_recipe(p_household_id uuid,p_membership_id uuid,p_recipe_id text,p_stars integer) returns void
language sql security invoker set search_path='' as $$select app_private.api_rate_recipe(p_household_id,p_membership_id,p_recipe_id,p_stars)$$;
revoke all on function public.rate_recipe(uuid,uuid,text,integer) from public,anon;
grant execute on function public.rate_recipe(uuid,uuid,text,integer) to authenticated;
-- Existing library callers, including snapshots, receive only household ratings.
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_private.library()'::regprocedure);
 definition:=replace(definition,$old$'ingredients',$old$,$new$'ratings',coalesce((select jsonb_agg(jsonb_build_object('recipe_id',recipe_id,'member_id',member_id,'stars',stars,'mine',account_id=(select user_id from public.members where id=app_private.current_membership()))) from public.recipe_ratings),'[]'::jsonb),'ingredients',$new$);
 execute definition;
end$$;
-- Keep an authoritative underlying recipe when a home portion becomes eating out.
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_private.api_apply_plans(jsonb,bigint,boolean)'::regprocedure);
 definition:=replace(definition,'if p->>''eating_out''<>''true'' then',
 'if p->>''eating_out''=''true'' then p:=p||jsonb_build_object(''underlying_recipe_id'',coalesce(oldp->>''recipe_id'',oldp->>''underlying_recipe_id'',case when t<>''breakfast'' and exists(select 1 from app_private.resolved_saved_recipes where id=m->>''shared_recipe_id'') then m->>''shared_recipe_id'' end),''underlying_recipe_snapshot'',coalesce(nullif(oldp->''recipe_snapshot'',''null''::jsonb),oldp->''underlying_recipe_snapshot''));end if; if p->>''eating_out''<>''true'' then');
 execute definition;
end$$;
commit;
