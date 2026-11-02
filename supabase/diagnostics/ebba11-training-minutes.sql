-- KONTROLL, INTE MIGRATION: enbart SELECT. Ingenting sparas eller skrivs over.
-- Kor i Supabase SQL Editor. ENDAST @ebba11 granskas, ingen annan simmare.
-- Tom from_date = hela historiken; till och med idag i Europe/Stockholm.
-- En planerad tid ar inte egenrapporterad tid. Fyll INTE activity_minutes
-- med dessa kandidater: appen anvander redan matchande plantid retroaktivt.
-- Kontrollera needsReview och reasonCounts innan eventuell datarattning.
-- Grupp och planering ar NUVARANDE underlag, inte en historisk bekraftelse.
with
settings as (
  select 'ebba11'::text as username, null::date as from_date,
    (now() at time zone 'Europe/Stockholm')::date as through_date
),
ranked as (
  select r.id, r.profile_id, r.activity_date, r.created_at,
    r.activity_type, r.session_slot, r.planned_completion,
    r.activity_minutes, r.rpe, r.workout_reference,
    p.display_name, p.training_group,
    case r.session_slot when 'morning_swim' then 'morning'
      when 'afternoon_swim' then 'afternoon' end as time_of_day,
    row_number() over (
      partition by r.profile_id, r.activity_date, r.activity_type,
        coalesce(r.session_slot, 'day')
      order by r.created_at desc, r.id desc
    ) as recency
  from public.responses r
  join public.profiles p on p.id = r.profile_id
  cross join settings s
  where p.active is true and p.approval_status = 'approved'
    and lower(p.username) = lower(ltrim(btrim(s.username), '@'))
    and p.is_test_profile is not true
    and r.day_type = 'after' and r.competition is not true
    and r.activity_date <= s.through_date
    and (s.from_date is null or r.activity_date >= s.from_date)
),
reports as (
  -- Valj senaste rapport FORE exkluderingen: ett senare Nej far inte
  -- ateruppliva en aldre full rapport for samma aktivitet och passval.
  select * from ranked
  where recency = 1 and planned_completion is distinct from 'no'
),
day_sessions as (
  select profile_id, activity_date,
    count(distinct coalesce(session_slot, 'day')) filter (
      where activity_type = 'swim'
        or (activity_type is null and session_slot is not null)
    ) as swim_slots
  from reports group by profile_id, activity_date
),
candidates as (
  select r.id as report_id, c.reference, c.time_of_day, c.minutes
  from reports r
  cross join lateral (
    select 'workout:' || w.id::text as reference,
      coalesce(clock.time_of_day, w.time_of_day) as time_of_day,
      case when duration.supplied > 0 and duration.invalid = 0
          and duration.minimum = duration.maximum then duration.minimum
        else w.duration_minutes end as minutes
    from public.daily_workouts w
    left join lateral (
      select count(p.duration_minutes) as supplied,
        count(*) filter (where p.duration_minutes is not null
          and p.duration_minutes not between 1 and 1440) as invalid,
        min(p.duration_minutes) as minimum, max(p.duration_minutes) as maximum
      from public.training_plans p
      where p.source_workout_id = w.id and p.plan_date = w.workout_date
        and nullif(p.calendar_link->>'detachedWorkoutId', '') is null
        and (coalesce(cardinality(p.target_groups), 0) = 0
          or r.training_group = any(p.target_groups))
    ) duration on true
    left join lateral (
      select p.time_of_day from public.training_plans p
      where p.source_workout_id = w.id and p.calendar_link->>'mode' = 'linked'
        and p.plan_date = w.workout_date
        and (coalesce(cardinality(p.target_groups), 0) = 0
          or r.training_group = any(p.target_groups))
      order by p.plan_date, p.id limit 1
    ) clock on true
    where w.workout_date = r.activity_date
      and (coalesce(cardinality(w.target_groups), 0) = 0
        or r.training_group = any(w.target_groups))
      -- En flyttad kalenderkoppling granskas, inte gissas tillbaka.
      and not exists (
        select 1 from public.training_plans p
        where p.source_workout_id = w.id and p.calendar_link->>'mode' = 'linked'
          and p.plan_date <> w.workout_date
          and (coalesce(cardinality(p.target_groups), 0) = 0
            or r.training_group = any(p.target_groups))
      )
    union all
    select 'plan:' || p.id::text, p.time_of_day, p.duration_minutes
    from public.training_plans p
    where p.activity_type = 'swim' and p.plan_date = r.activity_date
      and nullif(p.calendar_link->>'detachedWorkoutId', '') is null
      and (coalesce(cardinality(p.target_groups), 0) = 0
        or r.training_group = any(p.target_groups))
      and (p.source_workout_id is null or not exists (
        select 1 from public.daily_workouts w where w.id = p.source_workout_id
      ))
  ) c
  -- Aven aldre otypade/slotlosa svar far kandidater for manuell granskning.
  -- resolved nedan anvander dem aldrig automatiskt utan tydlig typ och slot.
  where (r.activity_type = 'swim' or r.activity_type is null)
    and r.activity_minutes is null
),
candidate_counts as (
  select r.id,
    count(c.report_id) as day_count,
    count(*) filter (where c.time_of_day = r.time_of_day) as slot_count,
    count(*) filter (where c.time_of_day = r.time_of_day
      and c.minutes between 1 and 1440) as slot_with_time,
    min(c.minutes) filter (where c.time_of_day = r.time_of_day) as slot_min,
    max(c.minutes) filter (where c.time_of_day = r.time_of_day) as slot_max,
    count(c.report_id) filter (where c.time_of_day is null) as untimed_count,
    min(c.minutes) as only_day_minutes,
    count(*) filter (where c.reference = r.workout_reference
      and (c.time_of_day = r.time_of_day or c.time_of_day is null)) as chosen_count,
    min(c.minutes) filter (where c.reference = r.workout_reference
      and (c.time_of_day = r.time_of_day or c.time_of_day is null)) as chosen_minutes
  from reports r left join candidates c on c.report_id = r.id
  group by r.id
),
resolved as (
  select r.*, c.*, d.swim_slots,
    case
      when r.activity_type is distinct from 'swim' or r.time_of_day is null then null
      when r.workout_reference is not null and c.chosen_count = 1 then c.chosen_minutes
      when r.workout_reference is not null then null
      when c.slot_count = 1 then c.slot_min
      when c.slot_count > 1 and c.slot_with_time = c.slot_count
        and c.slot_min = c.slot_max then c.slot_min
      when c.slot_count = 0 and c.day_count = 1
        and c.untimed_count = 1 and d.swim_slots = 1 then c.only_day_minutes
    end as planned_minutes
  from reports r join candidate_counts c on c.id = r.id
  join day_sessions d using (profile_id, activity_date)
),
classified as (
  select profile_id, display_name, activity_date, activity_type, session_slot,
    workout_reference, planned_completion,
    activity_minutes as reported_minutes,
    case when planned_minutes between 1 and 1440 then planned_minutes end as usable_planned_minutes,
    coalesce(rpe between 1 and 10, false) as has_rpe,
    case
      when activity_minutes between 1 and 1440 then 'Rapporterad tid finns redan'
      when activity_minutes is not null then 'Angiven tid ar ogiltig - skriv inte over den automatiskt'
      when activity_type is null then 'Aldre svar utan aktivitetstyp - ingen simtid gissas'
      when activity_type <> 'swim' then 'Annan aktivitet - egen tid saknas'
      when time_of_day is null then 'Morgon/eftermiddag saknas'
      when planned_minutes between 1 and 1440 then 'Planerad tid kan anvandas automatiskt'
      when workout_reference is not null and chosen_count <> 1 then 'Sparat passval kan inte kopplas till dag/grupp/pass'
      when slot_count > 1 then 'Flera alternativ med olika eller okanda tider - passval behovs'
      when day_count = 0 then 'Inget tillgangligt pass for denna dag/grupp - kontrollera kopplingen'
      when chosen_count = 1 or slot_count = 1
        or (day_count = 1 and untimed_count = 1 and swim_slots = 1)
        then 'Kopplat pass saknar giltig planerad tid'
      else 'Dag/pass kan inte kopplas entydigt'
    end as reason
  from resolved
),
missing as (
  select x.*, coalesce((
    select jsonb_agg(jsonb_build_object('reference', c.reference,
      'timeOfDay', c.time_of_day, 'minutes', c.minutes) order by c.reference)
    from candidates c join reports r on r.id = c.report_id
    where r.profile_id = x.profile_id and r.activity_date = x.activity_date
      and r.activity_type is not distinct from x.activity_type
      and r.session_slot is not distinct from x.session_slot
  ), '[]'::jsonb) as available_passes
  from classified x where reported_minutes is null and usable_planned_minutes is null
),
reason_counts as (
  select reason, count(*) as reports from classified group by reason
),
per_swimmer as (
  select profile_id, display_name,
    count(*) as reports,
    count(*) filter (where reported_minutes between 1 and 1440) as reported_time,
    count(*) filter (where reported_minutes is null and usable_planned_minutes is not null) as usable_planned_time,
    count(*) filter (where reported_minutes is null and usable_planned_minutes is null) as still_missing_time
  from classified group by profile_id, display_name
)
select jsonb_build_object(
  'mode', 'READ ONLY - inga uppdateringar',
  'scope', 'Endast anvandarnamnet i settings; aktiv godkand profil, inte testprofil; senaste efterrapport per dag/aktivitet/passval',
  'requestedUsername', (select username from settings),
  'matchedProfileCount', (select count(*) from public.profiles p cross join settings s where lower(p.username) = lower(ltrim(btrim(s.username), '@'))),
  'fromDate', (select from_date from settings),
  'throughDate', (select through_date from settings),
  'reportCount', (select count(*) from classified),
  'missingReportedButUsablePlannedTime', (select count(*) from classified where reported_minutes is null and usable_planned_minutes is not null),
  'partialReportsWithUsablePlannedTime', (select count(*) from classified where planned_completion = 'partial' and reported_minutes is null and usable_planned_minutes is not null),
  'partialPlannedTimeDetails', coalesce((select jsonb_agg(to_jsonb(x) order by x.activity_date desc, x.session_slot) from classified x where x.planned_completion = 'partial' and x.reported_minutes is null and x.usable_planned_minutes is not null), '[]'::jsonb),
  'stillMissingUsableTime', (select count(*) from missing),
  'reasonCounts', coalesce((select jsonb_agg(to_jsonb(x) order by x.reason) from reason_counts x), '[]'::jsonb),
  'perSwimmer', coalesce((select jsonb_agg(to_jsonb(x) order by x.display_name, x.profile_id) from per_swimmer x), '[]'::jsonb),
  'needsReview', coalesce((select jsonb_agg(to_jsonb(x) order by x.activity_date desc, x.profile_id) from (select * from missing order by activity_date desc, profile_id, activity_type, session_slot limit 250) x), '[]'::jsonb),
  'reviewRowsLimited', (select count(*) > 250 from missing),
  'note', 'Planerad tid med giltig koppling anvands redan retroaktivt av appen. Detta aterstaller inte egenrapporterad tid. RPE gissas aldrig och inga gamla svar andras.'
) as training_minutes_audit;
