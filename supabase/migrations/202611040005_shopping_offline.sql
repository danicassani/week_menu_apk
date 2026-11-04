-- One shared list; independent source-content and checkbox revisions.
create table public.shopping_list(id boolean primary key default true check(id),start_date date,end_date date,content_revision bigint not null default 0,applied_fingerprint text not null default '');
insert into public.shopping_list(id) values(true);
create table public.shopping_items(
 id uuid primary key default gen_random_uuid(),source text not null check(source in('generated','manual')),key text unique,ingredient_id text references public.food_items(id),
 name jsonb not null,amount text not null default '',quantity numeric,unit text not null default 'g',reference_state text not null default '',quantity_basis text not null default '',
 checked boolean not null default false,increased boolean not null default false,content_revision bigint not null default 1,checked_revision bigint not null default 0,
 check((source='generated' and key is not null and ingredient_id is not null and quantity>0) or(source='manual' and key is null and ingredient_id is null and quantity is null))
);
create table app_private.shopping_receipts(member_id uuid not null references public.members(id),operation_id uuid not null,item_id uuid not null,desired boolean not null,ack jsonb not null,primary key(member_id,operation_id));
create table app_private.food_reference_versions(ingredient_id text not null references public.food_items(id),revision integer not null,state text not null,basis text not null,policy text not null,primary key(ingredient_id,revision));
-- Preserve current and recorded historic reference identities. Revision-1 starter identities follow below.
insert into app_private.food_reference_versions select id,revision,data->>'state',coalesce(data->>'quantity_basis','edible_reference_weight'),coalesce(data->>'shopping_policy','include') from public.food_items on conflict do nothing;
insert into app_private.food_reference_versions select item_id,revision,data->>'state',coalesce(data->>'quantity_basis','edible_reference_weight'),coalesce(data->>'shopping_policy','include') from app_private.content_versions where kind='ingredient' on conflict do nothing;
create function app_private.capture_food_reference() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into app_private.food_reference_versions values(new.id,new.revision,new.data->>'state',coalesce(new.data->>'quantity_basis','edible_reference_weight'),coalesce(new.data->>'shopping_policy','include')) on conflict do nothing;
 return new;
