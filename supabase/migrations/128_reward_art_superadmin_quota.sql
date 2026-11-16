begin;
-- Preserve attempt history: recent attempts (including failures) still count.
-- Change only who may reserve a new generation and the rolling per-account cap.
create or replace function public.reserve_reward_art(p_actor_id uuid, p_session_version integer, p_level_id bigint, p_kind text, p_style text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_emoji text;
begin
  perform 1 from public.coach_accounts where id = p_actor_id and status = 'active'
    and role = 'superadmin' and session_version = p_session_version for share;
  if not found then raise exception 'Active superadmin session required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 124));
  perform pg_advisory_xact_lock(hashtextextended(p_level_id::text, 125));
  if (select count(*) from public.reward_level_art where coach_id = p_actor_id and created_at > now() - interval '24 hours') >= 50
    then raise exception 'Daily image limit reached' using errcode = 'P0001'; end if;
  if exists(select 1 from public.reward_level_art where level_id = p_level_id and status = 'pending' and created_at > now() - interval '4 minutes')
    then raise exception 'Generation already running' using errcode = 'P0001'; end if;
  select emoji into v_emoji from public.reward_levels where id = p_level_id for share;
  if not found then raise exception 'Level not found' using errcode = '22023'; end if;
  insert into public.reward_level_art(level_id, coach_id, kind, style, source_emoji)
    values(p_level_id, p_actor_id, p_kind, p_style, v_emoji) returning id into v_id;
  return jsonb_build_object('id', v_id, 'emoji', v_emoji);
end;
$$;
revoke all on function public.reserve_reward_art(uuid, integer, bigint, text, text) from public, anon, authenticated;
grant execute on function public.reserve_reward_art(uuid, integer, bigint, text, text) to service_role;
commit;
