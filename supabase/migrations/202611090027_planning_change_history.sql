-- Transactional, household-scoped planning history. No full-household snapshots.
begin;
grant create on schema app_private to week_menu_executor;
create table app_private.planning_history_configuration(started_at timestamptz not null default clock_timestamp());
insert into app_private.planning_history_configuration default values;
revoke all on app_private.planning_history_configuration from public,anon,authenticated;
grant select on app_private.planning_history_configuration to week_menu_executor;
create table app_private.planning_history(
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.household(household_id) on delete cascade,
 transaction_id bigint, actor_id uuid, actor_name text not null, action text not null,
 created_at timestamptz not null default clock_timestamp(), imported boolean not null default false,
 summary jsonb not null default '{}', changes jsonb not null default '{}',
 unique(household_id,transaction_id)
);
create index planning_history_expiry on app_private.planning_history(created_at);
create index planning_history_page on app_private.planning_history(household_id,created_at desc,id desc);
alter table app_private.planning_history enable row level security;
alter table app_private.planning_history force row level security;
create policy history_executor on app_private.planning_history to week_menu_executor using(household_id=(select app_private.current_household())) with check(household_id=(select app_private.current_household()));
revoke all on app_private.planning_history from public,anon,authenticated;
grant select,insert,update,delete on app_private.planning_history to week_menu_executor;
create table app_private.planning_history_receipts(
 household_id uuid not null, operation_id uuid not null, actor_id uuid not null, request jsonb not null,
 created_at timestamptz not null default clock_timestamp(), primary key(household_id,operation_id)
);
create index planning_history_receipt_expiry on app_private.planning_history_receipts(created_at);
alter table app_private.planning_history_receipts enable row level security;
alter table app_private.planning_history_receipts force row level security;
create policy history_receipt_scope on app_private.planning_history_receipts to week_menu_executor using(household_id=(select app_private.current_household())) with check(household_id=(select app_private.current_household()));
revoke all on app_private.planning_history_receipts from public,anon,authenticated;
grant select,insert,delete on app_private.planning_history_receipts to week_menu_executor;
create function app_private.history_action_labels(a text) returns jsonb language sql immutable set search_path='' as $$
 select case a
 when 'suggestions' then '{"en":"Approve suggestions & save","es":"Aprobar sugerencias y guardar"}'::jsonb
 when 'copy_week' then '{"en":"Save copied week","es":"Guardar semana copiada"}'::jsonb
 when 'review_meal' then '{"en":"Save this meal only","es":"Guardar solo esta comida"}'::jsonb
 when 'recalculate' then '{"en":"Recalculate quantities","es":"Recalcular cantidades"}'::jsonb
 when 'delete_meal' then '{"en":"Remove meal","es":"Eliminar comida"}'::jsonb
 when 'delete_week' then '{"en":"Delete week","es":"Borrar semana"}'::jsonb
 when 'paste' then '{"en":"Paste recipe","es":"Pegar receta"}'::jsonb
 when 'swap' then '{"en":"Swap meals","es":"Intercambiar comidas"}'::jsonb
 when 'membership' then '{"en":"Remove or leave household","es":"Retirar integrante o salir del hogar"}'::jsonb
 when 'transfer' then '{"en":"Copy/paste or swap meals","es":"Copiar/pegar o intercambiar comidas"}'::jsonb
 when 'correction' then '{"en":"Correct past day","es":"Corregir día pasado"}'::jsonb
 when 'catalogue' then '{"en":"Edit catalogue","es":"Editar catálogo"}'::jsonb
 when 'profile' then '{"en":"Save dietary preferences","es":"Guardar preferencias alimentarias"}'::jsonb
 when 'target' then '{"en":"Accept target and budgets","es":"Aceptar objetivo y presupuestos"}'::jsonb
 when 'budget' then '{"en":"Change meal budgets","es":"Cambiar presupuestos de comidas"}'::jsonb
 when 'veto' then '{"en":"Change recipe veto","es":"Cambiar veto de receta"}'::jsonb
 when 'week_start' then '{"en":"Change week start","es":"Cambiar inicio de semana"}'::jsonb
 when 'system' then '{"en":"System/administration","es":"Sistema/administración"}'::jsonb
 else '{"en":"Save menu (legacy client)","es":"Guardar menú (cliente anterior)"}'::jsonb end
