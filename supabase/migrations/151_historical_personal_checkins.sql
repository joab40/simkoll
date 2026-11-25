begin;

-- Keep personal-session and response writes atomic for historical after-reports.
create or replace function public.personal_training_action(
  p_action text, p_profile_id uuid, p_id uuid, p_date date default null,
  p_details jsonb default null, p_response jsonb default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_plan public.planned_training_sessions;
  v_response public.responses;
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_slot text := 'extra_' || p_id::text;
  v_phase text := p_response->>'day_type';
  v_key text;
  v_limit integer;
begin
  if p_id is null or not exists(select 1 from public.profiles where id=p_profile_id and active and approval_status='approved') then
    raise exception 'Profile denied' using errcode='42501';
  end if;
  -- Serializes create/update/report/delete, including first concurrent retries.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 131));
  select * into v_plan from public.planned_training_sessions where id=p_id for update;
  if found and (v_plan.profile_id<>p_profile_id or v_plan.personal_details is null) then
    raise exception 'Session not found' using errcode='P0002';
  end if;
  if p_action='delete' then
    if v_plan.id is null then return jsonb_build_object('deleted',true); end if;
    if exists(select 1 from public.responses where personal_session_id=p_id) or
       exists(select 1 from public.personal_training_sessions where profile_id=p_profile_id and session_slot=v_slot) then
      raise exception 'Reported sessions cannot be deleted here' using errcode='23505';
    end if;
    delete from public.planned_training_sessions where id=p_id;
    return jsonb_build_object('deleted',true);
  end if;
  if p_action not in ('save','report') or p_details is null or jsonb_typeof(p_details)<>'object' or p_date is null then
    raise exception 'Invalid session' using errcode='22023';
  end if;
  if p_details->>'activityType' is null or p_details->>'activityType' not in ('swim','strength','dryland','cycling','other') or
     p_details->>'origin' is null or p_details->>'origin' not in ('niu','self') or
     (p_details->>'origin'='niu' and p_details->>'activityType'<>'swim') or
     (p_details->>'timeOfDay' is not null and p_details->>'timeOfDay' not in ('morning','afternoon')) or
     (p_details->>'focus' is not null and (p_details->>'activityType'<>'swim' or p_details->>'focus' not in ('f2_frisim','f2_spec','fart','sprint','distans','teknik','aterhamtning','troskel','syra','other'))) or
     (p_details->>'sport' is not null and p_details->>'sport' not in ('cycling','running','walking','other')) or
     (p_details->>'activityType'='cycling' and (p_details->>'sport' is distinct from 'cycling')) or
     (p_details->>'activityType'='other' and coalesce(p_details->>'sport','') not in ('running','walking','other')) or
     (p_details->>'activityType' not in ('cycling','other') and p_details->>'sport' is not null) or
     coalesce(length(p_details->>'title'),0) not between 1 and 100 then
    raise exception 'Invalid session details' using errcode='22023';
  end if;
  foreach v_key in array array['distanceMeters','durationMinutes'] loop
    v_limit := case when v_key='distanceMeters' then 50000 else 1440 end;
    if p_details->>v_key is not null and (p_details->>v_key !~ '^[0-9]+$' or (p_details->>v_key)::numeric not between 1 and v_limit) then
      raise exception 'Invalid amount' using errcode='22023';
    end if;
  end loop;
  if p_details->>'distanceMeters' is not null and p_details->>'activityType'<>'swim' then raise exception 'Not swim meters' using errcode='22023'; end if;
  if p_action='save' and (p_date<v_today or p_date>v_today+366) then raise exception 'Plan date out of range' using errcode='22023'; end if;
  if p_action='report' and (
    v_phase is null or v_phase not in ('before','after') or p_date > v_today or
    (p_date < v_today-1 and (v_phase <> 'after' or p_response->'late_entry' is distinct from 'true'::jsonb))
  ) then raise exception 'Report date out of range' using errcode='22023'; end if;
  if p_action='save' and exists(select 1 from public.personal_training_sessions where profile_id=p_profile_id and session_slot=v_slot) then
    raise exception 'Completed plan is locked' using errcode='23505';
  end if;
  if p_action='save' and exists(select 1 from public.responses where personal_session_id=p_id) and
     (v_plan.planned_date<>p_date or v_plan.personal_details->>'activityType'<>p_details->>'activityType' or
      v_plan.personal_details->>'origin'<>p_details->>'origin' or v_plan.personal_details->>'sport' is distinct from p_details->>'sport') then
    raise exception 'A referenced plan cannot change identity' using errcode='23505';
  end if;
  if p_action='report' and v_plan.id is not null and (v_plan.planned_date<>p_date or
     v_plan.personal_details->>'activityType'<>p_details->>'activityType' or
     v_plan.personal_details->>'origin'<>p_details->>'origin' or
     v_plan.personal_details->>'sport' is distinct from p_details->>'sport') then
    raise exception 'Plan does not match report' using errcode='23505';
  end if;
  if v_plan.id is null then
    -- Also serialize the daily quota across different new session IDs.
    perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_date::text, 131));
    if (select count(*) from public.planned_training_sessions where profile_id=p_profile_id and planned_date=p_date and personal_details is not null)>=20 then
      raise exception 'Too many sessions on this day' using errcode='22023';
    end if;
    insert into public.planned_training_sessions(id,profile_id,week_start,planned_date,session_slot,personal_details)
    values(p_id,p_profile_id,p_date-((extract(isodow from p_date)::integer)-1),p_date,v_slot,p_details || jsonb_build_object('wasPlanned',p_action='save' or v_phase='before')) returning * into v_plan;
  elsif p_action='save' then
    update public.planned_training_sessions set planned_date=p_date,week_start=p_date-((extract(isodow from p_date)::integer)-1),personal_details=p_details || jsonb_build_object('wasPlanned',true) where id=p_id returning * into v_plan;
  end if;
  if p_action='save' then return jsonb_build_object('plan',to_jsonb(v_plan)); end if;
  p_response := p_response || jsonb_build_object('profile_id',p_profile_id,'activity_date',p_date,'session_slot',v_slot,'personal_session_id',p_id,
    'activity_type',p_details->>'activityType','training_origin',p_details->>'origin','activity_focus',p_details->>'focus','activity_sport',p_details->>'sport',
    'activity_distance_meters',p_details->'distanceMeters','activity_minutes',p_details->'durationMinutes','competition',false,'training_registered',v_phase='after');
  select * into v_response from public.responses where personal_session_id=p_id and day_type=v_phase;
  if found then
    if not (to_jsonb(v_response) @> (p_response || jsonb_build_object('profile_id',p_profile_id,'activity_date',p_date,'session_slot',v_slot,'personal_session_id',p_id))) then
      raise exception 'Report already saved; refresh instead of overwriting' using errcode='23505';
    end if;
    return jsonb_build_object('response',to_jsonb(v_response),'created',false);
  end if;
  -- Server validates check-in scales. Identity, date, type and source are still
  -- overwritten here so a caller can never relabel another person's training.
  insert into public.responses select r.* from jsonb_populate_record(null::public.responses,p_response || jsonb_build_object('id',gen_random_uuid(),'created_at',now())) r returning * into v_response;
  if v_phase='after' then
    insert into public.personal_training_sessions(profile_id,activity_type,session_slot,session_date,source,personal_details)
    values(p_profile_id,p_details->>'activityType',v_slot,p_date,'checkin',p_details)
    on conflict(profile_id,session_date,session_slot) where session_slot<>'legacy'
    do update set personal_details=excluded.personal_details;
  end if;
  return jsonb_build_object('response',to_jsonb(v_response),'created',true);
end;
$$;
revoke all on function public.personal_training_action(text,uuid,uuid,date,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.personal_training_action(text,uuid,uuid,date,jsonb,jsonb) to service_role;

commit;
