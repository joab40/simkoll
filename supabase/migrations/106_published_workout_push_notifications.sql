alter table public.push_subscriptions
  add column if not exists published_workouts boolean not null default true;
