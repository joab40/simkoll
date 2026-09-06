create table public.profile_daily_activity (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null,
  last_seen_at timestamptz not null default now(),
  primary key (profile_id, activity_date)
);

create table public.workout_unlocks (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  workout_date date not null,
  unlocked_at timestamptz not null default now(),
  primary key (profile_id, workout_date)
);

create index profile_daily_activity_date_idx on public.profile_daily_activity (activity_date desc);
create index workout_unlocks_date_idx on public.workout_unlocks (workout_date desc);

alter table public.profile_daily_activity enable row level security;
alter table public.workout_unlocks enable row level security;

