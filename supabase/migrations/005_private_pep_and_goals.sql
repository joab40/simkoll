create table public.group_pep (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  template_key text not null check (template_key in ('group_energy', 'group_fun', 'group_great_job', 'group_thanks', 'group_spirit')),
  created_at timestamptz not null default now()
);

create table public.development_goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text not null check (char_length(description) between 1 and 2000),
  next_step text check (char_length(next_step) <= 500),
  start_date date not null default current_date,
  target_date date,
  status text not null default 'planned' check (status in ('planned', 'active', 'paused', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goal_updates (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.development_goals(id) on delete cascade,
  author_role text not null check (author_role in ('coach', 'swimmer')),
  content text not null check (char_length(content) between 1 and 1000),
  feedback_type text check (feedback_type in ('progress', 'strong_week', 'milestone', 'goal_complete')),
  points integer not null default 0 check (points in (0, 5, 10, 20)),
  created_at timestamptz not null default now()
);

create index group_pep_created_idx on public.group_pep (created_at desc);
create index development_goals_profile_idx on public.development_goals (profile_id, updated_at desc);
create index goal_updates_goal_idx on public.goal_updates (goal_id, created_at desc);

alter table public.group_pep enable row level security;
alter table public.development_goals enable row level security;
alter table public.goal_updates enable row level security;

