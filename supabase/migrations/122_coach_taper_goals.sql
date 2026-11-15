-- Coach-only, append-only snapshots. Calendar edits/deletions do not erase earlier decisions.
begin;
create table if not exists public.coach_taper_goals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid not null,
  competition_title text not null,
  competition_start date not null,
  competition_end date not null,
  priority text not null check (priority in ('A', 'B', 'C')),
  target_date date not null,
  taper_start date,
  target_events text not null default '' check (char_length(target_events) <= 200),
  note text not null default '' check (char_length(note) <= 600),
  enabled boolean not null default true,
  created_by uuid references public.coach_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  check (competition_end >= competition_start),
  check (target_date between competition_start and competition_end),
  check (taper_start is null or taper_start between target_date - 56 and target_date)
);
create index if not exists coach_taper_goals_profile_date on public.coach_taper_goals(profile_id, created_at desc, id desc);
alter table public.coach_taper_goals enable row level security;
revoke all on public.coach_taper_goals from public, anon, authenticated;
grant all on public.coach_taper_goals to service_role;
commit;
