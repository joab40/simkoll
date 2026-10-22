-- En frivillig sömnkoll per simmare och aktivitetsdag. Natten hör till dagen efter.
create table if not exists public.profile_daily_sleep (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null,
  minutes integer,
  quality integer,
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (profile_id, activity_date),
  constraint daily_sleep_values check (
    (skipped and minutes is null and quality is null) or
    (not skipped and minutes is not null and minutes between 0 and 840
      and minutes % 15 = 0 and quality is not null and quality in (1,3,5))
  )
);
alter table public.profile_daily_sleep enable row level security;
revoke all on public.profile_daily_sleep from anon, authenticated;
grant all on public.profile_daily_sleep to service_role;
create index if not exists daily_sleep_date_idx on public.profile_daily_sleep(activity_date);
