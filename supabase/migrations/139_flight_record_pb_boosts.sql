begin;

create or replace function public.valid_flight_record_pb_boost_settings(settings jsonb)
returns boolean
language plpgsql immutable
set search_path = pg_catalog
as $$
declare
  scope text;
  boost jsonb;
  margins jsonb;
  keys constant text[] := array['near','faster','progress','margins'];
  boost_keys constant text[] := array['maxSteps','fullDays','fadeDays'];
  distance_keys constant text[] := array['50','100','200'];
begin
  if settings is null then return true; end if;
  if jsonb_typeof(settings) <> 'object' or not (settings ?& keys)
    or settings - keys <> '{}'::jsonb then return false; end if;
  foreach scope in array array['near','faster','progress'] loop
    boost := settings->scope;
    if jsonb_typeof(boost) <> 'object' or not (boost ?& boost_keys)
      or boost - boost_keys <> '{}'::jsonb
      or jsonb_path_exists(boost, 'strict $.* ? (@.type() != "number" || @ < 0 || @ > 100 || @.floor() != @)')
      then return false; end if;
    if (boost->>'fullDays')::numeric < 1
      or (boost->>'fullDays')::numeric + (boost->>'fadeDays')::numeric > 7
      then return false; end if;
  end loop;
  margins := settings->'margins';
  return jsonb_typeof(margins) = 'object' and margins ?& distance_keys
    and margins - distance_keys = '{}'::jsonb
    and not jsonb_path_exists(margins, 'strict $.* ? (@.type() != "number" || @ < 0 || @ > 599999 || @.floor() != @)');
end;
$$;

alter table public.profiles
  add column if not exists flight_record_pb_boost_settings jsonb
  check (public.valid_flight_record_pb_boost_settings(flight_record_pb_boost_settings));

commit;
