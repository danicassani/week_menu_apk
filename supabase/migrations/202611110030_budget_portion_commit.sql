-- Save personal date budgets and the reviewed portion changes in one transaction.
begin;
grant create on schema app_private to week_menu_executor;
-- Quantity-only personal edits retain every other member's complete saved JSON.
create function app_private.apply_personal_quantities(plans jsonb,m uuid) returns void language plpgsql security definer set search_path='' as $$
declare plan jsonb;old jsonb;part jsonb;previous jsonb;parts jsonb;d date;t text;begin
 for plan in select * from jsonb_array_elements(plans) loop
  d:=(plan->>'day')::date;t:=plan->>'type';perform app_private.guard_meal_day(d);
  select data into old from public.meal_plans where day=d and meal_type=t;
  select p into part from jsonb_array_elements(plan->'portions') p where p->>'member_id'=m::text;
  select p into previous from jsonb_array_elements(old->'portions') p where p->>'member_id'=m::text;
  if part is null or previous is null then raise exception 'invalid_member';end if;
  part:=part||jsonb_build_object('recipe_snapshot',previous->'recipe_snapshot','budget',coalesce((select kcal from public.budget_overrides where member_id=m and day=d and meal_type=t),(select (budgets->>t)::numeric from public.targets where member_id=m and effective_date<=d order by effective_date desc,created_at desc,id desc limit 1)));
  part:=app_private.checked_portion(part);
  select jsonb_agg(case when p->>'member_id'=m::text then part else p end order by n) into parts from jsonb_array_elements(old->'portions') with ordinality x(p,n);
  update public.meal_plans set data=jsonb_set(data,'{portions}',parts),revision=revision+1 where day=d and meal_type=t;
 end loop;
 if jsonb_array_length(plans)>0 then perform app_private.bump();perform app_private.sync_menu_shopping();end if;
end$$;
alter function app_private.apply_personal_quantities(jsonb,uuid) owner to week_menu_executor;
revoke all on function app_private.apply_personal_quantities(jsonb,uuid) from public,anon,authenticated;
create function app_private.api_budget_portions(h uuid,m uuid,op uuid,d date,changes jsonb,plans jsonb,expected bigint) returns void language plpgsql security definer set search_path='' as $$
declare request jsonb;receipt app_private.planning_history_receipts%rowtype;plan jsonb;old jsonb;part jsonb;begin
 perform app_private.assert_context(h,m);perform app_private.actor();
 if op is null then raise exception 'invalid_budgets';end if;
 request:=to_jsonb(encode(sha256(convert_to(jsonb_build_object('action','budget_portions','day',d,'changes',changes,'plans',plans,'revision',expected)::text,'UTF8')),'hex'));
 select * into receipt from app_private.planning_history_receipts where household_id=h and operation_id=op;
 if found then if receipt.actor_id<>m or receipt.request is distinct from request then raise exception 'operation_mismatch';end if;return;end if;
 if (select revision from public.household_revision where id) is distinct from expected then raise exception 'stale_plan';end if;
 if jsonb_typeof(plans) is distinct from 'array' or jsonb_array_length(plans)>3 then raise exception 'invalid_budgets';end if;
 for plan in select * from jsonb_array_elements(plans) loop
  if plan->>'day' is distinct from d::text or not (changes ? (plan->>'type')) then raise exception 'invalid_budgets';end if;
  select data into old from public.meal_plans where day=d and meal_type=plan->>'type';
  if old is null or app_private.history_composition(old) is distinct from app_private.history_composition(plan) then raise exception 'invalid_history_action';end if;
  for part in select * from jsonb_array_elements(plan->'portions') loop
   if part->>'member_id'<>m::text and part is distinct from (select p from jsonb_array_elements(old->'portions') p where p->>'member_id'=part->>'member_id') then raise exception 'access_denied';end if;
  end loop;
 end loop;
 perform app_private.history_context('budget');
 perform app_private.api_budget_batch(h,m,op,d,changes);
 perform app_private.apply_personal_quantities(plans,m);
 insert into app_private.planning_history_receipts(household_id,operation_id,actor_id,request) values(h,op,m,request);
