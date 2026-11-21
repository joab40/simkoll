-- Optional preferences stored only on the swimmer's own profile.
alter table public.profiles
  add column if not exists flight_record_weights jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_flight_record_weights_check'
  ) then
    alter table public.profiles
      add constraint profiles_flight_record_weights_check check (
        flight_record_weights is null
        or (
          jsonb_typeof(flight_record_weights) = 'object'
          and flight_record_weights ?& array['speedFeeling','body','energy','sleepQuality','feeling','motivation','times']
          and flight_record_weights - array['speedFeeling','body','energy','sleepQuality','feeling','motivation','times'] = '{}'::jsonb
          and not jsonb_path_exists(flight_record_weights, 'strict $.* ? (@.type() != "number" || (@ != 0 && @ != 1 && @ != 2 && @ != 3 && @ != 4 && @ != 5))')
        )
      );
  end if;
end $$;
