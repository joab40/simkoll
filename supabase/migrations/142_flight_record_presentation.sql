begin;

create or replace function public.valid_flight_record_presentation(settings jsonb)
returns boolean
language plpgsql immutable
set search_path = pg_catalog
as $$
declare
  keys constant text[] := array['sky', 'angle', 'forwardDays'];
begin
  if settings is null then return true; end if;
  if jsonb_typeof(settings) <> 'object' or not (settings ?& keys)
    or settings - keys <> '{}'::jsonb then return false; end if;
  return jsonb_typeof(settings->'sky') = 'boolean'
    and jsonb_typeof(settings->'forwardDays') = 'number'
    and jsonb_typeof(settings->'angle') in ('null', 'number')
    and not jsonb_path_exists(settings, 'strict $.forwardDays ? (@ < 0 || @ > 3 || @.floor() != @)')
    and not jsonb_path_exists(settings, 'strict $.angle ? (@.type() == "number" && (@ < -30 || @ > 30 || @.floor() != @))');
end;
$$;

alter table public.profiles
  add column if not exists flight_record_presentation jsonb
  check (public.valid_flight_record_presentation(flight_record_presentation));

commit;
