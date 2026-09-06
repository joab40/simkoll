alter table public.point_events drop constraint if exists point_events_event_type_check;
alter table public.point_events add constraint point_events_event_type_check check (
  event_type in ('daily_active', 'checkin', 'kudos_sent', 'kudos_received', 'goal_progress', 'goal_complete', 'program_goal')
);

create table public.season_swim_goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Mitt simmål' check (char_length(title) between 1 and 80),
  target_sessions_per_week smallint not null check (target_sessions_per_week between 1 and 14),
  start_date date not null,
  end_date date not null,
  reflection text check (char_length(reflection) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.personal_training_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null check (activity_type in ('swim', 'strength', 'dryland')),
  source text not null check (source in ('checkin', 'program', 'manual')),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.training_programs (
  id uuid primary key default gen_random_uuid(),
  program_type text not null check (program_type in ('strength', 'dryland')),
  title text not null check (char_length(title) between 1 and 100),
  description text not null check (char_length(description) between 1 and 1000),
  content text not null check (char_length(content) between 1 and 5000),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.program_assignments (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (program_id, profile_id)
);

create table public.program_goals (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.program_assignments(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null check (char_length(description) between 1 and 1000),
  reward_points smallint not null check (reward_points in (5, 10, 20)),
  status text not null default 'active' check (status in ('active', 'submitted', 'approved', 'continue')),
  submitted_at timestamptz,
  approved_at timestamptz,
  coach_feedback text check (char_length(coach_feedback) <= 1000),
  created_at timestamptz not null default now()
);

create index season_swim_goals_profile_idx on public.season_swim_goals (profile_id, start_date desc);
create index personal_training_sessions_profile_idx on public.personal_training_sessions (profile_id, completed_at desc);
create unique index personal_swim_checkin_per_day_idx on public.personal_training_sessions (
  profile_id,
  ((completed_at at time zone 'Europe/Stockholm')::date)
) where activity_type = 'swim' and source = 'checkin';
create index program_assignments_profile_idx on public.program_assignments (profile_id);
create index program_goals_assignment_idx on public.program_goals (assignment_id);

alter table public.season_swim_goals enable row level security;
alter table public.personal_training_sessions enable row level security;
alter table public.training_programs enable row level security;
alter table public.program_assignments enable row level security;
alter table public.program_goals enable row level security;
