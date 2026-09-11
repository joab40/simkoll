create table if not exists public.competition_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event text not null,
  pool text,
  result_date date not null,
  swim_time text not null,
  result_time integer,
  aqua_points integer,
  source text not null default 'tempus',
  synced_at timestamptz not null default now(),
  unique (profile_id, event, pool, result_date, swim_time)
);
create index if not exists competition_results_profile_idx on public.competition_results(profile_id, result_date desc);
