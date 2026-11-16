begin;
alter table public.point_events drop constraint if exists point_events_event_type_check;
alter table public.point_events add constraint point_events_event_type_check check (
  event_type in ('daily_active', 'checkin', 'checkin_before', 'training_feedback',
    'kudos_sent', 'kudos_received', 'goal_progress', 'goal_complete', 'program_goal',
    'weekly_goal', 'strength_weekly_goal', 'dryland_weekly_goal', 'planning_weekly_goal',
    'game_played', 'personal_best', 'artifact', 'weekly_plan_star', 'cross_goals_star',
    'swim_goal_star', 'monthly_swim_star', 'streak_milestone', 'coach_info_opened', 'emblem_tap')
);

-- At most five rows per profile/day. The request ID survives a midnight retry.
create table public.reward_emblem_taps (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  bonus_date date not null,
  slot smallint not null check (slot between 1 and 5),
  point_event_id uuid not null references public.point_events(id) on delete cascade,
  primary key (profile_id, request_id),
  unique (profile_id, bonus_date, slot)
);
alter table public.reward_emblem_taps enable row level security;
revoke all on public.reward_emblem_taps from public, anon, authenticated;

-- Only the server can call this with the profile from its validated session.
-- No client date, points, level, quota or target profile is accepted by the API.
create or replace function public.reward_emblem_bonus(p_profile_id uuid, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_date date; v_used integer; v_event uuid; v_awarded integer := 0; v_replayed boolean := false;
begin
  -- A profile row lock serialises requests across devices and server instances.
  perform 1 from public.profiles where id = p_profile_id and active = true
    and approval_status = 'approved' and not coalesce(is_test_profile, false) for update;
  if not found then raise exception 'Active non-test profile required' using errcode = '42501'; end if;
  v_date := (clock_timestamp() at time zone 'Europe/Stockholm')::date;
  select count(*) into v_used from public.reward_emblem_taps where profile_id = p_profile_id and bonus_date = v_date;
  if p_request_id is not null then
    v_replayed := exists(select 1 from public.reward_emblem_taps where profile_id = p_profile_id and request_id = p_request_id);
    if not v_replayed and v_used < 5 then
      insert into public.point_events(profile_id, event_type, points, source_key)
        values(p_profile_id, 'emblem_tap', 1, p_request_id::text) returning id into v_event;
      insert into public.reward_emblem_taps(profile_id, request_id, bonus_date, slot, point_event_id)
        values(p_profile_id, p_request_id, v_date, v_used + 1, v_event);
      v_used := v_used + 1;
      v_awarded := 1;
    end if;
  end if;
  return jsonb_build_object('date', v_date, 'used', v_used, 'limit', 5,
    'awarded', v_awarded, 'replayed', v_replayed,
    'total', (select coalesce(sum(points), 0)::bigint from public.point_events where profile_id = p_profile_id));
end;
$$;
revoke all on function public.reward_emblem_bonus(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reward_emblem_bonus(uuid, uuid) to service_role;
commit;
