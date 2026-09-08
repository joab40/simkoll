alter table public.daily_workouts
  add column if not exists focus text,
  add column if not exists distance_meters integer,
  add column if not exists duration_minutes integer;

alter table public.daily_workouts
  drop constraint if exists daily_workouts_focus_check,
  add constraint daily_workouts_focus_check check (focus is null or focus in ('fart', 'troskel', 'syra', 'f2_frisim', 'f2_spec', 'distans', 'teknik', 'aterhamtning', 'kondition_frisim', 'kondition_special')),
  drop constraint if exists daily_workouts_distance_check,
  add constraint daily_workouts_distance_check check (distance_meters is null or distance_meters between 1 and 50000),
  drop constraint if exists daily_workouts_duration_check,
  add constraint daily_workouts_duration_check check (duration_minutes is null or duration_minutes between 1 and 600);
