alter table public.point_events drop constraint if exists point_events_event_type_check;
alter table public.point_events add constraint point_events_event_type_check check (
  event_type in ('daily_active', 'checkin', 'kudos_sent', 'kudos_received', 'goal_progress', 'goal_complete', 'program_goal', 'weekly_goal', 'strength_weekly_goal', 'dryland_weekly_goal', 'planning_weekly_goal')
);

create table public.planned_training_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  planned_date date not null,
  session_slot text not null check (session_slot in ('morning_swim', 'afternoon_swim', 'strength', 'dryland')),
  created_at timestamptz not null default now(),
  unique (profile_id, planned_date, session_slot)
);

create index planned_training_sessions_profile_week_idx on public.planned_training_sessions (profile_id, week_start, planned_date);
alter table public.planned_training_sessions enable row level security;
