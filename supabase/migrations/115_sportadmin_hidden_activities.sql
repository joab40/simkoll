-- Reversible, local suppression of individual SportAdmin occurrences.
-- Does not modify source calendars, planning rows, workouts or check-ins.
create table if not exists public.sportadmin_hidden_activities (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  calendar_key text not null check (length(calendar_key) between 1 and 2000),
  event_date date not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  hidden_at timestamptz not null default now(),
  hidden_by uuid
);
create index if not exists sportadmin_hidden_activities_date_idx on public.sportadmin_hidden_activities(event_date);
alter table public.sportadmin_hidden_activities enable row level security;
revoke all on public.sportadmin_hidden_activities from public, anon, authenticated;
grant select, insert, update, delete on public.sportadmin_hidden_activities to service_role;
notify pgrst, 'reload schema';
