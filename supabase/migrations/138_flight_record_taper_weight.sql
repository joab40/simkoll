begin;

create or replace function public.valid_flight_record_boost_settings(settings jsonb)
returns boolean
language plpgsql immutable
set search_path = pg_catalog
as $$
declare
  scope text;
  boost jsonb;
  base_keys constant text[] := array['maxSteps','fullDays','fadeDays'];
begin
  if settings is null then return true; end if;
  if jsonb_typeof(settings) <> 'object' or not (settings ?& array['times','taper'])
    or settings - array['times','taper'] <> '{}'::jsonb then return false; end if;
  foreach scope in array array['times','taper'] loop
    boost := settings->scope;
    if jsonb_typeof(boost) <> 'object' or not (boost ?& base_keys)
      or boost - base_keys - 'minusSteps' <> '{}'::jsonb
      or (scope = 'times' and boost ? 'minusSteps')
      or (scope = 'taper' and not (boost ? 'minusSteps'))
      or jsonb_path_exists(boost, 'strict $.* ? (@.type() != "number" || @ < 0 || @ > 100 || @.floor() != @)')
      then return false; end if;
    if (boost->>'fullDays')::numeric < 1
      or (boost->>'fullDays')::numeric + (boost->>'fadeDays')::numeric > 90
      then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.profiles
  add column if not exists flight_record_taper_weight smallint not null default 0
  check (flight_record_taper_weight between 0 and 100),
  add column if not exists flight_record_boost_settings jsonb
  check (public.valid_flight_record_boost_settings(flight_record_boost_settings));

commit;
