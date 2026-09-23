alter table competition_calendar
  add column if not exists entries_open boolean not null default false;

create index if not exists competition_calendar_entries_open_idx
  on competition_calendar(entries_open, start_date, end_date);
