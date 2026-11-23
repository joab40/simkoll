-- NULL follows the competition name and category automatically.
alter table public.competition_calendar
  add column if not exists flight_building text
    check (flight_building in ('regional', 'championship', 'norrland'));
