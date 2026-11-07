-- V3 milestone 3: bounded browsing, explicit reference loading and truthful chronology.
begin;
grant create on schema app_private to week_menu_executor;
create table app_private.catalogue_chronology(
 household_id uuid not null references public.household(household_id),kind text not null check(kind in('recipe','ingredient')),item_id text not null,created_at timestamptz,
 primary key(household_id,kind,item_id));
alter table app_private.catalogue_chronology enable row level security;
alter table app_private.catalogue_chronology force row level security;
create policy household_scope on app_private.catalogue_chronology to week_menu_executor using(household_id=app_private.current_household()) with check(household_id=app_private.current_household());
grant select,insert on app_private.catalogue_chronology to week_menu_executor;
-- Only real historical events establish private creation time. Starter overrides
-- keep their pinned fallback position; unknown legacy chronology remains null.
insert into app_private.catalogue_chronology
 select x.household_id,x.kind,x.id,case when exists(select 1 from app_private.starter_content s where s.kind=x.kind and s.id=x.id and s.release=(select starter_release from public.household where household_id=x.household_id)) then null else
 (select min(v.created_at) from app_private.content_versions v where v.household_id=x.household_id and v.kind=x.kind and v.item_id=x.id) end
 from (select household_id,'recipe'::text kind,id from public.saved_recipes union all select household_id,'ingredient',id from public.food_items)x;
create function app_private.catalogue_created() returns trigger language plpgsql security definer set search_path='' as $$
declare item_kind text:=case when tg_table_name='saved_recipes' then 'recipe' else 'ingredient' end;begin
 insert into app_private.catalogue_chronology values(new.household_id,item_kind,new.id,
 case when exists(select 1 from app_private.starter_content s where s.kind=item_kind and s.id=new.id and s.release=(select starter_release from public.household where household_id=new.household_id)) then null else clock_timestamp() end) on conflict do nothing;
 return new;
end$$;
create trigger recipe_created after insert on public.saved_recipes for each row execute function app_private.catalogue_created();
create trigger ingredient_created after insert on public.food_items for each row execute function app_private.catalogue_created();
create view app_private.catalogue_rows with(security_invoker=true) as
 select 'recipe'::text kind,r.id,r.data,r.revision,r.archived,c.created_at from app_private.resolved_saved_recipes r left join app_private.catalogue_chronology c on c.household_id=r.household_id and c.kind='recipe' and c.item_id=r.id
 union all
 select 'ingredient',r.id,r.data,r.revision,r.archived,c.created_at from app_private.resolved_food_items r left join app_private.catalogue_chronology c on c.household_id=r.household_id and c.kind='ingredient' and c.item_id=r.id;
