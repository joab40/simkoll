-- Frivilligt dagsvar, separat från genomförd träning och träningsbelastning.
create table if not exists public.profile_daily_illness (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null,
  status text,
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, activity_date),
  constraint daily_illness_values check (
    (skipped and status is null) or
    (not skipped and status is not null and status in ('none', 'mild', 'sick'))
  )
);
alter table public.profile_daily_illness enable row level security;
revoke all on public.profile_daily_illness from anon, authenticated;
grant all on public.profile_daily_illness to service_role;
create index if not exists daily_illness_date_idx on public.profile_daily_illness(activity_date);
