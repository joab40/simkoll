alter table public.daily_workouts
  add column if not exists target_groups text[] not null default array['ungdom_orange', 'ungdom_svart', 'junior'];

alter table public.daily_workouts
  drop constraint if exists daily_workouts_target_groups_check;

alter table public.daily_workouts
  add constraint daily_workouts_target_groups_check
  check (target_groups <@ array['ungdom_orange', 'ungdom_svart', 'junior']::text[] and cardinality(target_groups) > 0);
