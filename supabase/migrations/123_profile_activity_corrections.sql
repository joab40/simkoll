-- Superadmin-only missing-day repair. Actual training/check-ins and points are
-- untouched. A correction is never represented as an observed historical login.
begin;
create table if not exists public.profile_activity_corrections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  coach_account_id uuid references public.coach_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (profile_id, activity_date)
);
alter table public.profile_activity_corrections enable row level security;
revoke all on public.profile_activity_corrections from public, anon, authenticated;
grant select, insert on public.profile_activity_corrections to service_role;

create or replace function public.correct_profile_activity_day(
  p_actor_id uuid, p_session_version integer, p_profile_id uuid,
  p_activity_date date, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor public.coach_accounts%rowtype;
  v_created_at timestamptz;
  v_target_name text;
  v_count integer;
begin
  select * into v_actor from public.coach_accounts
  where id = p_actor_id and status = 'active' and role = 'superadmin'
    and session_version = p_session_version for share;
  if not found then raise exception 'Superadmin session required' using errcode = '42501'; end if;
  select created_at, coalesce(display_name, username) into v_created_at, v_target_name from public.profiles where id = p_profile_id for share;
  if not found then raise exception 'Profile not found' using errcode = '22023'; end if;
  if p_activity_date is null or p_activity_date > (now() at time zone 'Europe/Stockholm')::date
    or p_activity_date < coalesce((v_created_at at time zone 'Europe/Stockholm')::date, date '1900-01-01') then
    raise exception 'Invalid activity date' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 5 and 500 then
    raise exception 'Reason required' using errcode = '22023';
  end if;
  insert into public.profile_daily_activity(profile_id, activity_date, last_seen_at)
    values(p_profile_id, p_activity_date, now())
    on conflict (profile_id, activity_date) do nothing;
  get diagnostics v_count = row_count;
  if v_count = 0 then return jsonb_build_object('added', false); end if;
  -- last_seen_at above is the registration time, not an invented login time.
  insert into public.profile_activity_corrections(profile_id, activity_date, reason, coach_account_id)
    values(p_profile_id, p_activity_date, btrim(p_reason), p_actor_id);
  insert into public.audit_logs(event_type, role, profile_id, status, details)
    values('activity_day_correction', 'coach', p_profile_id, 'success',
      jsonb_build_object('coachAccountId', p_actor_id, 'actorName', v_actor.display_name,
        'targetAlias', v_target_name || ' · ' || p_activity_date::text,
        'activityDate', p_activity_date, 'reason', btrim(p_reason), 'action', 'add-missing-day'));
  return jsonb_build_object('added', true);
end;
$$;
revoke all on function public.correct_profile_activity_day(uuid, integer, uuid, date, text) from public, anon, authenticated;
grant execute on function public.correct_profile_activity_day(uuid, integer, uuid, date, text) to service_role;
commit;
