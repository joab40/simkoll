create table public.coach_activity_feed (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('achievement', 'personal_best', 'strength', 'attendance', 'star', 'note')),
  profile_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  detail text check (char_length(detail) <= 1000),
  points integer check (points is null or points between 0 and 1000),
  stars smallint check (stars is null or stars between 0 and 4),
  created_by text,
  created_at timestamptz not null default now()
);

create index coach_activity_feed_created_idx on public.coach_activity_feed (created_at desc);
create index coach_activity_feed_profile_idx on public.coach_activity_feed (profile_id, created_at desc);
alter table public.coach_activity_feed enable row level security;
