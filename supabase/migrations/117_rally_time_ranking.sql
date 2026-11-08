-- Convert rally's visible ranking to time without deleting game_scores,
-- point_events, rewards or any other game's records. Run after migration 116.
begin;
create table if not exists public.rally_score_backup (
  game_score_id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  snapshot jsonb not null,
  backed_up_at timestamptz not null default now()
);
alter table public.rally_score_backup enable row level security;
revoke all on public.rally_score_backup from public, anon, authenticated;
grant select, insert, delete on public.rally_score_backup to service_role;
insert into public.rally_score_backup (game_score_id, profile_id, snapshot)
select id, profile_id, to_jsonb(g) from public.game_scores g where game_key = 'rally'
on conflict (game_score_id) do nothing;

create table if not exists public.rally_times (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  track_version text not null check (length(track_version) between 1 and 80),
  duration_ms integer not null check (duration_ms between 1 and 180000),
  time_source text not null check (time_source in ('recorded','recovered','converted')),
  achieved_at timestamptz,
  saved_at timestamptz not null default now(),
  last_played_at timestamptz,
  primary key (profile_id, track_version)
);
create index if not exists rally_times_fastest_idx on public.rally_times(duration_ms, saved_at, profile_id);
alter table public.rally_times enable row level security;
revoke all on public.rally_times from public, anon, authenticated;
grant select, insert, update, delete on public.rally_times to service_role;

-- Score's last three digits only contain a rounded time component. Original
-- rank/stage bonuses do not enter the new ranking. Estimate uncertainty: ~90 ms.
insert into public.rally_times (profile_id, track_version, duration_ms, time_source, achieved_at, last_played_at)
select distinct on (profile_id, track_version) profile_id, track_version, duration_ms, 'converted', created_at, created_at
from (
  select profile_id, 'legacy-stage-' || (score / 10000 - 1)::text as track_version,
    round(180000::numeric * (999 - score % 1000) / 999)::integer as duration_ms, created_at, id
  from public.game_scores where game_key = 'rally' and score between 10000 and 33999 and score % 10000 < 4000
) c where duration_ms between 1 and 180000
order by profile_id, track_version, duration_ms, created_at, id
on conflict (profile_id, track_version) do update set duration_ms = excluded.duration_ms, achieved_at = excluded.achieved_at
where public.rally_times.time_source = 'converted' and excluded.duration_ms < public.rally_times.duration_ms;

-- Existing server-recorded ghosts contain original millisecond times. Keep
-- these separately from unknown/older track versions, never label estimates exact.
insert into public.rally_times (profile_id, track_version, duration_ms, time_source, achieved_at, last_played_at)
select distinct on (profile_id, track_version) profile_id, track_version, duration_ms, 'recorded', achieved_at, achieved_at
from public.rally_weekly_ghosts
where duration_ms between 1 and 180000 and replay->>'version' = track_version and (replay->>'duration')::integer = duration_ms
order by profile_id, track_version, duration_ms, achieved_at
on conflict (profile_id, track_version) do update set duration_ms = excluded.duration_ms, time_source = 'recorded', achieved_at = excluded.achieved_at
where excluded.duration_ms < public.rally_times.duration_ms
  or (excluded.duration_ms = public.rally_times.duration_ms and public.rally_times.time_source <> 'recorded');

create or replace function public.keep_rally_time(p_profile_id uuid, p_duration_ms integer, p_track_version text, p_time_source text)
returns void language sql set search_path = '' as $$
  insert into public.rally_times (profile_id, track_version, duration_ms, time_source, achieved_at, last_played_at)
  values (p_profile_id, p_track_version, p_duration_ms, p_time_source,
    case when p_time_source = 'recovered' then null else now() end,
    case when p_time_source = 'recorded' then now() else null end)
  on conflict (profile_id, track_version) do update set
    duration_ms = case when excluded.duration_ms < public.rally_times.duration_ms then excluded.duration_ms else public.rally_times.duration_ms end,
    time_source = case when excluded.duration_ms < public.rally_times.duration_ms or (excluded.duration_ms = public.rally_times.duration_ms and excluded.time_source = 'recorded') then excluded.time_source else public.rally_times.time_source end,
    achieved_at = case when excluded.duration_ms < public.rally_times.duration_ms or (excluded.duration_ms = public.rally_times.duration_ms and excluded.time_source = 'recorded' and public.rally_times.achieved_at is null) then excluded.achieved_at else public.rally_times.achieved_at end,
    last_played_at = coalesce(excluded.last_played_at, public.rally_times.last_played_at);
$$;
revoke all on function public.keep_rally_time(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.keep_rally_time(uuid, integer, text, text) to service_role;
notify pgrst, 'reload schema';
commit;

-- Read-only conversion report. Original point rows remain available for rollback.
select time_source, count(*) as records, min(duration_ms) as fastest_ms
from public.rally_times group by time_source order by time_source;
