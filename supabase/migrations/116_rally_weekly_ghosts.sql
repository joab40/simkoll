-- One fastest full-race replay per swimmer, calendar week and track version.
-- Does not change game_scores, points, existing records or local personal ghosts.
create table if not exists public.rally_weekly_ghosts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  track_version text not null check (length(track_version) between 1 and 80),
  duration_ms integer not null check (duration_ms between 1 and 180000),
  replay jsonb not null check (
    jsonb_typeof(replay) = 'object'
    and replay->>'version' = track_version
    and (replay->>'duration')::integer = duration_ms
    and jsonb_typeof(replay->'frames') = 'array'
    and jsonb_array_length(replay->'frames') between 2 and 4000
    and octet_length(replay::text) <= 250000
  ),
  achieved_at timestamptz not null default now(),
  primary key (profile_id, week_start, track_version)
);
create index if not exists rally_weekly_ghosts_fastest_idx
  on public.rally_weekly_ghosts (week_start, track_version, duration_ms, achieved_at, profile_id);
alter table public.rally_weekly_ghosts enable row level security;
revoke all on public.rally_weekly_ghosts from public, anon, authenticated;
grant select, insert, update, delete on public.rally_weekly_ghosts to service_role;

create or replace function public.keep_weekly_rally_ghost(p_profile_id uuid, p_week_start date, p_replay jsonb)
returns void language sql set search_path = '' as $$
  insert into public.rally_weekly_ghosts (profile_id, week_start, track_version, duration_ms, replay)
  values (p_profile_id, p_week_start, p_replay->>'version', (p_replay->>'duration')::integer, p_replay)
  on conflict (profile_id, week_start, track_version) do update
    set duration_ms = excluded.duration_ms, replay = excluded.replay, achieved_at = now()
    where excluded.duration_ms < public.rally_weekly_ghosts.duration_ms;
$$;
revoke all on function public.keep_weekly_rally_ghost(uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.keep_weekly_rally_ghost(uuid, date, jsonb) to service_role;
notify pgrst, 'reload schema';
