-- Preserve the chosen alternative without changing attendance (one AM/PM slot).
alter table public.responses add column if not exists workout_reference text;
alter table public.responses drop constraint if exists responses_workout_reference_check;
alter table public.responses add constraint responses_workout_reference_check
  check (workout_reference is null or workout_reference ~ '^(workout|plan):[0-9a-fA-F-]{36}$');
notify pgrst, 'reload schema';
