-- Original PM, independent of the AI interpreted event program.
alter table public.competition_calendar add column if not exists pm_document jsonb;

-- Tie generated calendar days to their source so edits and deletion stay in sync.
alter table public.training_plans add column if not exists source_competition_id uuid
  references public.competition_calendar(id) on delete cascade;
create index if not exists training_plans_source_competition_idx on public.training_plans(source_competition_id);

-- Adopt only legacy rows that match exactly one competition. Other manual plans
-- are left alone. Ambiguous matches must never be assigned by guesswork.
with matches as (
  select p.id as plan_id, (array_agg(c.id))[1] as competition_id
  from public.training_plans p join public.competition_calendar c
    on p.plan_date between c.start_date and c.end_date and p.title = c.title
    and p.target_groups = c.target_groups
    and coalesce(p.location, '') = coalesce(c.location, '')
    and coalesce(p.notes, '') = coalesce(c.notes, '')
  where p.activity_type = 'competition' and p.source_competition_id is null
  group by p.id having count(*) = 1
)
update public.training_plans p set source_competition_id = m.competition_id
from matches m where p.id = m.plan_id;

-- Calendar edits update every linked day in the same transaction. Two calendar
-- competitions on the same date get independent rows, even for different groups.
create or replace function public.sync_competition_calendar_plans()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  hidden_dates jsonb;
begin
  select setting_value->'planningHiddenDates' into hidden_dates
    from public.app_settings where setting_key = 'webapp' limit 1;
  hidden_dates := coalesce(hidden_dates, '[]'::jsonb);
  delete from public.training_plans where source_competition_id = new.id
    and (plan_date < new.start_date or plan_date > new.end_date or hidden_dates ? plan_date::text);
  update public.training_plans set title = new.title, target_groups = new.target_groups,
    location = new.location, notes = new.notes, updated_at = now()
    where source_competition_id = new.id;
  -- Don't turn legacy invalid dates into an unbounded insert.
  if new.end_date < new.start_date or new.end_date - new.start_date > 366 then return new; end if;
  insert into public.training_plans (plan_date, activity_type, source_competition_id, title, target_groups, location, notes)
    select day::date, 'competition', new.id, new.title, new.target_groups, new.location, new.notes
    from generate_series(new.start_date::timestamp, new.end_date::timestamp, interval '1 day') days(day)
    where not (hidden_dates ? (day::date)::text)
      and not exists (select 1 from public.training_plans p where p.source_competition_id = new.id and p.plan_date = day::date);
  return new;
end;
$$;
revoke all on function public.sync_competition_calendar_plans() from public, anon, authenticated;
grant execute on function public.sync_competition_calendar_plans() to service_role;
drop trigger if exists sync_competition_calendar_plans on public.competition_calendar;
create trigger sync_competition_calendar_plans
  after insert or update of start_date, end_date, title, target_groups, location, notes
  on public.competition_calendar for each row execute function public.sync_competition_calendar_plans();
-- Backfill linked days for existing competitions; future edits use the trigger.
update public.competition_calendar set title = title;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('competition-pm', 'competition-pm', false, 3145728,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- Private bucket: authorized API issues short-lived links after group checks.

-- Keep an existing selection intact if validation or a write fails.
create or replace function public.save_competition_entries(
  p_competition uuid, p_profile uuid, p_events uuid[], p_status text, p_coach boolean default false
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  competition public.competition_calendar%rowtype;
begin
  select * into competition from public.competition_calendar where id = p_competition for update;
  if not found then raise exception 'COMPETITION_MISSING'; end if;
  if not p_coach and not coalesce(competition.entries_open, false) then raise exception 'ENTRIES_CLOSED'; end if;
  if p_status is null or p_status not in ('draft', 'submitted') or p_events is null or cardinality(p_events) > 30 then raise exception 'INVALID_SELECTION'; end if;
  if exists (select 1 from unnest(p_events) selected(id)
    where not exists (select 1 from public.competition_events e where e.id = selected.id
      and e.competition_id = p_competition and e.item_type = 'race' and e.entry_allowed))
    then raise exception 'INVALID_SELECTION'; end if;
  delete from public.competition_entries where competition_id = p_competition and profile_id = p_profile and not (event_id = any(p_events));
  insert into public.competition_entries (competition_id, event_id, profile_id, status, submitted_at)
    select p_competition, id, p_profile, p_status, case when p_status = 'submitted' then now() else null end
    from unnest(p_events) selected(id) where true
    on conflict (event_id, profile_id) do update set status = excluded.status,
      submitted_at = excluded.submitted_at, updated_at = now();
  return (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb)
    from public.competition_entries e where e.competition_id = p_competition and e.profile_id = p_profile);
end;
$$;
revoke all on function public.save_competition_entries(uuid, uuid, uuid[], text, boolean) from public, anon, authenticated;
grant execute on function public.save_competition_entries(uuid, uuid, uuid[], text, boolean) to service_role;
