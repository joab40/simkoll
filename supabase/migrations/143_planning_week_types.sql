begin;

create table if not exists public.planning_week_types (
  week_start date not null check (extract(isodow from week_start) = 1),
  group_id text not null references public.training_groups(id),
  week_type text not null check (week_type in ('regular', 'build', 'high_load', 'specific', 'pre_taper', 'taper', 'recovery')),
  updated_at timestamptz not null default now(),
  primary key (week_start, group_id)
);

alter table public.planning_week_types enable row level security;
revoke all on public.planning_week_types from public, anon, authenticated;
grant select, insert, update, delete on public.planning_week_types to service_role;

commit;
