create table if not exists competition_calendar (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  title text not null,
  category text,
  location text,
  target_groups text[] not null default '{ungdom_orange,ungdom_svart,junior}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists competition_calendar_dates_idx on competition_calendar(start_date, end_date);
