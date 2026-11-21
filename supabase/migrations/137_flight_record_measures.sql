begin;

alter table public.profiles
  add column if not exists flight_record_sleep_goal_minutes smallint
  check (flight_record_sleep_goal_minutes between 1 and 840);

create table if not exists public.flight_record_metrics (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  category text not null check (char_length(btrim(category)) between 1 and 40),
  unique (profile_id, id)
);
create unique index if not exists flight_record_metric_names
  on public.flight_record_metrics (profile_id, lower(btrim(category)), lower(btrim(name)));

create table if not exists public.flight_record_scores (
  profile_id uuid not null,
  metric_id uuid not null,
  activity_date date not null,
  value smallint not null check (value between 1 and 5),
  primary key (profile_id, metric_id, activity_date),
  foreign key (profile_id, metric_id) references public.flight_record_metrics(profile_id, id) on delete cascade
);
create index if not exists flight_record_score_dates
  on public.flight_record_scores (profile_id, activity_date, metric_id);

alter table public.flight_record_metrics enable row level security;
alter table public.flight_record_scores enable row level security;
revoke all on public.flight_record_metrics, public.flight_record_scores from public, anon, authenticated;
grant select, insert, update on public.flight_record_metrics, public.flight_record_scores to service_role;

-- Keep the established weight formats valid so existing profiles and releases can still be read.
create or replace function public.valid_flight_record_weights(weights jsonb)
returns boolean
language plpgsql immutable
set search_path = pg_catalog
as $$
declare
  legacy_keys constant text[] := array['speedFeeling','body','energy','sleepQuality','feeling','motivation','times'];
  standard_keys constant text[] := legacy_keys || array['passRating','setupRating'];
begin
  if weights is null then return true; end if;
  if jsonb_typeof(weights) <> 'object' then return false; end if;
  if weights ?& legacy_keys and weights - legacy_keys = '{}'::jsonb then
    return not jsonb_path_exists(weights, 'strict $.* ? (@.type() != "number" || (@ != 0 && @ != 1 && @ != 2 && @ != 3 && @ != 4 && @ != 5))');
  end if;
  if not (weights ?& standard_keys)
    or jsonb_path_exists(weights, 'strict $.* ? (@.type() != "number" || @ < 0 || @ > 100 || @.floor() != @)')
    or exists (
      select from jsonb_object_keys(weights - standard_keys - 'sleepGoal') as keys(key)
      where key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  then return false; end if;
  return (select sum(value::numeric) from jsonb_each_text(weights - 'times')) in (0, 100);
end;
$$;

alter table public.profiles
  drop constraint if exists profiles_flight_record_weights_check;
alter table public.profiles
  add constraint profiles_flight_record_weights_check
  check (public.valid_flight_record_weights(flight_record_weights));

commit;
