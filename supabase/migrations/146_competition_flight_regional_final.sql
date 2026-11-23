alter table public.competition_calendar
  drop constraint if exists competition_calendar_flight_building_check,
  add constraint competition_calendar_flight_building_check
    check (flight_building in ('regional', 'regional-final', 'championship', 'norrland'));