end$$;
create trigger food_reference_version after insert or update on public.food_items for each row execute function app_private.capture_food_reference();
-- New portions carry the reference identity explicitly; locked old portions resolve it by revision.
alter function app_private.checked_portion(jsonb,boolean) rename to checked_portion_v2;
create function app_private.checked_portion(p jsonb,enforce_diet boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;l jsonb;ref app_private.food_reference_versions%rowtype;lines jsonb:='[]';
begin
 result:=app_private.checked_portion_v2(p,enforce_diet);
 for l in select value from jsonb_array_elements(result->'lines') loop
  select * into ref from app_private.food_reference_versions where ingredient_id=l->>'ingredient_id' and revision=(l->>'nutrition_revision')::integer;
  if not found then raise exception 'missing_shopping_reference';end if;
  lines:=lines||jsonb_build_array(l||jsonb_build_object('reference_state',ref.state,'quantity_basis',ref.basis,'shopping_policy',ref.policy));
 end loop;
 return jsonb_set(result,'{lines}',lines);
end$$;
create function app_private.shopping_required(p_start date,p_end date) returns table(key text,ingredient_id text,name jsonb,quantity numeric,unit text,reference_state text,quantity_basis text) language plpgsql security definer set search_path='' as $$
begin
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_start>p_end then raise exception 'invalid_shopping_range';end if;
 if exists(select 1 from public.meal_plans m cross join lateral jsonb_array_elements(m.data->'portions') p cross join lateral jsonb_array_elements(p->'lines') l left join app_private.food_reference_versions v on v.ingredient_id=l->>'ingredient_id' and v.revision=(l->>'nutrition_revision')::integer where m.day between p_start and p_end and p->>'eating_out'<>'true' and coalesce(l->>'reference_state',v.state) is null) then raise exception 'missing_shopping_reference';end if;
 return query
 with contribution as (
  select l->>'ingredient_id' food_id,l->'name' food_name,(l->>'grams')::numeric grams,
   coalesce(l->>'reference_state',v.state) state,coalesce(l->>'quantity_basis',v.basis) basis,
   coalesce(l->>'shopping_policy',v.policy) policy,m.day,m.meal_type
  from public.meal_plans m cross join lateral jsonb_array_elements(m.data->'portions') p cross join lateral jsonb_array_elements(p->'lines') l
  left join app_private.food_reference_versions v on v.ingredient_id=l->>'ingredient_id' and v.revision=(l->>'nutrition_revision')::integer
  where m.day between p_start and p_end and p->>'eating_out'<>'true'
 )
 select jsonb_build_array(c.food_id,c.state,c.basis)::text,c.food_id,(jsonb_agg(c.food_name order by c.day desc,c.meal_type))->0,sum(c.grams),'g'::text,c.state,c.basis
 from contribution c where c.policy='include' group by c.food_id,c.state,c.basis having sum(c.grams)>0 order by c.food_id,c.state,c.basis;
end$$;
create function app_private.shopping_fingerprint(p_start date,p_end date) returns text language sql security definer set search_path='' as $$
 select md5(jsonb_build_array(p_start,p_end,coalesce((select jsonb_agg(to_jsonb(r) order by r.key) from app_private.shopping_required(p_start,p_end) r),'[]'::jsonb))::text)
$$;
create function app_private.api_shopping_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();s public.shopping_list%rowtype;changed boolean:=false;
begin
 select * into s from public.shopping_list where id;
 if s.start_date is not null then changed:=s.applied_fingerprint<>app_private.shopping_fingerprint(s.start_date,s.end_date);end if;
 return to_jsonb(s)-'id'||jsonb_build_object('observation_revision',(select revision from public.household_revision where id),'changes_available',changed,'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.source,i.key,i.id) from public.shopping_items i),'[]'::jsonb));
end$$;
create function app_private.api_shopping_preview(p_start date,p_end date) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();changes jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('key',coalesce(r.key,i.key),'before',case when i.id is null then null else to_jsonb(i) end,'after',case when r.key is null then null else to_jsonb(r) end,
 'action',case when i.id is null then 'add' when r.key is null then 'remove' when r.quantity>i.quantity then 'increase' when r.quantity<i.quantity then 'decrease' when r.name<>i.name then 'update' else 'unchanged' end) order by coalesce(r.key,i.key)),'[]'::jsonb) into changes
 from app_private.shopping_required(p_start,p_end) r full join (select * from public.shopping_items where source='generated') i on r.key=i.key;
 return jsonb_build_object('start_date',p_start,'end_date',p_end,'content_revision',(select content_revision from public.shopping_list where id),'source_fingerprint',app_private.shopping_fingerprint(p_start,p_end),'changes',changes);
