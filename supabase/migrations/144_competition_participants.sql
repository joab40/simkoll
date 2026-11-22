-- The group assignment remains the default for swimmers without a choice.
-- Each key is a profile ID. true includes a swimmer, false excludes them.
alter table public.competition_calendar
  add column if not exists participant_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(participant_overrides) = 'object');
