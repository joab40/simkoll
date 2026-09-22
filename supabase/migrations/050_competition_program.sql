create table if not exists competition_events (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competition_calendar(id) on delete cascade,
  event_order integer not null default 0,
  event_number text,
  gender text not null default 'Alla',
  age_class text not null default 'Alla åldrar',
  distance_meters integer,
  stroke text not null,
  label text not null,
  created_at timestamptz not null default now()
);

create index if not exists competition_events_competition_idx on competition_events(competition_id, event_order);

create table if not exists competition_entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competition_calendar(id) on delete cascade,
  event_id uuid not null references competition_events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, profile_id)
);

create index if not exists competition_entries_competition_idx on competition_entries(competition_id, profile_id);
