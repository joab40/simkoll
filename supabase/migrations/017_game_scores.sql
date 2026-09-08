-- Veckans highscore för Simkolls frivilliga minispel.
create table if not exists public.game_scores (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  game_key text not null default 'simpaus',
  week_start date not null,
  score integer not null check (score >= 0 and score <= 100000),
  created_at timestamptz not null default now(),
  unique (profile_id, game_key, week_start)
);

create index if not exists game_scores_week_idx on public.game_scores (game_key, week_start, score desc);
