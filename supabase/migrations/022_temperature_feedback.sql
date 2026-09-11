alter table public.responses
  add column if not exists temperature integer;

alter table public.responses
  drop constraint if exists responses_temperature_check,
  add constraint responses_temperature_check
    check (temperature is null or temperature between 1 and 5);
