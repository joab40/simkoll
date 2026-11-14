-- Optional coach-only context for Formkollen. Every save is a new revision.
-- Analysis and graphs also work without this migration; context is then unavailable.
begin;
create table if not exists public.coach_form_observations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  observed_on date not null,
  training_pb_date date,
  competition_pb_date date,
  taper_start date,
  competition_date date,
  note text not null default '' check (char_length(note) <= 600),
  created_by uuid references public.coach_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  check (training_pb_date is null or training_pb_date between observed_on - 41 and observed_on),
  check (competition_pb_date is null or competition_pb_date between observed_on - 41 and observed_on),
  check (taper_start is null or taper_start between observed_on - 41 and observed_on),
  check (competition_date is null or competition_date between observed_on and observed_on + 180)
);
create index if not exists coach_form_observations_profile_date
  on public.coach_form_observations(profile_id, observed_on desc, created_at desc, id desc);
alter table public.coach_form_observations enable row level security;
revoke all on public.coach_form_observations from public, anon, authenticated;
-- Full service-role access also supports the existing club backup/restore flow.
-- The Formkollen API exposes insert/select only, never update/delete.
grant all on public.coach_form_observations to service_role;
commit;
