begin;

-- A retrospective choice belongs to the existing completed session, not a
-- fabricated after-check-in. Never alter reported effort or other answers.
alter table public.personal_training_sessions
  add column if not exists workout_reference text,
  add column if not exists workout_choice_at timestamptz;

create or replace function public.save_diary_workout_choice(
  p_profile_id uuid, p_date date, p_slot text, p_reference text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_session public.personal_training_sessions;
begin
  if p_profile_id is null or not exists(select 1 from public.profiles where id=p_profile_id and active and approval_status='approved') then
    raise exception 'Profile denied' using errcode='42501';
  end if;
  if p_date is null or p_date>(now() at time zone 'Europe/Stockholm')::date or
     p_slot is null or p_slot not in ('morning_swim','afternoon_swim') or
     p_reference is null or p_reference !~ '^(workout|plan):[0-9a-f-]{36}$' then
    raise exception 'Invalid choice' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_date::text || ':' || p_slot,132));
  select * into v_session from public.personal_training_sessions
    where profile_id=p_profile_id and session_date=p_date and session_slot=p_slot for update;
  if (v_session.id is not null and v_session.activity_type<>'swim') or
     (v_session.id is null and not exists(select 1 from public.session_attendance
       where profile_id=p_profile_id and attendance_date=p_date and session_slot=p_slot and present)) then
    raise exception 'Registered swim session not found' using errcode='P0002';
  end if;
  if exists(select 1 from public.responses where profile_id=p_profile_id and activity_date=p_date
    and session_slot=p_slot and day_type='after' and competition is not true
    and (activity_type is null or activity_type='swim') and workout_reference is not null) then
    raise exception 'An after-check-in already selected a workout' using errcode='23505';
  end if;
  if v_session.workout_reference is not null and v_session.workout_reference<>p_reference then
    raise exception 'A workout is already selected; reload' using errcode='23505';
  end if;
  if v_session.workout_reference=p_reference then return to_jsonb(v_session); end if;
  insert into public.personal_training_sessions(profile_id,session_date,session_slot,activity_type,source,workout_reference,workout_choice_at)
    values(p_profile_id,p_date,p_slot,'swim','manual',p_reference,now())
    on conflict(profile_id,session_date,session_slot) where session_slot<>'legacy'
    do update set workout_reference=excluded.workout_reference,workout_choice_at=excluded.workout_choice_at
    where personal_training_sessions.workout_reference is null
    returning * into v_session;
  if v_session.id is null then raise exception 'Choice changed concurrently; reload' using errcode='23505'; end if;
  return to_jsonb(v_session);
end;
$$;
revoke all on function public.save_diary_workout_choice(uuid,date,text,text) from public,anon,authenticated;
grant execute on function public.save_diary_workout_choice(uuid,date,text,text) to service_role;

commit;
