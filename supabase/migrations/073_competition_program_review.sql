-- Run in Supabase SQL editor before publishing a reviewed program.
alter table public.competition_calendar
  add column if not exists program_metadata jsonb not null default '{}'::jsonb;

-- One transaction: preserve IDs/entries for identical races; refuse to remove
-- or reinterpret a race with existing entries. Never DELETE then INSERT via HTTP.
create or replace function public.publish_competition_program(
  p_competition uuid, p_previous jsonb, p_events jsonb, p_metadata jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_program jsonb;
  item jsonb;
  matched uuid;
  kept uuid[] := '{}'::uuid[];
begin
  perform 1 from public.competition_calendar where id = p_competition for update;
  if not found then raise exception 'COMPETITION_MISSING'; end if;
  perform 1 from public.competition_events where competition_id = p_competition for update;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb)
    into current_program from public.competition_events e where competition_id = p_competition;
  if current_program is distinct from
    (select coalesce(jsonb_agg(e order by e->>'id'), '[]'::jsonb) from jsonb_array_elements(p_previous) e)
    then raise exception 'PROGRAM_CHANGED'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) not between 1 and 300
    then raise exception 'INVALID_PROGRAM'; end if;

  for item in select value from jsonb_array_elements(p_events) loop
    matched := null;
    select id into matched from public.competition_events
      where competition_id = p_competition and not (id = any(kept))
      and coalesce(event_number, '') = coalesce(item->>'eventNumber', '')
      and coalesce(session_label, '') = coalesce(item->>'sessionLabel', '')
      and item_type = item->>'itemType'
      and gender = item->>'gender' and age_class = item->>'ageClass'
      and distance_meters is not distinct from (item->>'distanceMeters')::integer
      and stroke = item->>'stroke'
      -- Unnumbered rows need their label too to disambiguate.
      and (coalesce(event_number, '') <> '' or label = item->>'label')
      order by id limit 1;
    if matched is null then
      insert into public.competition_events (competition_id, event_order, event_number, session_label, item_type, entry_allowed, gender, age_class, distance_meters, stroke, label)
      values (p_competition, (item->>'eventOrder')::integer, nullif(item->>'eventNumber',''), nullif(item->>'sessionLabel',''), item->>'itemType', item->>'itemType' = 'race', item->>'gender', item->>'ageClass', (item->>'distanceMeters')::integer, item->>'stroke', item->>'label')
      returning id into matched;
    else
      update public.competition_events set event_order = (item->>'eventOrder')::integer,
        label = item->>'label', entry_allowed = item->>'itemType' = 'race' where id = matched;
    end if;
    kept := array_append(kept, matched);
  end loop;
  if exists (select 1 from public.competition_entries a join public.competition_events e on e.id = a.event_id
    where e.competition_id = p_competition and not (e.id = any(kept)))
    then raise exception 'ENTRIES_PROTECTED'; end if;
  delete from public.competition_events where competition_id = p_competition and not (id = any(kept));
  update public.competition_calendar set program_metadata = p_metadata where id = p_competition;
  return (select coalesce(jsonb_agg(to_jsonb(e) order by event_order), '[]'::jsonb)
    from public.competition_events e where competition_id = p_competition);
end;
$$;
revoke all on function public.publish_competition_program(uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.publish_competition_program(uuid,jsonb,jsonb,jsonb) to service_role;
