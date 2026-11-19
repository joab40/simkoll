-- READ ONLY. Investigate Ebba's evening training, 17 November 2026.
-- No free-text notes, sleep, illness, PINs, tokens or contact data are selected.
with swimmer as (select id from public.profiles where username='ebba11')
select 'checkin' as record_type, r.created_at as recorded_at, r.day_type,
  r.activity_type, r.session_slot, r.workout_reference,
  r.rpe is not null as has_rpe, r.activity_minutes, r.activity_distance_meters,
  r.planned_completion, r.training_registered
from public.responses r join swimmer s on s.id=r.profile_id
where r.activity_date='2026-11-17'
order by r.created_at;

select s.session_date, s.session_slot, s.activity_type, s.source, s.completed_at
from public.personal_training_sessions s join public.profiles p on p.id=s.profile_id
where p.username='ebba11' and s.session_date='2026-11-17'
order by s.completed_at;

select a.attendance_date, a.session_slot, a.present, a.marked_at
from public.session_attendance a join public.profiles p on p.id=a.profile_id
where p.username='ebba11' and a.attendance_date='2026-11-17'
order by a.marked_at;

select 'workout:' || w.id::text as workout_reference, w.title, w.focus,
  w.time_of_day, w.distance_meters, w.duration_minutes
from public.daily_workouts w
where w.workout_date='2026-11-17'
and (cardinality(w.target_groups)=0 or w.target_groups is null or
     (select training_group from public.profiles where username='ebba11')=any(w.target_groups));

select 'plan:' || p.id::text as workout_reference, p.source_workout_id,
  p.title,p.focus,p.time_of_day,p.distance_meters,p.duration_minutes,p.calendar_link
from public.training_plans p
where p.plan_date='2026-11-17' and p.activity_type='swim'
and (cardinality(p.target_groups)=0 or p.target_groups is null or
     (select training_group from public.profiles where username='ebba11')=any(p.target_groups));
