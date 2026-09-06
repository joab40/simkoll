alter table public.point_events drop constraint if exists point_events_event_type_check;
alter table public.point_events add constraint point_events_event_type_check check (
  event_type in ('daily_active', 'checkin', 'kudos_sent', 'kudos_received', 'goal_progress', 'goal_complete', 'program_goal', 'weekly_goal', 'strength_weekly_goal', 'dryland_weekly_goal')
);

create table public.cross_training_goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  strength_sessions_per_week smallint not null default 0 check (strength_sessions_per_week between 0 and 7),
  dryland_sessions_per_week smallint not null default 0 check (dryland_sessions_per_week between 0 and 7),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  unique (profile_id, start_date),
  check (end_date is null or end_date >= start_date)
);

create index cross_training_goals_profile_idx on public.cross_training_goals (profile_id, start_date desc);
alter table public.cross_training_goals enable row level security;
