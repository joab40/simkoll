-- Store whether a published workout belongs to the morning or afternoon.
alter table public.daily_workouts
  add column if not exists time_of_day text;

alter table public.daily_workouts
  drop constraint if exists daily_workouts_time_of_day_check;

alter table public.daily_workouts
  add constraint daily_workouts_time_of_day_check
  check (time_of_day is null or time_of_day in ('morning', 'afternoon'));
