-- Artefakter ger poäng. Äldre versioner av constrainten saknade eventtypen
-- `artifact`, vilket gjorde att artefakten kunde sparas utan att poängen lades till.
alter table public.point_events drop constraint if exists point_events_event_type_check;
alter table public.point_events add constraint point_events_event_type_check check (
  event_type in (
    'daily_active', 'checkin', 'kudos_sent', 'kudos_received',
    'goal_progress', 'goal_complete', 'program_goal', 'weekly_goal',
    'strength_weekly_goal', 'dryland_weekly_goal', 'planning_weekly_goal',
    'game_played', 'personal_best', 'artifact'
  )
);

-- Komplettera artefakter som redan hann sparas innan constrainten rättades.
insert into public.point_events (profile_id, event_type, points, source_key)
select pa.profile_id, 'artifact', 5, pa.artifact_id::text
from public.profile_artifacts pa
where not exists (
  select 1
  from public.point_events pe
  where pe.profile_id = pa.profile_id
    and pe.event_type = 'artifact'
    and pe.source_key = pa.artifact_id::text
);
