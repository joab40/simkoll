-- Allow more than one published swim workout on the same date.
-- Existing rows are preserved; each workout keeps its own target_groups.
alter table public.daily_workouts
  drop constraint if exists daily_workouts_workout_date_key;

create index if not exists daily_workouts_date_groups_idx
  on public.daily_workouts (workout_date desc);
