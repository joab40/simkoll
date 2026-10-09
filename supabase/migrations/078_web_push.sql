-- Each browser/device subscription belongs to exactly one personal account.
-- RLS has no client policies: only the server with its service key has access.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint_hash text not null unique,
  profile_id uuid references public.profiles(id) on delete cascade,
  coach_id uuid references public.coach_accounts(id) on delete cascade,
  subscription jsonb not null,
  coach_messages boolean not null default true,
  private_messages boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_owner_exclusive check ((profile_id is null) <> (coach_id is null))
);
create index if not exists push_profile_idx on public.push_subscriptions(profile_id);
create index if not exists push_coach_idx on public.push_subscriptions(coach_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
