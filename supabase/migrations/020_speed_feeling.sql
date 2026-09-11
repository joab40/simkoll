alter table public.responses
  add column if not exists speed_feeling integer;

alter table public.responses
  drop constraint if exists responses_speed_feeling_check,
  add constraint responses_speed_feeling_check
    check (speed_feeling is null or speed_feeling between 1 and 5);
