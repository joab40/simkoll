-- Reflections do not create sessions, attendance or point events.
create table if not exists public.training_diary_reflections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  entry_key text not null check (char_length(entry_key) between 1 and 160),
  activity_date date not null,
  what_worked text not null default '' check (char_length(what_worked) <= 2000),
  next_time text not null default '' check (char_length(next_time) <= 2000),
  updated_at timestamptz not null default now(),
  unique (profile_id, entry_key)
);
create index if not exists training_diary_profile_date_idx
  on public.training_diary_reflections (profile_id, activity_date desc);
alter table public.training_diary_reflections enable row level security;
-- Access is through the existing server API and authenticated profile session.