$$;
create function app_private.history_context(a text) returns void language plpgsql set search_path='' as $$begin
 if current_setting('app_private.history_transaction',true) is distinct from txid_current()::text then
  perform set_config('app_private.history_transaction',txid_current()::text,true);
  perform set_config('app_private.history_action',a,true);
  perform set_config('app_private.history_actor',coalesce(app_private.current_membership()::text,''),true);
  perform set_config('app_private.history_household',coalesce(app_private.current_household()::text,''),true);
  perform set_config('app_private.history_actor_name',coalesce((select name from public.members where id=app_private.current_membership()),'Sistema / System'),true);
 end if;
end$$;
create function app_private.history_projection(kind text,r jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;begin
 if r is null or r='null'::jsonb then return null;end if;
 if kind='meal_plans' then
  select jsonb_build_object('day',r->'day','type',r->'meal_type','portions',coalesce(jsonb_agg(jsonb_build_object(
   'member',coalesce((select name from public.members where id=(p->>'member_id')::uuid),p->>'member_id'),
   'member_id',p->'member_id','recipe',p->'name','recipe_id',p->'recipe_id','eating_out',p->'eating_out','description',p->'description',
   'kcal',p->'kcal','budget',p->'budget','dessert',p->'dessert','lines',(select coalesce(jsonb_agg(l-'nutrition_revision'),'[]') from jsonb_array_elements(coalesce(p->'lines','[]')) l),'substitutions',
   (select coalesce(jsonb_agg(jsonb_build_object('from',s->'from','to',s->'to')),'[]') from jsonb_array_elements(coalesce(p->'substitutions','[]')) s)
   ) order by p->>'member_id'),'[]')) into result from jsonb_array_elements(coalesce(r->'data'->'portions','[]')) p;
  return result;
 elsif kind='profiles' then return jsonb_build_object('member',(select name from public.members where id=(r->>'member_id')::uuid),'diet',r->'data'->'diet','excluded_ingredients',(select coalesce(jsonb_agg(coalesce((select data->'name' from app_private.resolved_food_items where id=x),to_jsonb(x))),'[]') from jsonb_array_elements_text(coalesce(r->'data'->'excluded_ingredients','[]')) x));
 elsif kind='targets' then return jsonb_build_object('member',(select name from public.members where id=(r->>'member_id')::uuid),'day',r->'effective_date','daily_kcal',r->'daily_kcal','budgets',r->'budgets');
 elsif kind='budget_overrides' then return jsonb_build_object('member',(select name from public.members where id=(r->>'member_id')::uuid),'day',r->'day','type',r->'meal_type','kcal',r->'kcal');
 elsif kind='recipe_vetoes' then return jsonb_build_object('recipe',coalesce((select data->'name' from app_private.resolved_saved_recipes where id=r->>'recipe_id'),to_jsonb(r->>'recipe_id')),'banned',r->'banned');
 elsif kind='household' then return jsonb_build_object('week_start',r->'week_start');
 else return jsonb_build_object('id',r->'id','archived',r->'archived','data',(r->'data')-'revision'-'veto_revision'-'banned'-'archived'-'household_revision');
 end if;
end$$;
create function app_private.history_summary(actor text,a text,changes jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare n integer; item jsonb; value jsonb; subject_es text; subject_en text; verb_es text:='modificado'; verb_en text:='changed'; labels jsonb; days text; meals integer;begin
 select count(*) into n from jsonb_object_keys(changes);labels:=app_private.history_action_labels(a);
 if n=1 then
  select v into item from jsonb_each(changes) x(k,v);value:=coalesce(nullif(item->'after','null'),item->'before');
  if item->>'kind'='meal_plans' then
   subject_es:=case value->>'type' when 'breakfast' then 'el desayuno' when 'lunch' then 'el almuerzo' else 'la cena' end||' del '||(value->>'day');
   subject_en:='the '||(value->>'type')||' on '||(value->>'day');
   if item->'before'='null'::jsonb then verb_es:='añadido';verb_en:='added';elsif item->'after'='null'::jsonb then verb_es:='eliminado';verb_en:='removed';end if;
  elsif item->>'kind'='profiles' then subject_es:='las preferencias alimentarias de '||(value->>'member');subject_en:=(value->>'member')||'’s dietary preferences';
  elsif item->>'kind'='recipe_vetoes' then subject_es:='el veto de «'||coalesce(value->'recipe'->>'es',value->>'recipe')||'»';subject_en:='the veto of “'||coalesce(value->'recipe'->>'en',value->>'recipe')||'”';
  elsif item->>'kind'='budget_overrides' then subject_es:='el presupuesto de '||(value->>'member')||' del '||(value->>'day');subject_en:=(value->>'member')||'’s budget on '||(value->>'day');
  end if;
 end if;
 if n>1 then
  select count(*),string_agg(distinct coalesce(nullif(v->'after','null'),v->'before')->>'day',', ' order by coalesce(nullif(v->'after','null'),v->'before')->>'day') into meals,days from jsonb_each(changes) x(k,v) where v->>'kind'='meal_plans';
  if meals=n then subject_es:=n||' comidas ('||days||')';subject_en:=n||' meals ('||days||')';end if;
 end if;
 subject_es:=coalesce(subject_es,'la planificación y sus datos ('||n||' cambios)');subject_en:=coalesce(subject_en,'planning and its inputs ('||n||' changes)');
 return jsonb_build_object('es',actor||' ha '||verb_es||' '||subject_es||' usando «'||(labels->>'es')||'».','en',actor||' '||verb_en||' '||subject_en||' using “'||(labels->>'en')||'”.');
end$$;
create function app_private.history_record(h uuid,k text,b jsonb,n jsonb,kind text) returns void
language plpgsql security definer set search_path='' as $$
declare e app_private.planning_history%rowtype; who uuid; label text; a text; count_changes integer; labels jsonb;begin
 if b is not distinct from n then return;end if;
 if current_setting('app_private.history_transaction',true)=txid_current()::text then
  who:=nullif(current_setting('app_private.history_actor',true),'')::uuid;
  label:=current_setting('app_private.history_actor_name',true);
  if who is not null and h is distinct from nullif(current_setting('app_private.history_household',true),'')::uuid then raise exception 'membership_changed';end if;
 else who:=app_private.current_membership();
  if who is not null and h is distinct from app_private.current_household() then raise exception 'membership_changed';end if;
 end if;
 -- Triggers on administrator operations must not pretend to be a household user.
 a:=case when who is null then 'system' when current_setting('app_private.history_transaction',true)=txid_current()::text then current_setting('app_private.history_action',true) else 'legacy' end;
 if label is null then select name into label from public.members where id=who;end if;
 insert into app_private.planning_history(household_id,transaction_id,actor_id,actor_name,action)
 values(h,txid_current(),who,coalesce(label,'Sistema / System'),a) on conflict(household_id,transaction_id) do nothing;
 select * into e from app_private.planning_history where household_id=h and transaction_id=txid_current() for update;
 if e.changes ? k then b:=e.changes->k->'before';end if;
 if coalesce(b,'null'::jsonb)=coalesce(n,'null'::jsonb) then e.changes:=e.changes-k;
 else e.changes:=jsonb_set(e.changes,array[k],jsonb_build_object('kind',kind,'before',b,'after',n));end if;
 select count(*) into count_changes from jsonb_object_keys(e.changes);
 if count_changes=0 then delete from app_private.planning_history where id=e.id;return;end if;
 labels:=app_private.history_action_labels(e.action);
 update app_private.planning_history set changes=e.changes,summary=app_private.history_summary(e.actor_name,e.action,e.changes) where id=e.id;
end$$;
create function app_private.history_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; n jsonb; r jsonb; k text; baseline jsonb;begin
 if TG_OP<>'INSERT' then b:=to_jsonb(OLD);end if;
 if TG_OP<>'DELETE' then n:=to_jsonb(NEW);end if;r:=coalesce(n,b);
 if TG_OP='INSERT' and TG_TABLE_NAME in('food_items','saved_recipes') then
  select jsonb_build_object('id',c.id,'data',c.data,'archived',false) into baseline from app_private.starter_content c join public.household h on h.starter_release=c.release where h.household_id=(r->>'household_id')::uuid and c.id=r->>'id' and c.kind=case when TG_TABLE_NAME='food_items' then 'ingredient' else 'recipe' end;
  b:=baseline;
 elsif TG_OP='INSERT' and TG_TABLE_NAME='recipe_vetoes' then b:=r||'{"banned":false}'::jsonb;
 end if;
 k:=TG_TABLE_NAME||':'||coalesce(r->>'id',r->>'recipe_id',r->>'member_id',r->>'household_id')||':'||coalesce(r->>'day',r->>'effective_date','')||':'||coalesce(r->>'meal_type','');
 perform app_private.history_record((r->>'household_id')::uuid,k,app_private.history_projection(TG_TABLE_NAME,b),app_private.history_projection(TG_TABLE_NAME,n),TG_TABLE_NAME);
 return null;
end$$;
-- Trusted entrypoints label nested automatic writes with the original action.
do $patch$declare f record; body text; definition text; a text;begin
 for f in select p.oid,p.proname,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in
 ('api_apply_plans','api_delete_meal','api_delete_week','api_transfer_apply','api_apply_correction','api_save_content','api_save_profile','api_accept_target','api_budget_batch','api_budget','api_set_recipe_veto','api_recipe_veto','api_planner_settings','api_remove','api_leave') loop
 a:=case f.proname when 'api_apply_plans' then 'legacy' when 'api_delete_meal' then 'delete_meal' when 'api_delete_week' then 'delete_week' when 'api_transfer_apply' then 'transfer' when 'api_apply_correction' then 'correction' when 'api_save_content' then 'catalogue' when 'api_save_profile' then 'profile' when 'api_accept_target' then 'target' when 'api_remove' then 'membership' when 'api_leave' then 'membership' when 'api_planner_settings' then 'week_start' when 'api_budget_batch' then 'budget' when 'api_budget' then 'budget' else 'veto' end;
 body:=regexp_replace(f.prosrc,'\mbegin\M','begin perform app_private.history_context('||quote_literal(a)||');','i');
 if body=f.prosrc then raise exception 'history_entrypoint_definition_mismatch: %',f.proname;end if;
 if f.proname='api_transfer_apply' then body:=replace(body,'history_context(''transfer'')','history_context(case when request->>''mode''=''swap'' then ''swap'' else ''paste'' end)');end if;
 definition:=pg_get_functiondef(f.oid);execute replace(definition,f.prosrc,body);
 end loop;
end$patch$;
do $$declare t text;begin
 foreach t in array array['meal_plans','profiles','targets','budget_overrides','food_items','saved_recipes','household'] loop
 execute format('create trigger planning_history_capture after insert or update or delete on public.%I for each row execute function app_private.history_capture()',t);
 end loop;
 create trigger planning_history_capture after insert or update or delete on app_private.recipe_vetoes for each row execute function app_private.history_capture();
end$$;
create function app_private.history_composition(plan jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('recipe',plan->'shared_recipe_id','portions',
 (select jsonb_agg((p-'lines'-'budget'-'kcal'-'warnings')||jsonb_build_object('lines',(select jsonb_agg(l-'quantity'-'grams'-'kcal' order by l->>'component_id',l->>'ingredient_id') from jsonb_array_elements(p->'lines') l)) order by p->>'member_id') from jsonb_array_elements(plan->'portions') p))
$$;
create function app_private.api_history_apply(h uuid,m uuid,op uuid,a text,batch jsonb,expected bigint,replace_existing boolean) returns void
language plpgsql security definer set search_path='' as $$declare request jsonb; previous app_private.planning_history_receipts%rowtype;begin
 perform app_private.assert_context(h,m);
 if op is null or a not in('suggestions','copy_week','review_meal','recalculate') or a is null then raise exception 'invalid_history_action';end if;
 request:=to_jsonb(encode(sha256(convert_to(jsonb_build_object('action',a,'batch',batch,'revision',expected,'replace',replace_existing)::text,'UTF8')),'hex'));
 select * into previous from app_private.planning_history_receipts where household_id=h and operation_id=op;
 if found then if previous.actor_id<>m or previous.request is distinct from request then raise exception 'operation_mismatch';end if;return;end if;
 if a='review_meal' and jsonb_array_length(batch)<>1 then raise exception 'invalid_history_action';end if;
 if a='recalculate' and exists(select 1 from jsonb_array_elements(batch) p left join public.meal_plans old on old.day=(p->>'day')::date and old.meal_type=p->>'type' where old.data is null or app_private.history_composition(old.data) is distinct from app_private.history_composition(p)) then raise exception 'invalid_history_action';end if;
 perform app_private.history_context(a);
 perform app_private.api_apply_plans(batch,expected,replace_existing);
 insert into app_private.planning_history_receipts(household_id,operation_id,actor_id,request) values(h,op,m,request);
end$$;
create function public.apply_meal_plans_with_history(p_household_id uuid,p_membership_id uuid,p_operation uuid,p_action text,p_batch jsonb,p_revision bigint,p_replace boolean) returns void
language sql security invoker set search_path='' as $$select app_private.api_history_apply(p_household_id,p_membership_id,p_operation,p_action,p_batch,p_revision,p_replace)$$;
create function app_private.api_planning_history(h uuid,m uuid,filters jsonb,cursor jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform app_private.assert_context(h,m);
 select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id desc),'[]') into result from (
 select id,actor_id,actor_name,action,created_at,imported,summary,(select count(*) from jsonb_object_keys(changes)) change_count from app_private.planning_history
 where household_id=h and created_at>=clock_timestamp()-interval '90 days'
 and (coalesce(filters->>'actor','')='' or actor_id::text=filters->>'actor' or position(lower(filters->>'actor') in lower(actor_name))>0)
 and (coalesce(filters->>'action','')='' or action=filters->>'action')
 and (coalesce(filters->>'from','')='' or created_at>=(filters->>'from')::timestamptz)
 and (coalesce(filters->>'until','')='' or created_at<(filters->>'until')::timestamptz)
 and (cursor is null or cursor='null'::jsonb or (created_at,id)<((cursor->>'created_at')::timestamptz,(cursor->>'id')::uuid))
 order by created_at desc,id desc limit 51) p;
 return jsonb_build_object('events',(select coalesce(jsonb_agg(value order by ordinality),'[]') from jsonb_array_elements(result) with ordinality where ordinality<=50),
 'next_cursor',case when jsonb_array_length(result)>50 then jsonb_build_object('id',result->49->'id','created_at',result->49->'created_at') else null end,
 'complete_since',(select started_at from app_private.planning_history_configuration));
end$$;
create function public.get_planning_history(p_household_id uuid,p_membership_id uuid,p_filters jsonb default '{}',p_cursor jsonb default null) returns jsonb
language sql security invoker set search_path='' as $$select app_private.api_planning_history(p_household_id,p_membership_id,p_filters,p_cursor)$$;
create function app_private.api_planning_history_event(h uuid,m uuid,event_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform app_private.assert_context(h,m);
 select to_jsonb(e)-'transaction_id'-'household_id' into result from app_private.planning_history e where id=event_id and household_id=h and created_at>=clock_timestamp()-interval '90 days';
 if result is null then raise exception 'history_event_unavailable';end if;return result;
end$$;
create function public.get_planning_history_event(p_household_id uuid,p_membership_id uuid,p_event_id uuid) returns jsonb language sql security invoker set search_path='' as $$select app_private.api_planning_history_event(p_household_id,p_membership_id,p_event_id)$$;
-- Imported evidence retains its original timestamp and author ID; no invented earlier edits.
insert into app_private.planning_history(id,household_id,actor_id,actor_name,action,created_at,imported,summary,changes)
 select c.id,c.household_id,c.member_id,coalesce(m.name,'Member'),'correction',c.created_at,true,
 jsonb_build_object('es',coalesce(m.name,'Member')||' corrigió el día '||c.day||' (registro importado).','en',coalesce(m.name,'Member')||' corrected '||c.day||' (imported record).'),
 jsonb_build_object('correction:'||c.id,jsonb_build_object('kind','correction','before',(select coalesce(jsonb_agg(app_private.history_projection('meal_plans',jsonb_build_object('day',p->'day','meal_type',p->'type','data',p))),'[]') from jsonb_array_elements(c.before_meals) p),'after',(select coalesce(jsonb_agg(app_private.history_projection('meal_plans',jsonb_build_object('day',p->'day','meal_type',p->'type','data',p))),'[]') from jsonb_array_elements(c.after_meals) p)))
 from app_private.meal_corrections c left join public.members m on m.id=c.member_id where c.created_at>=clock_timestamp()-interval '90 days';
-- Scope all helpers. Only read/apply entrypoints are callable by authenticated users.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and (p.proname like 'history_%' or p.proname in('api_history_apply','api_planning_history','api_planning_history_event')) loop
 execute format('alter function %s owner to week_menu_executor',f.signature);execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end$$;
grant execute on function app_private.api_history_apply(uuid,uuid,uuid,text,jsonb,bigint,boolean),app_private.api_planning_history(uuid,uuid,jsonb,jsonb) to authenticated;
revoke all on function public.apply_meal_plans_with_history(uuid,uuid,uuid,text,jsonb,bigint,boolean),public.get_planning_history(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.apply_meal_plans_with_history(uuid,uuid,uuid,text,jsonb,bigint,boolean),public.get_planning_history(uuid,uuid,jsonb,jsonb) to authenticated;
grant execute on function app_private.api_planning_history_event(uuid,uuid,uuid) to authenticated;
revoke all on function public.get_planning_history_event(uuid,uuid,uuid) from public,anon;
grant execute on function public.get_planning_history_event(uuid,uuid,uuid) to authenticated;
-- The recorder also handles administrator writes without fabricating a member.
alter function app_private.history_record(uuid,text,jsonb,jsonb,text) owner to current_user;
grant execute on function app_private.history_record(uuid,text,jsonb,jsonb,text) to week_menu_executor;
revoke create on schema app_private from week_menu_executor;
-- Administrator-only cleanup: Cron has no user JWT and must purge all households.
create function app_private.purge_planning_history() returns void language plpgsql security definer set search_path='' as $$begin
 delete from app_private.planning_history where created_at<clock_timestamp()-interval '90 days';
 delete from app_private.planning_history_receipts where created_at<clock_timestamp()-interval '90 days';
end$$;
revoke all on function app_private.purge_planning_history() from public,anon,authenticated,week_menu_executor;
notify pgrst,'reload schema';
commit;