end$$;
alter function app_private.api_budget_portions(uuid,uuid,uuid,date,jsonb,jsonb,bigint) owner to week_menu_executor;
revoke all on function app_private.api_budget_portions(uuid,uuid,uuid,date,jsonb,jsonb,bigint) from public,anon;
grant execute on function app_private.api_budget_portions(uuid,uuid,uuid,date,jsonb,jsonb,bigint) to authenticated;
create function public.save_budgets_and_portions(p_household_id uuid,p_membership_id uuid,p_operation uuid,p_day date,p_changes jsonb,p_plans jsonb,p_revision bigint) returns void language sql set search_path='' as $$select app_private.api_budget_portions(p_household_id,p_membership_id,p_operation,p_day,p_changes,p_plans,p_revision)$$;
revoke all on function public.save_budgets_and_portions(uuid,uuid,uuid,date,jsonb,jsonb,bigint) from public,anon;
grant execute on function public.save_budgets_and_portions(uuid,uuid,uuid,date,jsonb,jsonb,bigint) to authenticated;
-- Default budget acceptance also reviews all affected future personal portions.
create function app_private.api_target_portions(h uuid,m uuid,op uuid,budgets jsonb,context text,plans jsonb,expected bigint) returns void language plpgsql security definer set search_path='' as $$
declare request jsonb;receipt app_private.planning_history_receipts%rowtype;plan jsonb;old jsonb;part jsonb;begin
 perform app_private.assert_context(h,m);perform app_private.actor();
 if op is null then raise exception 'invalid_budgets';end if;
 request:=to_jsonb(encode(sha256(convert_to(jsonb_build_object('action','target_portions','budgets',budgets,'context',context,'plans',plans,'revision',expected)::text,'UTF8')),'hex'));
 select * into receipt from app_private.planning_history_receipts where household_id=h and operation_id=op;
 if found then if receipt.actor_id<>m or receipt.request is distinct from request then raise exception 'operation_mismatch';end if;return;end if;
 if (select revision from public.household_revision where id) is distinct from expected then raise exception 'stale_plan';end if;
 if jsonb_typeof(plans) is distinct from 'array' then raise exception 'invalid_recipe';end if;
 if (select count(*) from jsonb_array_elements(plans))<>(select count(distinct (p->>'day',p->>'type')) from jsonb_array_elements(plans) p) then raise exception 'invalid_recipe';end if;
 for plan in select * from jsonb_array_elements(plans) loop
  if (plan->>'day')::date<app_private.today(m) then raise exception 'day_closed';end if;
  select data into old from public.meal_plans where day=(plan->>'day')::date and meal_type=plan->>'type';
  if old is null or app_private.history_composition(old) is distinct from app_private.history_composition(plan) then raise exception 'invalid_history_action';end if;
  for part in select * from jsonb_array_elements(plan->'portions') loop
   if part->>'member_id'<>m::text and part is distinct from (select p from jsonb_array_elements(old->'portions') p where p->>'member_id'=part->>'member_id') then raise exception 'access_denied';end if;
  end loop;
 end loop;
 perform app_private.history_context('target');
 perform app_private.api_accept_target(budgets,context);
 perform app_private.apply_personal_quantities(plans,m);
 insert into app_private.planning_history_receipts(household_id,operation_id,actor_id,request) values(h,op,m,request);
end$$;
alter function app_private.api_target_portions(uuid,uuid,uuid,jsonb,text,jsonb,bigint) owner to week_menu_executor;
revoke all on function app_private.api_target_portions(uuid,uuid,uuid,jsonb,text,jsonb,bigint) from public,anon;
grant execute on function app_private.api_target_portions(uuid,uuid,uuid,jsonb,text,jsonb,bigint) to authenticated;
create function public.accept_target_and_portions(p_household_id uuid,p_membership_id uuid,p_operation uuid,p_budgets jsonb,p_context text,p_plans jsonb,p_revision bigint) returns void language sql set search_path='' as $$select app_private.api_target_portions(p_household_id,p_membership_id,p_operation,p_budgets,p_context,p_plans,p_revision)$$;
revoke all on function public.accept_target_and_portions(uuid,uuid,uuid,jsonb,text,jsonb,bigint) from public,anon;
grant execute on function public.accept_target_and_portions(uuid,uuid,uuid,jsonb,text,jsonb,bigint) to authenticated;
revoke create on schema app_private from week_menu_executor;
notify pgrst,'reload schema';
commit;
