alter table public.profiles
  add column if not exists tempus_id text;

alter table public.profiles
  drop constraint if exists profiles_tempus_id_check,
  add constraint profiles_tempus_id_check
    check (tempus_id is null or tempus_id ~ '^[0-9]{1,12}$');