end$$;
create function app_private.api_shopping_apply(p_start date,p_end date,p_revision bigint,p_fingerprint text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();v_required record;fingerprint text;
begin
 if (select content_revision from public.shopping_list where id) is distinct from p_revision then raise exception 'stale_shopping';end if;
 fingerprint:=app_private.shopping_fingerprint(p_start,p_end);
 if fingerprint is distinct from p_fingerprint then raise exception 'stale_shopping';end if;
 delete from public.shopping_items i where i.source='generated' and not exists(select 1 from app_private.shopping_required(p_start,p_end) r where r.key=i.key);
 for v_required in select * from app_private.shopping_required(p_start,p_end) loop
  insert into public.shopping_items(source,key,ingredient_id,name,quantity,unit,reference_state,quantity_basis)
  values('generated',v_required.key,v_required.ingredient_id,v_required.name,v_required.quantity,v_required.unit,v_required.reference_state,v_required.quantity_basis)
  on conflict(key) do update set name=excluded.name,quantity=excluded.quantity,unit=excluded.unit,reference_state=excluded.reference_state,quantity_basis=excluded.quantity_basis,
   checked=case when excluded.quantity>public.shopping_items.quantity then false else public.shopping_items.checked end,
   increased=excluded.quantity>public.shopping_items.quantity or public.shopping_items.increased,
   checked_revision=public.shopping_items.checked_revision+case when excluded.quantity>public.shopping_items.quantity then 1 else 0 end,
   content_revision=public.shopping_items.content_revision+1;
 end loop;
 update public.shopping_list set start_date=p_start,end_date=p_end,applied_fingerprint=fingerprint,content_revision=content_revision+1 where id;
 perform app_private.bump();
end$$;
create function app_private.api_shopping_check(p_operation uuid,p_item uuid,p_checked boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();receipt app_private.shopping_receipts%rowtype;i public.shopping_items%rowtype;ack jsonb;
begin
 if p_operation is null or p_item is null or p_checked is null then raise exception 'invalid_shopping_item';end if;
 select * into receipt from app_private.shopping_receipts where member_id=u and operation_id=p_operation;
 if found then
  if receipt.item_id<>p_item or receipt.desired<>p_checked then raise exception 'operation_mismatch';end if;
  return receipt.ack;
 end if;
 update public.shopping_items set checked=p_checked,increased=case when p_checked then false else increased end,checked_revision=checked_revision+1 where id=p_item returning * into i;
 ack:=jsonb_build_object('operation_id',p_operation,'item_id',p_item,'status',case when i.id is null then 'removed' else 'applied' end,'checked',p_checked,'item_revision',i.checked_revision);
 insert into app_private.shopping_receipts values(u,p_operation,p_item,p_checked,ack);
 if i.id is not null then perform app_private.bump();end if;
 return ack;
end$$;
create function app_private.api_shopping_manual(p_id uuid,p_label text,p_amount text,p_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();i public.shopping_items%rowtype;
begin
 if p_id is null or coalesce(length(trim(p_label)),0) not between 1 and 160 or length(coalesce(p_amount,''))>80 then raise exception 'invalid_shopping_item';end if;
 select * into i from public.shopping_items where id=p_id;
 if i.id is not null then
  if i.source<>'manual' then raise exception 'invalid_shopping_item';end if;
  -- A lost creation acknowledgement can be retried without duplicating the item.
  if p_revision=0 and i.name=jsonb_build_object('en',trim(p_label),'es',trim(p_label)) and i.amount=coalesce(p_amount,'') then return;end if;
  if i.content_revision is distinct from p_revision then raise exception 'stale_shopping';end if;
  update public.shopping_items set name=jsonb_build_object('en',trim(p_label),'es',trim(p_label)),amount=coalesce(p_amount,''),content_revision=content_revision+1 where id=p_id;
 else
  if p_revision is distinct from 0 then raise exception 'stale_shopping';end if;
  insert into public.shopping_items(id,source,name,amount,unit) values(p_id,'manual',jsonb_build_object('en',trim(p_label),'es',trim(p_label)),coalesce(p_amount,''),'');
 end if;
 update public.shopping_list set content_revision=content_revision+1 where id;perform app_private.bump();
end$$;
create function app_private.api_shopping_delete(p_id uuid,p_revision bigint) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.actor();i public.shopping_items%rowtype;
begin
 select * into i from public.shopping_items where id=p_id;
 if i.id is null then return;end if;
 if i.source<>'manual' then raise exception 'generated_item';end if;
 if i.content_revision is distinct from p_revision then raise exception 'stale_shopping';end if;
 delete from public.shopping_items where id=p_id;update public.shopping_list set content_revision=content_revision+1 where id;perform app_private.bump();
end$$;
create function public.get_shopping_state() returns jsonb language sql security invoker set search_path='' as $$select app_private.api_shopping_state()$$;
create function public.preview_shopping_list(p_start date,p_end date) returns jsonb language sql security invoker set search_path='' as $$select app_private.api_shopping_preview(p_start,p_end)$$;
create function public.apply_shopping_list(p_start date,p_end date,p_revision bigint,p_fingerprint text) returns void language sql security invoker set search_path='' as $$select app_private.api_shopping_apply(p_start,p_end,p_revision,p_fingerprint)$$;
create function public.set_shopping_checked(p_operation uuid,p_item uuid,p_checked boolean) returns jsonb language sql security invoker set search_path='' as $$select app_private.api_shopping_check(p_operation,p_item,p_checked)$$;
create function public.save_manual_shopping_item(p_id uuid,p_label text,p_amount text,p_revision bigint) returns void language sql security invoker set search_path='' as $$select app_private.api_shopping_manual(p_id,p_label,p_amount,p_revision)$$;
create function public.delete_manual_shopping_item(p_id uuid,p_revision bigint) returns void language sql security invoker set search_path='' as $$select app_private.api_shopping_delete(p_id,p_revision)$$;
revoke all on all tables in schema app_private from public,anon,authenticated;
revoke all on function app_private.capture_food_reference(),app_private.checked_portion_v2(jsonb,boolean),app_private.checked_portion(jsonb,boolean),app_private.shopping_required(date,date),app_private.shopping_fingerprint(date,date),app_private.api_shopping_state(),app_private.api_shopping_preview(date,date),app_private.api_shopping_apply(date,date,bigint,text),app_private.api_shopping_check(uuid,uuid,boolean),app_private.api_shopping_manual(uuid,text,text,bigint),app_private.api_shopping_delete(uuid,bigint) from public,anon,authenticated;
grant execute on function app_private.api_shopping_state(),app_private.api_shopping_preview(date,date),app_private.api_shopping_apply(date,date,bigint,text),app_private.api_shopping_check(uuid,uuid,boolean),app_private.api_shopping_manual(uuid,text,text,bigint),app_private.api_shopping_delete(uuid,bigint) to authenticated;
do $$declare t text;f text;begin
 foreach t in array array['shopping_list','shopping_items'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select on public.%I to authenticated',t);execute format('create policy active_household_read on public.%I for select to authenticated using ((select app_private.is_member()))',t);
 end loop;
 foreach f in array array['get_shopping_state()','preview_shopping_list(date,date)','apply_shopping_list(date,date,bigint,text)','set_shopping_checked(uuid,uuid,boolean)','save_manual_shopping_item(uuid,text,text,bigint)','delete_manual_shopping_item(uuid,bigint)'] loop
  execute 'revoke all on function public.'||f||' from public,anon';execute 'grant execute on function public.'||f||' to authenticated';
 end loop;
end$$;
alter function app_private.api_snapshot() rename to planning_snapshot;
create function app_private.api_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
begin return app_private.planning_snapshot()||jsonb_build_object('shopping',app_private.api_shopping_state());end$$;
revoke all on function app_private.planning_snapshot(),app_private.api_snapshot() from public,anon,authenticated;
grant execute on function app_private.api_snapshot() to authenticated;
create or replace function public.get_household_snapshot() returns jsonb language sql security invoker set search_path='' as $$select app_private.api_snapshot()$$;

-- Original revision-1 CoFID reference identities for already locked portions.
insert into app_private.food_reference_versions values('oats',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('bread',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('pitta',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('rice_white',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('rice_brown',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('rice_risotto',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('pasta',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('pasta_wholewheat',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('couscous',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('bulgur',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('quinoa',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('barley',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('flour',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('baking_powder',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('egg',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('milk',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('soy_milk',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('yogurt',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('chicken',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('turkey',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('beef',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('pork',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('salmon',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('cod',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('prawns',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('tuna',1,'canned_drained','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('sardines',1,'canned_drained','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('lentils_red',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('lentils_green',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('chickpeas',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('beans_white',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('beans_kidney',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('beans_blackeye',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('tofu',1,'steamed_ready_to_use','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('tomato',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('tomato_canned',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('tomato_puree',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('pepper_red',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('pepper_green',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('onion',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('spring_onion',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('garlic',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('carrot',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('courgette',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('aubergine',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('broccoli',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('cauliflower',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('mushroom',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('spinach',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('potato',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('sweet_potato',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('squash',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('green_beans',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('peas',1,'frozen_uncooked','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('cucumber',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('lettuce',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('rocket',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('leek',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('celery',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('avocado',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('apple',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('banana',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('pear',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('orange',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('kiwi',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('strawberry',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('blueberry',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('raspberry',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('grapes',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('mango',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('melon',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('lemon_juice',1,'expressed_juice','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('lime_juice',1,'expressed_juice','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('olive_oil',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('vinegar',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('soy_sauce',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('water',1,'as_sold','edible_reference_weight','exclude_cooking_water') on conflict do nothing;
insert into app_private.food_reference_versions values('salt',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('honey',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('peanut_butter',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('almond',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('walnut',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('pumpkin_seed',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('sesame',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('sunflower_seed',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('cocoa',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('raisins',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('basil',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('basil_dried',1,'dry','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('parsley',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('mint',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('dill',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('coriander',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('ginger',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('chilli',1,'raw_edible','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('coconut_milk',1,'as_sold','edible_reference_weight','include') on conflict do nothing;
insert into app_private.food_reference_versions values('mustard',1,'as_sold','edible_reference_weight','include') on conflict do nothing;

-- Invalidate cached PL/pgSQL calls to the renamed portion checker in existing sessions.
do $$declare fn record;begin
 for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname in('api_apply_plans','api_save_content') loop
  execute pg_get_functiondef(fn.oid);
 end loop;
end$$;
