-- Per-profile invitation and private swimmer choice. Profiles already have
-- RLS. The application writes scoped columns through its authenticated API.
alter table public.profiles
  add column if not exists flight_record_offer_id uuid,
  add column if not exists flight_record_choice text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_flight_record_choice_check'
  ) then
    alter table public.profiles
      add constraint profiles_flight_record_choice_check check (
        flight_record_choice in ('pending', 'later', 'active')
        and (flight_record_offer_id is not null or flight_record_choice = 'pending')
      );
  end if;
end $$;
