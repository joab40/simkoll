create table public.daily_workouts (
  id uuid primary key default gen_random_uuid(),
  workout_date date not null unique,
  title text not null check (char_length(title) between 1 and 80),
  content text not null check (char_length(content) between 1 and 5000),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index daily_workouts_date_idx on public.daily_workouts (workout_date desc);
alter table public.daily_workouts enable row level security;

