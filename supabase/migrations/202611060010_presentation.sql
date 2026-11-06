begin;
alter table public.members add column presentation jsonb not null default '{"avatar":"🧑","text_size":"standard"}';
create function app_private.api_save_presentation(p_household_id uuid,p_membership_id uuid,p_preferences jsonb) returns void
language plpgsql security definer set search_path='' as $$declare u uuid;begin
 perform app_private.assert_context(p_household_id,p_membership_id);u:=app_private.actor();
 if p_preferences is null or jsonb_typeof(p_preferences) is distinct from 'object' or coalesce(p_preferences->>'text_size' not in ('standard','large'),true) or not (p_preferences ? 'text_size')
 or not (p_preferences ? 'avatar') or coalesce(p_preferences->>'avatar' not in ('🍽️','🥣','🥚','🍚','🥗','🍝','🍲','🥪','🍞','🥔','🥕','🥦','🍅','🍎','🍌','🍗','🐟','🧀','🥛','🫘','🥜','🧑','🙂','😎','🐱','🐶','🦊','🐼','🌻','🌵','🌈','⭐'),true) then raise exception 'invalid_profile';end if;
 update public.members set presentation=jsonb_build_object('avatar',p_preferences->>'avatar','text_size',p_preferences->>'text_size') where id=u;
 perform app_private.bump();
end$$;
-- The executor owns private helpers, never the public API schema. PostgreSQL
-- checks the target owner's CREATE privilege when transferring ownership.
-- Match migration 6: grant CREATE only inside this transaction, then revoke it.
grant create on schema app_private to week_menu_executor;
alter function app_private.api_save_presentation(uuid,uuid,jsonb) owner to week_menu_executor;
revoke create on schema app_private from week_menu_executor;
revoke all on function app_private.api_save_presentation(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function app_private.api_save_presentation(uuid,uuid,jsonb) to authenticated;
create function public.save_my_presentation(p_household_id uuid,p_membership_id uuid,p_preferences jsonb) returns void
language sql security invoker set search_path='' as $$
 select app_private.api_save_presentation(p_household_id,p_membership_id,p_preferences)
$$;
revoke all on function public.save_my_presentation(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_my_presentation(uuid,uuid,jsonb) to authenticated;
do $$declare definition text;begin
 definition:=pg_get_functiondef('app_private.foundation_snapshot()'::regprocedure);
 definition:=replace(definition,'''id'',m.id','''presentation'',m.presentation,''id'',m.id');
 execute definition;
end$$;
-- Reject arbitrary text, HTML and oversized emoji values on content writes.
create function app_private.validate_content_emoji() returns trigger language plpgsql set search_path='' as $$begin
 if new.data ? 'emoji' and (new.data->>'emoji' is null or new.data->>'emoji' not in ('🍽️','🥣','🥚','🍚','🥗','🍝','🍲','🥪','🍞','🥔','🥕','🥦','🍅','🍎','🍌','🍗','🐟','🧀','🥛','🫘','🥜','🧑','🙂','😎','🐱','🐶','🦊','🐼','🌻','🌵','🌈','⭐')) then raise exception 'invalid_recipe';end if;
 return new;
end$$;
revoke all on function app_private.validate_content_emoji() from public,anon,authenticated;
create trigger content_emoji before insert or update on public.food_items for each row execute function app_private.validate_content_emoji();
create trigger content_emoji before insert or update on public.saved_recipes for each row execute function app_private.validate_content_emoji();
commit;
