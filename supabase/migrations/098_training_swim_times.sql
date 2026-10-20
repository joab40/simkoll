-- Self-reported practice/test times are independent of official race results,
-- attendance, training volume and point events.
create table if not exists public.training_swim_times (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  result_date date not null,
  distance_meters integer not null check (distance_meters between 1 and 10000),
  stroke text not null check (stroke in ('freestyle', 'backstroke', 'breaststroke', 'butterfly', 'medley')),
  pool_length integer not null check (pool_length in (25, 50)),
  result_time integer not null check (result_time between 1 and 599999),
  kind text not null check (kind in ('training', 'test')),
  start_type text not null check (start_type in ('push', 'dive', 'water')),
  exercise text not null check (exercise in ('full', 'arms', 'legs')),
  equipment text[] not null default '{}' check (equipment <@ array['pull_buoy', 'fins', 'paddles', 'board', 'snorkel']::text[]),
  timing_method text not null check (timing_method in ('hand', 'electronic')),
  conditions text not null default '' check (char_length(conditions) <= 200),
  note text not null default '' check (char_length(note) <= 1000),
  entry_key text check (char_length(entry_key) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists training_swim_times_profile_date_idx
  on public.training_swim_times (profile_id, result_date desc, id);
alter table public.training_swim_times enable row level security;
-- Server API verifies the swimmer's own session or an active personal coach
-- account. Coaches can read, add and correct times for approved club swimmers;
-- only the swimmer can delete their own records. Server writes are audited.
