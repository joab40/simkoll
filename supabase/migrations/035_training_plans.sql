create table if not exists training_plans (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  activity_type text not null check (activity_type in ('swim', 'strength', 'dryland', 'competition')),
  title text not null,
  focus text,
  distance_meters integer,
  duration_minutes integer,
  target_groups text[] not null default '{ungdom_orange,ungdom_svart,junior}',
  location text,
  notes text,
  source_workout_id uuid,
  sync_status text not null default 'manual' check (sync_status in ('manual', 'linked', 'changed')),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists training_plans_date_idx on training_plans(plan_date);