grant select on app_private.catalogue_rows to week_menu_executor;
create function app_private.catalogue_page(h uuid,m uuid,k text,q text,a boolean,token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cursor jsonb; boundary timestamptz:=clock_timestamp();last_time timestamptz;last_id text;rows jsonb;last_row jsonb;more boolean;begin
 perform app_private.assert_context(h,m);
 if k not in('recipe','ingredient') or k is null or q is null or length(q)>200 or a is null then raise exception 'invalid_catalogue_query';end if;
 if token is not null then
  begin cursor:=convert_from(decode(token,'base64'),'utf8')::jsonb;exception when others then raise exception 'invalid_catalogue_cursor';end;
  if cursor->>'h' is distinct from h::text or cursor->>'m' is distinct from m::text or cursor->>'k' is distinct from k or cursor->>'q' is distinct from q or (cursor->>'a')::boolean is distinct from a or cursor->>'v' is distinct from '1' then raise exception 'invalid_catalogue_cursor';end if;
  boundary:=(cursor->>'at')::timestamptz;last_time:=(cursor->>'time')::timestamptz;last_id:=cursor->>'id';
  if not isfinite(boundary) or boundary>clock_timestamp() or last_id is null then raise exception 'invalid_catalogue_cursor';end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',data->'name','emoji',data->'emoji','meal_types',data->'meal_types','nutrition_per_100g',data->'nutrition_per_100g','revision',revision,'archived',archived,'created_at',created_at) order by created_at desc nulls last,id collate "C"),'[]') into rows
 from (select * from app_private.catalogue_rows r where kind=k and (a or not archived)
  and (q='' or strpos(lower(coalesce(data->'name'->>'en','')),lower(q))>0 or strpos(lower(coalesce(data->'name'->>'es','')),lower(q))>0)
  and (created_at is null or created_at<=boundary)
  and (token is null or (last_time is not null and (created_at<last_time or created_at is null or(created_at=last_time and id collate "C">last_id collate "C"))) or(last_time is null and created_at is null and id collate "C">last_id collate "C"))
  order by created_at desc nulls last,id collate "C" limit 51) page;
 more:=jsonb_array_length(rows)>50;
 if more then rows:=rows-50;end if;
 last_row:=rows->(jsonb_array_length(rows)-1);
 return jsonb_build_object('items',rows,'next_cursor',case when more then encode(convert_to(jsonb_build_object('v',1,'h',h,'m',m,'k',k,'q',q,'a',a,'at',boundary,'time',last_row->'created_at','id',last_row->>'id')::text,'utf8'),'base64') else null end);
end$$;
create function app_private.catalogue_item(h uuid,m uuid,k text,rid text) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;foods jsonb;begin
 perform app_private.assert_context(h,m);
 select data||jsonb_build_object('revision',revision,'archived',archived) into item from app_private.catalogue_rows where kind=k and id=rid;
 if item is null then raise exception 'catalogue_item_unavailable';end if;
 select coalesce(jsonb_agg(f.data||jsonb_build_object('revision',f.revision,'archived',f.archived) order by f.id),'[]') into foods from app_private.resolved_food_items f
 where k='recipe' and exists(select 1 from jsonb_array_elements(item->'components') c cross join lateral jsonb_array_elements(c->'ingredients') l where l->>'ingredient_id'=f.id);
 return jsonb_build_object('item',item,'ingredients',foods);
end$$;
-- A compact planning graph carries saved meals and their current dependencies;
-- generation and editors explicitly request the complete library separately.
create function app_private.workspace_library() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();plans jsonb;recipes jsonb;foods jsonb;begin
 perform app_private.close_due();
 select coalesce(jsonb_agg(app_private.plan_for_display(data)||jsonb_build_object('revision',revision) order by day,meal_type),'[]') into plans from public.meal_plans;
 select coalesce(jsonb_agg(r.data||jsonb_build_object('revision',r.revision,'archived',r.archived) order by r.id),'[]') into recipes from app_private.resolved_saved_recipes r
 where exists(select 1 from jsonb_array_elements(plans) p cross join lateral jsonb_array_elements(p->'portions') x where r.id in(p->>'shared_recipe_id',x->>'recipe_id',x->>'underlying_recipe_id'));
 select coalesce(jsonb_agg(f.data||jsonb_build_object('revision',f.revision,'archived',f.archived) order by f.id),'[]') into foods from app_private.resolved_food_items f
 where exists(select 1 from jsonb_array_elements(plans) p cross join lateral jsonb_array_elements(p->'portions') x cross join lateral jsonb_array_elements(x->'lines') l where l->>'ingredient_id'=f.id)
 or exists(select 1 from jsonb_array_elements(recipes) r cross join lateral jsonb_array_elements(r->'components') c cross join lateral jsonb_array_elements(c->'ingredients') l where l->>'ingredient_id'=f.id);
 return jsonb_build_object('complete',false,'plans',plans,'recipes',recipes,'ingredients',foods,'substitutions','[]'::jsonb,'ratings',coalesce((select jsonb_agg(jsonb_build_object('recipe_id',recipe_id,'member_id',member_id,'stars',stars,'mine',member_id=u)) from public.recipe_ratings),'[]'),'revision',(select revision from public.household_revision where id),'prompt_show_after',coalesce((select case when show_after is null then 'never' else show_after::text end from public.recipe_prompt_preferences where member_id=u),'now'));
end$$;
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_private.library()'::regprocedure);
 if position('perform app_private.close_due();' in definition)=0 then raise exception 'library_definition_mismatch';end if;
 definition:=replace(definition,'perform app_private.close_due();','if current_setting(''app_private.compact_view'',true)=''true'' then return app_private.workspace_library();end if; perform app_private.close_due();');
 definition:=replace(definition,'jsonb_build_object(''prompt_show_after''','jsonb_build_object(''complete'',true,''prompt_show_after''');
 execute definition;
end$$;
create function public.get_household_snapshot(p_household_id uuid,p_membership_id uuid,p_compact boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;previous text:=current_setting('app_private.compact_view',true);begin
 perform app_private.assert_context(p_household_id,p_membership_id);
 perform set_config('app_private.compact_view',coalesce(p_compact,false)::text,true);
 result:=app_private.api_snapshot();perform set_config('app_private.compact_view',coalesce(previous,''),true);return result;
end$$;
create function public.get_catalogue_page(p_household_id uuid,p_membership_id uuid,p_kind text,p_query text default '',p_archived boolean default false,p_cursor text default null) returns jsonb language sql security invoker set search_path='' as $$select app_private.catalogue_page(p_household_id,p_membership_id,p_kind,p_query,p_archived,p_cursor)$$;
create function public.get_catalogue_item(p_household_id uuid,p_membership_id uuid,p_kind text,p_id text) returns jsonb language sql security invoker set search_path='' as $$select app_private.catalogue_item(p_household_id,p_membership_id,p_kind,p_id)$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in('catalogue_created','catalogue_page','catalogue_item','workspace_library') loop
 execute format('alter function %s owner to week_menu_executor',f.signature);execute format('revoke all on function %s from public,anon,authenticated',f.signature);end loop;
end$$;
grant execute on function app_private.catalogue_page(uuid,uuid,text,text,boolean,text),app_private.catalogue_item(uuid,uuid,text,text) to authenticated;
-- The internal workspace helper is used only through the existing executor APIs.
revoke all on function public.get_household_snapshot(uuid,uuid,boolean),public.get_catalogue_page(uuid,uuid,text,text,boolean,text),public.get_catalogue_item(uuid,uuid,text,text) from public,anon;
grant execute on function public.get_household_snapshot(uuid,uuid,boolean),public.get_catalogue_page(uuid,uuid,text,text,boolean,text),public.get_catalogue_item(uuid,uuid,text,text) to authenticated;
revoke create on schema app_private from week_menu_executor;
notify pgrst,'reload schema';
commit;
